-- Forward-only accounting correction. No PSP activation and no historical backfill.
begin;
create schema if not exists payment_private;
revoke all on schema payment_private from public,anon,authenticated;

-- Internal callers hold the booking lock before taking the payment lock.
-- Cumulative proportional net reversal avoids per-refund rounding drift.
create or replace function payment_private.reconcile_payment_ledger(target_payment uuid,event_key text,freeze_available boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.payments%rowtype; wallet uuid; held bigint; available bigint; excess bigint; debit bigint; remaining bigint;
begin
 select * into p from public.payments where id=target_payment for update;
 if not found then raise exception 'Paiement introuvable'; end if;
 -- Historical funded rows may have no accounting entries. Record the dispute/refund
 -- without inventing money; operational reconciliation is separate from this migration.
 if not exists(select 1 from public.wallet_ledger where payment_id=p.id) then return; end if;
 select id into wallet from public.wallets where professional_id=p.professional_id and currency=p.currency;
 if wallet is null then raise exception 'Portefeuille introuvable'; end if;
 if exists(select 1 from public.wallet_ledger where payment_id=p.id and wallet_id is distinct from wallet) then
  raise exception 'Portefeuille comptable incohérent';
 end if;
 select coalesce(sum(amount)filter(where status='held'),0),coalesce(sum(amount)filter(where status='available'),0)
 into held,available from public.wallet_ledger where payment_id=p.id and wallet_id=wallet;
 if held<0 or available<0 then raise exception 'Solde comptable incohérent'; end if;
 if coalesce((select sum(amount) from public.wallet_ledger where payment_id=p.id and transaction_type='payment_held'),0)<>p.professional_net_amount
    or held+available<>p.professional_net_amount+coalesce((select sum(amount) from public.wallet_ledger where payment_id=p.id and transaction_type='refund'),0) then
  raise exception 'Solde comptable incomplet';
 end if;
 remaining := p.professional_net_amount-floor(p.professional_net_amount::numeric*p.refunded_amount/p.amount)::bigint;
 excess := held+available-remaining;
 if excess<0 then raise exception 'Solde comptable incomplet'; end if;
 debit := least(available,excess);
 if debit>0 then
  insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference)
  values(wallet,p.id,p.booking_id,'refund',-debit,'available','refund-available:'||p.id||':'||event_key);
  available:=available-debit;
 end if;
 if excess-debit>0 then
  insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference)
  values(wallet,p.id,p.booking_id,'refund',-(excess-debit),'held','refund-held:'||p.id||':'||event_key);
 end if;
 if freeze_available and available>0 then
  insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference)
  values(wallet,p.id,p.booking_id,'adjustment',-available,'available','dispute-available:'||p.id||':'||event_key),
        (wallet,p.id,p.booking_id,'adjustment',available,'held','dispute-held:'||p.id||':'||event_key);
 end if;
end;
$$;
revoke all on function payment_private.reconcile_payment_ledger(uuid,text,boolean) from public,anon,authenticated;

create or replace function public.process_verified_payment_webhook(
  target_provider text,target_provider_reference text,target_event_id text,target_status text,target_amount integer,target_currency text,
  target_payload_hash text,target_source_ip_hash text,target_occurred_at timestamptz,target_request_id uuid
) returns text language plpgsql security definer set search_path = '' as $$
declare current_payment public.payments%rowtype; target_wallet_id uuid; allowed boolean := false; target_booking uuid; settled_refund bigint;
begin
  -- Shared lock order: booking first, then payment, including the dispute trigger.
  select booking_id into target_booking from public.payments where provider=target_provider and provider_reference=target_provider_reference;
  if not found then raise exception 'Paiement introuvable'; end if;
  perform 1 from public.bookings where id=target_booking for update;
  select * into current_payment from public.payments where provider=target_provider and provider_reference=target_provider_reference for update;
  if not found then raise exception 'Paiement introuvable'; end if;
  if exists(select 1 from public.payment_events where provider_event_id=target_event_id) then return 'duplicate'; end if;
  if current_payment.amount<>target_amount or current_payment.currency<>target_currency then raise exception 'Montant ou devise incohérent'; end if;
  allowed := case current_payment.payment_status::text
    when 'pending' then target_status in ('authorized','paid','failed','cancelled')
    when 'authorized' then target_status in ('paid','failed','cancelled')
    when 'paid' then target_status in ('held','refunded','partially_refunded','disputed')
    when 'held' then target_status in ('available','refunded','partially_refunded','disputed')
    when 'available' then target_status in ('payout_pending','refunded','partially_refunded','disputed')
    when 'partially_refunded' then target_status in ('partially_refunded','refunded','disputed')
    when 'disputed' then target_status in ('partially_refunded','refunded')
    else false end;
  if not allowed then raise exception 'Transition financière interdite'; end if;
  -- target_amount remains the original invoice amount, never the refund amount.
  settled_refund := current_payment.refunded_amount;
  if target_status='partially_refunded' then
    select coalesce(sum(amount),0) into settled_refund from public.refunds where payment_id=current_payment.id and status='paid';
    if settled_refund<=current_payment.refunded_amount or settled_refund>=current_payment.amount then
      raise exception 'Montant partiel confirmé côté serveur requis';
    end if;
  elsif target_status='refunded' then settled_refund := current_payment.amount;
  end if;
  insert into public.payment_events(payment_id,event_type,previous_status,new_status,provider_event_id,provider,provider_reference,amount,currency,
    occurred_at,processed_at,signature_valid,source_ip_hash,payload_hash_sha256,outcome,raw_payload_reference)
  values(current_payment.id,'payment_status',current_payment.payment_status::text,target_status,target_event_id,target_provider,target_provider_reference,target_amount,
    target_currency,target_occurred_at,clock_timestamp(),true,target_source_ip_hash,target_payload_hash,'processed',target_payload_hash);
  update public.payments set payment_status=target_status::public.payment_status,
    paid_at=case when target_status='paid' then coalesce(paid_at,now()) else paid_at end,
    confirmed_at=case when target_status in ('paid','refunded') then now() else confirmed_at end,
    refunded_amount=settled_refund,last_provider_checked_at=now()
  where id=current_payment.id;
  if target_status='paid' then
    insert into public.wallets(professional_id,currency) values(current_payment.professional_id,current_payment.currency)
      on conflict(professional_id,currency) do update set updated_at=now() returning id into target_wallet_id;
    insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference)
      values(target_wallet_id,current_payment.id,current_payment.booking_id,'payment_held',current_payment.professional_net_amount,'held','payment:'||current_payment.id::text)
      on conflict(reference) do nothing;
    update public.bookings set status='confirmed' where id=current_payment.booking_id and status='pending';
  end if;
  if target_status in ('refunded','partially_refunded','disputed') then
    perform payment_private.reconcile_payment_ledger(current_payment.id,target_event_id,target_status='disputed');
  end if;
  insert into public.financial_audit_log(request_id,actor_kind,action,transaction_id,transaction_reference,source_ip_hash,previous_state,new_state)
  values(target_request_id,'psp','payment.webhook_processed',current_payment.id,current_payment.internal_reference,target_source_ip_hash,
    jsonb_build_object('status',current_payment.payment_status),jsonb_build_object('status',target_status,'amount',target_amount,'currency',target_currency));
  return 'processed';
end;
$$;
revoke all on function public.process_verified_payment_webhook(text,text,text,text,integer,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.process_verified_payment_webhook(text,text,text,text,integer,text,text,text,timestamptz,uuid) to service_role;

create or replace function public.release_payment_funds(target_booking_id uuid, target_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_payment public.payments%rowtype;
  target_wallet_id uuid;
begin
  perform 1 from public.bookings where id=target_booking_id and status='completed' for update;
  if not found then raise exception 'Prestation non libérable'; end if;
  select p.* into current_payment from public.payments p join public.bookings b on b.id = p.booking_id
  where p.booking_id = target_booking_id and p.payment_status in ('paid','held') and b.status = 'completed' for update of p;
  if not found then raise exception 'Paiement libérable introuvable'; end if;
  if current_payment.refunded_amount<>0 or exists(select 1 from public.refunds where payment_id=current_payment.id and status in ('requested','approved','processing','paid')) then
    raise exception 'Remboursement en cours ou effectué';
  end if;
  select id into target_wallet_id from public.wallets where professional_id = current_payment.professional_id and currency = current_payment.currency;
  if target_wallet_id is null then raise exception 'Portefeuille introuvable'; end if;
  if coalesce((select sum(amount) from public.wallet_ledger where payment_id=current_payment.id and wallet_id=target_wallet_id and status='held'),0)<>current_payment.professional_net_amount then
    raise exception 'Solde comptable incomplet';
  end if;
  insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference,metadata)
    values(target_wallet_id,current_payment.id,current_payment.booking_id,'funds_released',-current_payment.professional_net_amount,'held','release-held:' || current_payment.id::text,jsonb_build_object('actor_id',target_actor_id))
    on conflict (reference) do nothing;
  insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference,metadata)
    values(target_wallet_id,current_payment.id,current_payment.booking_id,'funds_released',current_payment.professional_net_amount,'available','release-available:' || current_payment.id::text,jsonb_build_object('actor_id',target_actor_id))
    on conflict (reference) do nothing;
  update public.payments set payment_status = 'available', confirmed_at = now() where id = current_payment.id;
end;
$$;
revoke all on function public.release_payment_funds(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_payment_funds(uuid,uuid) to service_role;

-- A booking dispute also freezes money already released, without fabricating a PSP event.
create or replace function payment_private.freeze_disputed_booking()
returns trigger language plpgsql security definer set search_path='' as $$
declare p record;
begin
 if new.status::text='disputed' and old.status is distinct from new.status then
  for p in select id from public.payments where booking_id=new.id and payment_status in ('paid','held','available','partially_refunded') order by id for update loop
   perform payment_private.reconcile_payment_ledger(p.id,'booking-dispute',true);
   update public.payments set payment_status='disputed' where id=p.id;
  end loop;
 end if;
 return new;
end;
$$;
revoke all on function payment_private.freeze_disputed_booking() from public,anon,authenticated;
create trigger freeze_disputed_booking after update of status on public.bookings
for each row execute function payment_private.freeze_disputed_booking();
commit;
