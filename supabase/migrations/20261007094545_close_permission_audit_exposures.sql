-- Internal helpers must not be callable directly through the Data API.
-- Authorized SECURITY DEFINER workflows retain their owner's EXECUTE rights.
revoke execute on function public.write_admin_audit(text,text,uuid,jsonb,jsonb,text) from public,anon,authenticated;
revoke execute on function public.compute_provider_launch_completeness(uuid) from public,anon,authenticated;
-- Retire the unused initializer, which predates the active-payment lock in v2.
revoke execute on function public.initialize_payment(uuid,text,text,text) from public,anon,authenticated;
revoke execute on function public.attach_payment_provider(uuid,text,text,boolean) from public,anon,authenticated;

-- Only the authenticated API server may attach a checkout returned by its gateway.
-- The caller identity comes from getUser(), never from request JSON.
create or replace function public.attach_payment_provider_server(
  target_payment_id uuid, target_customer_id uuid, target_provider text,
  target_provider_reference text, target_is_test boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_customer_id is null or target_is_test is distinct from true
    or target_provider is null or target_provider not in ('mock','paydunya')
    or char_length(trim(coalesce(target_provider_reference,''))) not between 1 and 500
  then raise exception 'Rattachement de paiement test invalide' using errcode='22023'; end if;
  update public.payments set provider=target_provider,
    provider_reference=target_provider_reference,is_test=true
  where id=target_payment_id and customer_id=target_customer_id
    and payment_status='pending' and provider_reference is null and is_test;
  if not found then raise exception 'Paiement non rattachable' using errcode='42501'; end if;
end; $$;
revoke all on function public.attach_payment_provider_server(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.attach_payment_provider_server(uuid,uuid,text,text,boolean) to service_role;

-- A ticket participant can read public replies; only support can read/write notes.
alter policy "support messages participants read" on public.support_messages
using (
  exists(select 1 from public.support_tickets ticket where ticket.id=ticket_id
    and ((ticket.requester_id=auth.uid() and not is_internal)
      or public.has_admin_permission('support.manage')))
);
alter policy "support messages participants insert" on public.support_messages
with check (
  sender_id=auth.uid() and exists(select 1 from public.support_tickets ticket where ticket.id=ticket_id
    and ((ticket.requester_id=auth.uid() and not is_internal)
      or public.has_admin_permission('support.manage')))
);
