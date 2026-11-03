begin;

-- Only the owner or the currently assigned employee with booking management
-- access may transfer a future appointment. Availability stays authoritative.
create or replace function public.get_reassignment_candidates(target_booking_id uuid)
returns table(id uuid,display_name text,avatar_url text)
language plpgsql stable security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active') then
    raise exception 'Compte actif requis' using errcode='42501';
  end if;
  select * into booking from public.bookings b where b.id=target_booking_id;
  if booking.id is null or not coalesce(auth.uid()=booking.provider_id or
    booking_private.active_staff_permission(auth.uid(),booking.collaborator_id,'bookings.manage'),false) then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  if booking.status not in ('pending','confirmed') or booking.starts_at<=now() then return; end if;
  return query select c.id,c.display_name,c.avatar_url from public.collaborators c
    where c.business_id=booking.business_id and c.id is distinct from booking.collaborator_id
      and booking_private.can_assign(booking.provider_service_id,c.id,booking.starts_at,booking.ends_at,booking.id)
    order by c.display_name;
end $$;

create or replace function public.reassign_booking_collaborator(target_booking_id uuid,target_collaborator_id uuid,reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active') then
    raise exception 'Compte actif requis' using errcode='42501';
  end if;
  select * into booking from public.bookings where id=target_booking_id;
  if booking.id is null or not coalesce(auth.uid()=booking.provider_id or
    booking_private.active_staff_permission(auth.uid(),booking.collaborator_id,'bookings.manage'),false) then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  -- Same lock order as booking creation and calendar edits; recheck the current
  -- assignee after locking so a stale employee cannot transfer it a second time.
  perform pg_advisory_xact_lock(hashtextextended(booking.provider_id::text,8108));
  select * into booking from public.bookings where id=target_booking_id for update;
  if booking.id is null or not coalesce(auth.uid()=booking.provider_id or
    booking_private.active_staff_permission(auth.uid(),booking.collaborator_id,'bookings.manage'),false) then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  if booking.status not in ('pending','confirmed') or booking.starts_at<=now() then
    raise exception 'Seul un rendez-vous à venir peut être réattribué' using errcode='42501';
  end if;
  if booking.collaborator_id=target_collaborator_id then return jsonb_build_object('id',booking.id,'changed',false); end if;
  if reason is null or char_length(trim(reason)) not between 3 and 240 then raise exception 'Motif requis (3 à 240 caractères)'; end if;
  if target_collaborator_id is null or not exists(select 1 from public.collaborators c
    where c.id=target_collaborator_id and c.business_id=booking.business_id
      and booking_private.can_assign(booking.provider_service_id,c.id,booking.starts_at,booking.ends_at,booking.id)) then
    raise exception 'Collaborateur non qualifié ou créneau indisponible' using errcode='23P01';
  end if;
  update public.bookings set collaborator_id=target_collaborator_id,assignment_reason=trim(reason) where id=booking.id;
  return jsonb_build_object('id',booking.id,'changed',true);
end $$;

-- Extend the existing trigger guards without weakening immutable booking data,
-- payment checks, administrator permissions or status transition rules.
do $$ declare definition text; old_guard text; new_guard text; begin
  definition:=pg_get_functiondef('public.protect_salon_booking_contract()'::regprocedure);
  old_guard:='auth.uid() is distinct from old.provider_id or old.status not in (''pending'',''confirmed'') or old.starts_at<=now()';
  new_guard:='not coalesce(auth.uid()=old.provider_id or booking_private.active_staff_permission(auth.uid(),old.collaborator_id,''bookings.manage''),false) or new.status is distinct from old.status or old.status not in (''pending'',''confirmed'') or old.starts_at<=now()';
  if position(old_guard in definition)=0 then raise exception 'Unexpected salon assignment guard'; end if;
  execute replace(definition,old_guard,new_guard);

  definition:=pg_get_functiondef('public.validate_booking_update()'::regprocedure);
  old_guard:='if auth.uid()=old.provider_id and new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;';
  new_guard:='if new.status=old.status and new.collaborator_id is distinct from old.collaborator_id and (auth.uid()=old.provider_id or booking_private.active_staff_permission(auth.uid(),old.collaborator_id,''bookings.manage'')) then return new; end if;';
  if position(old_guard in definition)=0 then raise exception 'Unexpected booking update guard'; end if;
  execute replace(definition,old_guard,new_guard);
end $$;

revoke all on function public.get_reassignment_candidates(uuid),public.reassign_booking_collaborator(uuid,uuid,text) from public,anon;
grant execute on function public.get_reassignment_candidates(uuid),public.reassign_booking_collaborator(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
