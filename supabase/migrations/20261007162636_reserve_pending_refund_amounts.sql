create or replace function public.request_payment_refund_v2(target_payment_id uuid,target_amount integer,target_reason text,target_attempt text,target_source_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_payment public.payments%rowtype; result_refund public.refunds%rowtype; target_key text; target_reference text; reserved bigint; settled bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and not is_suspended and account_status='active') then raise exception 'Compte actif requis'; end if;
 if target_attempt is null or char_length(target_attempt) not between 8 and 80 then raise exception 'Tentative invalide'; end if;
 if target_amount is null or target_amount<=0 then raise exception 'Montant invalide'; end if;
 if target_reason is null or char_length(trim(target_reason)) not between 3 and 1000 then raise exception 'Motif invalide'; end if;
 select * into current_payment from public.payments where id=target_payment_id and customer_id=auth.uid() for update;
 if not found then raise exception 'Paiement introuvable'; end if;
 target_key:=auth.uid()::text||':'||target_payment_id::text||':'||target_amount::text||':'||target_attempt;
 select * into result_refund from public.refunds where idempotency_key=target_key;
 if found then return jsonb_build_object('id',result_refund.id,'status',result_refund.status,'amount',result_refund.amount,'idempotent',true); end if;
 if current_payment.payment_status::text not in ('paid','held','available','partially_refunded') then raise exception 'Paiement non remboursable'; end if;
 select coalesce(sum(amount) filter(where status in ('requested','approved','processing')),0),coalesce(sum(amount) filter(where status='paid'),0) into reserved,settled from public.refunds where payment_id=current_payment.id;
 if target_amount>current_payment.amount-greatest(current_payment.refunded_amount,settled)-reserved then raise exception 'Montant déjà remboursé ou réservé par une demande en cours'; end if;
 target_reference:='MBR-'||replace(gen_random_uuid()::text,'-','');
 insert into public.refunds(payment_id,booking_id,requested_by,amount,reason,status,idempotency_key,internal_reference)
 values(current_payment.id,current_payment.booking_id,auth.uid(),target_amount,trim(target_reason),'requested',target_key,target_reference) returning * into result_refund;
 insert into public.financial_audit_log(request_id,actor_id,actor_kind,action,transaction_id,transaction_reference,source_ip_hash,new_state)
 values(gen_random_uuid(),auth.uid(),'customer','refund.requested',current_payment.id,target_reference,target_source_ip_hash,jsonb_build_object('refund_id',result_refund.id,'amount',target_amount,'status','requested'));
 return jsonb_build_object('id',result_refund.id,'status',result_refund.status,'amount',result_refund.amount,'internal_reference',target_reference,'idempotent',false);
end;
$$;

create or replace function public.manage_refund_request(target_refund_id uuid,target_action text,target_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_refund public.refunds%rowtype; current_payment public.payments%rowtype; payment_uuid uuid; next_status text; reserved bigint; settled bigint;
begin
 if not public.has_admin_permission('payments.refund') then raise exception 'Permission payments.refund requise'; end if;
 if char_length(trim(coalesce(target_reason,''))) not between 2 and 1000 then raise exception 'Motif requis'; end if;
 select payment_id into payment_uuid from public.refunds where id=target_refund_id;
 if payment_uuid is null then raise exception 'Remboursement introuvable'; end if;
 -- All refund creation/decision paths take the same payment lock first.
 select * into current_payment from public.payments where id=payment_uuid for update;
 select * into current_refund from public.refunds where id=target_refund_id for update;
 if current_refund.id is null then raise exception 'Remboursement introuvable'; end if;
 if target_action='approve' and current_refund.status='requested' then
  select coalesce(sum(amount) filter(where status in ('approved','processing')),0),coalesce(sum(amount) filter(where status='paid'),0) into reserved,settled from public.refunds where payment_id=payment_uuid and id<>target_refund_id;
  if current_refund.amount>current_payment.amount-greatest(current_payment.refunded_amount,settled)-reserved then raise exception 'Solde remboursable insuffisant'; end if;
  next_status:='approved';
 elsif target_action='reject' and current_refund.status='requested' then next_status:='rejected';
 elsif target_action='processing' and current_refund.status='approved' then next_status:='processing';
 else raise exception 'Transition de remboursement invalide'; end if;
 update public.refunds set status=next_status,approved_by=case when next_status='approved' then auth.uid() else approved_by end,processed_at=case when next_status='rejected' then now() else processed_at end where id=target_refund_id;
 perform public.write_admin_audit('finance.refund.'||target_action,'refunds',target_refund_id,to_jsonb(current_refund),jsonb_build_object('status',next_status),target_reason);
 return jsonb_build_object('id',target_refund_id,'status',next_status,'mode','mock');
end;
$$;
revoke all on function public.request_payment_refund_v2(uuid,integer,text,text,text),public.manage_refund_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_payment_refund_v2(uuid,integer,text,text,text),public.manage_refund_request(uuid,text,text) to authenticated;
