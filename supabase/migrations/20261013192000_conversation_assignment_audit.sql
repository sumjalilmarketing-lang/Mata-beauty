begin;

create or replace function public.owner_get_conversation_assignment(target_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare result jsonb;
begin
  select jsonb_build_object(
    'booking_id',b.id,'business_id',b.business_id,'collaborator_id',b.collaborator_id,
    'collaborators',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name) order by c.display_name)
      from public.collaborators c join booking_private.collaborator_access a on a.collaborator_id=c.id
      where c.business_id=b.business_id and c.is_active and c.archived_at is null
        and 'messages.read'=any(a.staff_permissions)
        and (c.id=b.collaborator_id or booking_private.can_assign(b.provider_service_id,c.id,b.starts_at,b.ends_at,b.id))), '[]'::jsonb)
  ) into result
  from public.conversations conv
  join public.bookings b on b.id=conv.booking_id or b.conversation_id=conv.id
  join public.businesses business on business.id=b.business_id and business.owner_id=auth.uid() and business.is_active and business.archived_at is null
  where conv.id=target_conversation_id and auth.uid() is not null
    and b.provider_id=auth.uid()
  order by b.created_at desc limit 1;
  if result is null then raise exception 'Accès propriétaire requis ou conversation sans rendez-vous salon' using errcode='42501'; end if;
  return result;
end $function$;

create or replace function public.owner_assign_conversation(target_conversation_id uuid,target_collaborator_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare selected_booking public.bookings%rowtype; previous_id uuid; result jsonb;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
  select b.* into selected_booking
    from public.conversations conv join public.bookings b on b.id=conv.booking_id or b.conversation_id=conv.id
    join public.businesses business on business.id=b.business_id and business.owner_id=auth.uid() and business.is_active and business.archived_at is null
    where conv.id=target_conversation_id and b.provider_id=auth.uid() order by b.created_at desc limit 1 for update of b;
  if selected_booking.id is null then raise exception 'Conversation salon inaccessible' using errcode='42501'; end if;
  if target_collaborator_id is null or not exists (
    select 1 from public.collaborators c join booking_private.collaborator_access a on a.collaborator_id=c.id
    where c.id=target_collaborator_id and c.business_id=selected_booking.business_id and c.is_active and c.archived_at is null
      and 'messages.read'=any(a.staff_permissions)
      and booking_private.can_assign(selected_booking.provider_service_id,c.id,selected_booking.starts_at,selected_booking.ends_at,selected_booking.id)
  ) then raise exception 'Collaborateur non autorisé à consulter les messages' using errcode='42501'; end if;
  previous_id:=selected_booking.collaborator_id;
  if previous_id is not distinct from target_collaborator_id then return jsonb_build_object('ok',true,'changed',false,'collaborator_id',previous_id); end if;
  -- Reuse the established booking workflow: it validates owner/provider access,
  -- schedule conflicts, assignment audit rows and client notifications.
  result:=public.reassign_booking_collaborator(selected_booking.id,target_collaborator_id,'Réaffectation depuis les messages');
  if coalesce((result->>'changed')::boolean,false) is not true then return jsonb_build_object('ok',true,'changed',false,'collaborator_id',previous_id); end if;
  return jsonb_build_object('ok',true,'changed',true,'collaborator_id',target_collaborator_id);
end $function$;

revoke all on function public.owner_get_conversation_assignment(uuid) from public,anon;
grant execute on function public.owner_get_conversation_assignment(uuid) to authenticated;
revoke all on function public.owner_assign_conversation(uuid,uuid) from public,anon;
grant execute on function public.owner_assign_conversation(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
