create or replace function public.initialize_payment(
  target_booking_id uuid, target_method text, target_attempt text, target_provider_reference text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_booking public.bookings%rowtype;
  target_key text;
  target_fee integer;
  result_payment public.payments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_method not in ('orange_money','wave','card') then raise exception 'Méthode invalide'; end if;
  if char_length(target_attempt) < 8 or char_length(target_attempt) > 80 then raise exception 'Tentative invalide'; end if;
  select * into target_booking from public.bookings where id = target_booking_id and client_id = auth.uid() for update;
  if not found then raise exception 'Réservation introuvable'; end if;
  if target_booking.status <> 'pending' or target_booking.currency <> 'XOF' then raise exception 'Réservation non payable'; end if;
  target_key := auth.uid()::text || ':' || target_booking.id::text || ':' || target_booking.total_amount::text || ':' || target_attempt;
  select * into result_payment from public.payments where idempotency_key = target_key;
  if found then return jsonb_build_object('id',result_payment.id,'payment_status',result_payment.payment_status,'provider_reference',result_payment.provider_reference,'idempotent',true); end if;
  target_fee := round(target_booking.total_amount * 0.10);
  insert into public.payments(
    booking_id,customer_id,professional_id,payment_method,payment_status,amount,gross_amount,
    platform_fee,provider_fee,professional_net_amount,currency,provider,provider_reference,idempotency_key,is_test
  ) values (
    target_booking.id,auth.uid(),target_booking.provider_id,target_method::public.payment_method,'pending',target_booking.total_amount,target_booking.total_amount,
    target_fee,0,target_booking.total_amount-target_fee,'XOF','mock',target_provider_reference,target_key,true
  ) returning * into result_payment;
  return jsonb_build_object('id',result_payment.id,'payment_status',result_payment.payment_status,'provider_reference',result_payment.provider_reference,'idempotent',false);
end;
$$;
revoke all on function public.initialize_payment(uuid,text,text,text) from public, anon;
grant execute on function public.initialize_payment(uuid,text,text,text) to authenticated;

create or replace function public.request_payment_refund(target_payment_id uuid, target_amount integer, target_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_payment public.payments%rowtype; result_refund public.refunds%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into current_payment from public.payments where id = target_payment_id and customer_id = auth.uid() for update;
  if not found then raise exception 'Paiement introuvable'; end if;
  if current_payment.payment_status::text not in ('paid','held','available','partially_refunded') then raise exception 'Paiement non remboursable'; end if;
  if target_amount <= 0 or target_amount > current_payment.amount-current_payment.refunded_amount then raise exception 'Montant invalide'; end if;
  if char_length(trim(target_reason)) not between 3 and 1000 then raise exception 'Motif invalide'; end if;
  insert into public.refunds(payment_id,booking_id,requested_by,amount,reason,status)
    values(current_payment.id,current_payment.booking_id,auth.uid(),target_amount,trim(target_reason),'requested') returning * into result_refund;
  return jsonb_build_object('id',result_refund.id,'status',result_refund.status,'amount',result_refund.amount,'created_at',result_refund.created_at);
end;
$$;
revoke all on function public.request_payment_refund(uuid,integer,text) from public, anon;
grant execute on function public.request_payment_refund(uuid,integer,text) to authenticated;

create or replace function public.confirm_service_and_release(target_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_booking public.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into target_booking from public.bookings where id = target_booking_id and (client_id = auth.uid() or provider_id = auth.uid());
  if not found or target_booking.status <> 'completed' then raise exception 'Prestation non libérable'; end if;
  perform public.release_payment_funds(target_booking_id,auth.uid());
end;
$$;
revoke all on function public.confirm_service_and_release(uuid) from public, anon;
grant execute on function public.confirm_service_and_release(uuid) to authenticated;
