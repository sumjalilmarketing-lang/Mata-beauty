-- Preserve existing invitations, roles and permissions. No bearer token is stored.
create or replace function public.record_business_invitation_receipt(target_invitation_id uuid, target_message_id text)
returns void language plpgsql security definer set search_path='' as $$
declare business uuid;
begin
  if target_message_id is null or target_message_id !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'Reçu invalide' using errcode='22023';
  end if;
  select i.business_id into business from public.business_invitations i
    where i.id=target_invitation_id and i.sent_at is not null
      and booking_private.is_active_business_owner(i.business_id);
  if business is null then raise exception 'Invitation inaccessible' using errcode='42501'; end if;
  update booking_private.business_invitation_events
    set details=coalesce(details,'{}'::jsonb)||jsonb_build_object('resend_email_id',target_message_id,'delivery_state','provider_accepted')
    where invitation_id=target_invitation_id and event_type='delivery_confirmed';
  if not found then raise exception 'Reçu d’envoi absent' using errcode='42501'; end if;
end; $$;
revoke all on function public.record_business_invitation_receipt(uuid,text) from public,anon;
grant execute on function public.record_business_invitation_receipt(uuid,text) to authenticated;
