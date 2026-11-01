-- Durcissement financier: verrouillage idempotent, audit append-only,
-- anti-rejeu, rapprochement et traitement atomique des webhooks.

alter table public.payments add column if not exists internal_reference text;
alter table public.payments add column if not exists request_fingerprint text;
alter table public.payments add column if not exists risk_status text not null default 'accepted'
  check (risk_status in ('accepted','review','blocked'));
alter table public.payments add column if not exists risk_score smallint not null default 0
  check (risk_score between 0 and 100);
alter table public.payments add column if not exists expires_at timestamptz;
alter table public.payments add column if not exists last_provider_checked_at timestamptz;
create unique index if not exists payments_internal_reference_idx on public.payments(internal_reference) where internal_reference is not null;

alter table public.payment_events add column if not exists provider text not null default 'mock';
alter table public.payment_events add column if not exists provider_reference text;
alter table public.payment_events add column if not exists amount integer;
alter table public.payment_events add column if not exists currency char(3);
alter table public.payment_events add column if not exists occurred_at timestamptz;
alter table public.payment_events add column if not exists received_at timestamptz not null default now();
alter table public.payment_events add column if not exists processed_at timestamptz;
alter table public.payment_events add column if not exists signature_valid boolean not null default false;
alter table public.payment_events add column if not exists source_ip_hash text;
alter table public.payment_events add column if not exists payload_hash_sha256 text;
alter table public.payment_events add column if not exists outcome text not null default 'processed'
  check (outcome in ('processed','duplicate','rejected'));

alter table public.refunds add column if not exists idempotency_key text;
alter table public.refunds add column if not exists internal_reference text;
alter table public.refunds add column if not exists provider_reference text;
alter table public.refunds add column if not exists failure_code text;
alter table public.refunds add column if not exists updated_at timestamptz not null default now();
create unique index if not exists refunds_idempotency_idx on public.refunds(idempotency_key) where idempotency_key is not null;
create unique index if not exists refunds_internal_reference_idx on public.refunds(internal_reference) where internal_reference is not null;

create table if not exists public.financial_audit_log (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  actor_id uuid references public.profiles(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('customer','professional','admin','system','psp')),
  action text not null,
  transaction_id uuid,
  transaction_reference text,
  source_ip_hash text,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.financial_security_events (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  event_type text not null,
  severity text not null check (severity in ('info','warning','critical')),
  actor_id uuid references public.profiles(id) on delete set null,
  transaction_reference text,
  source_ip_hash text,
  payload_hash_sha256 text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.financial_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  counter integer not null check (counter > 0),
  blocked_attempts integer not null default 0 check (blocked_attempts >= 0),
  primary key(scope,key_hash)
);

create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null check (environment in ('test','production')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  matched_count integer not null default 0,
  mismatch_count integer not null default 0,
  missing_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end > period_start)
);

create table if not exists public.reconciliation_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.reconciliation_runs(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  provider_reference text not null,
  internal_amount integer,
  provider_amount integer,
  internal_status text,
  provider_status text,
  result text not null check (result in ('matched','amount_mismatch','status_mismatch','missing_internal','missing_provider')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id,provider_reference)
);

create or replace function public.prevent_financial_record_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Un enregistrement financier immuable ne peut pas être modifié'; end;
$$;
drop trigger if exists payment_events_immutable on public.payment_events;
create trigger payment_events_immutable before update or delete on public.payment_events
for each row execute function public.prevent_financial_record_mutation();
drop trigger if exists financial_audit_immutable on public.financial_audit_log;
create trigger financial_audit_immutable before update or delete on public.financial_audit_log
for each row execute function public.prevent_financial_record_mutation();
drop trigger if exists financial_security_events_immutable on public.financial_security_events;
create trigger financial_security_events_immutable before update or delete on public.financial_security_events
for each row execute function public.prevent_financial_record_mutation();

create or replace function public.consume_financial_rate_limit(
  target_scope text, target_key_hash text, target_limit integer, target_window_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare current_row public.financial_rate_limits%rowtype; allowed boolean;
begin
  if target_limit not between 1 and 10000 or target_window_seconds not between 1 and 86400 then raise exception 'Configuration rate limit invalide'; end if;
  insert into public.financial_rate_limits(scope,key_hash,window_started_at,counter)
  values(target_scope,target_key_hash,clock_timestamp(),1)
  on conflict(scope,key_hash) do update set
    window_started_at=case when public.financial_rate_limits.window_started_at <= clock_timestamp()-make_interval(secs=>target_window_seconds) then clock_timestamp() else public.financial_rate_limits.window_started_at end,
    counter=case when public.financial_rate_limits.window_started_at <= clock_timestamp()-make_interval(secs=>target_window_seconds) then 1 else public.financial_rate_limits.counter+1 end
  returning * into current_row;
  allowed := current_row.counter <= target_limit;
  if not allowed then update public.financial_rate_limits set blocked_attempts=blocked_attempts+1 where scope=target_scope and key_hash=target_key_hash; end if;
  return allowed;
end;
$$;
revoke all on function public.consume_financial_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_financial_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.initialize_payment_v2(
  target_booking_id uuid, target_method text, target_attempt text, target_internal_reference text,
  target_request_fingerprint text, target_source_ip_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_booking public.bookings%rowtype; target_key text; target_fee integer; result_payment public.payments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_method not in ('orange_money','wave','card') then raise exception 'Méthode invalide'; end if;
  if char_length(target_attempt) not between 8 and 80 or char_length(target_request_fingerprint) <> 64 then raise exception 'Tentative invalide'; end if;
  select * into target_booking from public.bookings where id=target_booking_id and client_id=auth.uid() for update;
  if not found then raise exception 'Réservation introuvable'; end if;
  if target_booking.status <> 'pending' or target_booking.currency <> 'XOF' then raise exception 'Réservation non payable'; end if;
  target_key := auth.uid()::text||':'||target_booking.id::text||':'||target_booking.total_amount::text||':'||target_attempt;
  select * into result_payment from public.payments where idempotency_key=target_key for update;
  if found then
    if result_payment.request_fingerprint is distinct from target_request_fingerprint then raise exception 'Conflit de clé idempotente'; end if;
    return jsonb_build_object('id',result_payment.id,'payment_status',result_payment.payment_status,'provider',result_payment.provider,
      'provider_reference',result_payment.provider_reference,'internal_reference',result_payment.internal_reference,'idempotent',true);
  end if;
  if exists(select 1 from public.payments where booking_id=target_booking.id and payment_status in ('pending','authorized','paid','held','available','payout_pending')) then
    raise exception 'Un paiement actif existe déjà';
  end if;
  target_fee := round(target_booking.total_amount*0.10);
  insert into public.payments(booking_id,customer_id,professional_id,payment_method,payment_status,amount,gross_amount,platform_fee,provider_fee,
    professional_net_amount,currency,provider,idempotency_key,is_test,internal_reference,request_fingerprint,expires_at)
  values(target_booking.id,auth.uid(),target_booking.provider_id,target_method::public.payment_method,'pending',target_booking.total_amount,target_booking.total_amount,
    target_fee,0,target_booking.total_amount-target_fee,'XOF','mock',target_key,true,target_internal_reference,target_request_fingerprint,now()+interval '30 minutes')
  returning * into result_payment;
  insert into public.financial_audit_log(request_id,actor_id,actor_kind,action,transaction_id,transaction_reference,source_ip_hash,new_state)
  values(gen_random_uuid(),auth.uid(),'customer','payment.initialized',result_payment.id,result_payment.internal_reference,target_source_ip_hash,
    jsonb_build_object('status','pending','amount',result_payment.amount,'currency',result_payment.currency,'method',result_payment.payment_method));
  return jsonb_build_object('id',result_payment.id,'payment_status',result_payment.payment_status,'provider',result_payment.provider,
    'provider_reference',result_payment.provider_reference,'internal_reference',result_payment.internal_reference,'idempotent',false);
end;
$$;
revoke all on function public.initialize_payment_v2(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.initialize_payment_v2(uuid,text,text,text,text,text) to authenticated;

create or replace function public.attach_payment_provider(
  target_payment_id uuid, target_provider text, target_provider_reference text, target_is_test boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update public.payments set provider=target_provider,provider_reference=target_provider_reference,is_test=target_is_test
  where id=target_payment_id and customer_id=auth.uid() and payment_status='pending' and provider_reference is null;
  if not found then raise exception 'Paiement non rattachable'; end if;
end;
$$;
revoke all on function public.attach_payment_provider(uuid,text,text,boolean) from public,anon;
grant execute on function public.attach_payment_provider(uuid,text,text,boolean) to authenticated;

create or replace function public.fail_payment_initialization(target_payment_id uuid,target_failure_code text,target_source_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_payment public.payments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into current_payment from public.payments where id=target_payment_id and customer_id=auth.uid() for update;
  if not found or current_payment.payment_status<>'pending' or current_payment.provider_reference is not null then raise exception 'Paiement non annulable'; end if;
  update public.payments set payment_status='failed',failure_reason=left(target_failure_code,120),confirmed_at=now() where id=current_payment.id;
  insert into public.financial_audit_log(request_id,actor_id,actor_kind,action,transaction_id,transaction_reference,source_ip_hash,previous_state,new_state)
  values(gen_random_uuid(),auth.uid(),'system','payment.initialization_failed',current_payment.id,current_payment.internal_reference,target_source_ip_hash,
    jsonb_build_object('status','pending'),jsonb_build_object('status','failed','code',left(target_failure_code,120)));
end;
$$;
revoke all on function public.fail_payment_initialization(uuid,text,text) from public,anon;
grant execute on function public.fail_payment_initialization(uuid,text,text) to authenticated;

create or replace function public.process_verified_payment_webhook(
  target_provider text,target_provider_reference text,target_event_id text,target_status text,target_amount integer,target_currency text,
  target_payload_hash text,target_source_ip_hash text,target_occurred_at timestamptz,target_request_id uuid
) returns text language plpgsql security definer set search_path = '' as $$
declare current_payment public.payments%rowtype; target_wallet_id uuid; allowed boolean := false;
begin
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
    when 'partially_refunded' then target_status in ('refunded','disputed')
    else false end;
  if not allowed then raise exception 'Transition financière interdite'; end if;
  insert into public.payment_events(payment_id,event_type,previous_status,new_status,provider_event_id,provider,provider_reference,amount,currency,
    occurred_at,processed_at,signature_valid,source_ip_hash,payload_hash_sha256,outcome,raw_payload_reference)
  values(current_payment.id,'payment_status',current_payment.payment_status::text,target_status,target_event_id,target_provider,target_provider_reference,target_amount,
    target_currency,target_occurred_at,clock_timestamp(),true,target_source_ip_hash,target_payload_hash,'processed',target_payload_hash);
  update public.payments set payment_status=target_status::public.payment_status,
    paid_at=case when target_status='paid' then coalesce(paid_at,now()) else paid_at end,
    confirmed_at=case when target_status in ('paid','refunded') then now() else confirmed_at end,
    refunded_amount=case when target_status='refunded' then amount else refunded_amount end,last_provider_checked_at=now()
  where id=current_payment.id;
  if target_status='paid' then
    insert into public.wallets(professional_id,currency) values(current_payment.professional_id,current_payment.currency)
      on conflict(professional_id,currency) do update set updated_at=now() returning id into target_wallet_id;
    insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference)
      values(target_wallet_id,current_payment.id,current_payment.booking_id,'payment_held',current_payment.professional_net_amount,'held','payment:'||current_payment.id::text)
      on conflict(reference) do nothing;
    update public.bookings set status='confirmed' where id=current_payment.booking_id and status='pending';
  end if;
  insert into public.financial_audit_log(request_id,actor_kind,action,transaction_id,transaction_reference,source_ip_hash,previous_state,new_state)
  values(target_request_id,'psp','payment.webhook_processed',current_payment.id,current_payment.internal_reference,target_source_ip_hash,
    jsonb_build_object('status',current_payment.payment_status),jsonb_build_object('status',target_status,'amount',target_amount,'currency',target_currency));
  return 'processed';
end;
$$;
revoke all on function public.process_verified_payment_webhook(text,text,text,text,integer,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.process_verified_payment_webhook(text,text,text,text,integer,text,text,text,timestamptz,uuid) to service_role;

create or replace function public.request_payment_refund_v2(
  target_payment_id uuid,target_amount integer,target_reason text,target_attempt text,target_source_ip_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_payment public.payments%rowtype; result_refund public.refunds%rowtype; target_key text; target_reference text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if char_length(target_attempt) not between 8 and 80 then raise exception 'Tentative invalide'; end if;
  select * into current_payment from public.payments where id=target_payment_id and customer_id=auth.uid() for update;
  if not found then raise exception 'Paiement introuvable'; end if;
  if current_payment.payment_status::text not in ('paid','held','available','partially_refunded') then raise exception 'Paiement non remboursable'; end if;
  if target_amount<=0 or target_amount>current_payment.amount-current_payment.refunded_amount then raise exception 'Montant invalide'; end if;
  if char_length(trim(target_reason)) not between 3 and 1000 then raise exception 'Motif invalide'; end if;
  target_key := auth.uid()::text||':'||target_payment_id::text||':'||target_amount::text||':'||target_attempt;
  select * into result_refund from public.refunds where idempotency_key=target_key;
  if found then return jsonb_build_object('id',result_refund.id,'status',result_refund.status,'amount',result_refund.amount,'idempotent',true); end if;
  target_reference := 'MBR-'||replace(gen_random_uuid()::text,'-','');
  insert into public.refunds(payment_id,booking_id,requested_by,amount,reason,status,idempotency_key,internal_reference)
  values(current_payment.id,current_payment.booking_id,auth.uid(),target_amount,trim(target_reason),'requested',target_key,target_reference)
  returning * into result_refund;
  insert into public.financial_audit_log(request_id,actor_id,actor_kind,action,transaction_id,transaction_reference,source_ip_hash,new_state)
  values(gen_random_uuid(),auth.uid(),'customer','refund.requested',current_payment.id,target_reference,target_source_ip_hash,
    jsonb_build_object('refund_id',result_refund.id,'amount',target_amount,'status','requested'));
  return jsonb_build_object('id',result_refund.id,'status',result_refund.status,'amount',result_refund.amount,'internal_reference',target_reference,'idempotent',false);
end;
$$;
revoke all on function public.request_payment_refund_v2(uuid,integer,text,text,text) from public,anon;
grant execute on function public.request_payment_refund_v2(uuid,integer,text,text,text) to authenticated;

alter table public.financial_audit_log enable row level security;
alter table public.financial_security_events enable row level security;
alter table public.financial_rate_limits enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.reconciliation_items enable row level security;
create policy "financial audit admin read" on public.financial_audit_log for select using(public.is_admin());
create policy "financial security admin read" on public.financial_security_events for select using(public.is_admin());
create policy "reconciliation runs admin read" on public.reconciliation_runs for select using(public.is_admin());
create policy "reconciliation items admin read" on public.reconciliation_items for select using(public.is_admin());

insert into public.payment_providers(name,code,active,environment,configuration_reference)
values('PayDunya','paydunya',false,'test','PAYDUNYA_PRIVATE_KEY') on conflict(code) do update set name=excluded.name;

comment on table public.financial_audit_log is 'Journal financier append-only sans données carte ni secrets.';
comment on table public.reconciliation_runs is 'Rapprochement interne/PSP; aucune écriture ne modifie un solde.';
