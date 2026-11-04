begin;
-- Keep the existing contract/status guard and add a narrowly checked time-only
-- operation. No session flag or user metadata can authorize this change.
create function booking_private.owner_booking_slot_available(target uuid, new_start timestamptz,new_end timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (b.provider_id=auth.uid() or exists(select 1 from public.businesses s where s.id=b.business_id and s.owner_id=auth.uid()))
 and case when b.collaborator_id is not null then booking_private.can_assign(b.provider_service_id,b.collaborator_id,new_start,new_end,b.id)
 else exists(select 1 from booking_private.independent_slots(b.provider_id,b.provider_service_id,(new_start at time zone booking_private.provider_timezone(b.provider_id,b.business_id))::date,1) s where s.slot_start=new_start) end
 from public.bookings b where b.id=target),false);
$$;
revoke all on function booking_private.owner_booking_slot_available(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function booking_private.owner_booking_slot_available(uuid,timestamptz,timestamptz) to authenticated;
do $patch$ declare definition text; original text; begin
 select pg_get_functiondef('public.validate_booking_update()'::regprocedure) into original;
 definition:=replace(original,'or new.provider_service_id is distinct from old.provider_service_id or new.starts_at is distinct from old.starts_at','or new.provider_service_id is distinct from old.provider_service_id');
 definition:=replace(definition,'or new.ends_at is distinct from old.ends_at or new.location_mode is distinct from old.location_mode','or new.location_mode is distinct from old.location_mode');
 definition:=replace(definition,'  if public.has_admin_permission(''bookings.update'') then return new; end if;', $code$
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and not p.is_suspended)
      or not (old.provider_id=auth.uid() or exists(select 1 from public.businesses b where b.id=old.business_id and b.owner_id=auth.uid() and b.archived_at is null))
      or old.status not in ('pending','confirmed') or new.status<>old.status or old.starts_at<=now() or new.starts_at<=now()
      or new.ends_at-new.starts_at<>old.ends_at-old.starts_at or new.collaborator_id is distinct from old.collaborator_id then
      raise exception 'Déplacement non autorisé' using errcode='42501';
    end if;
    if not booking_private.owner_booking_slot_available(old.id,new.starts_at,new.ends_at) then
      raise exception 'Créneau indisponible' using errcode='23P01';
    end if;
    return new;
  end if;
  if public.has_admin_permission('bookings.update') then return new; end if;
$code$);
 if definition=original or position('or new.starts_at is distinct from old.starts_at' in definition)>0 then raise exception 'Unexpected booking guard; patch cancelled';end if;
 execute definition;
end $patch$;
create function public.reschedule_owned_booking(target_booking_id uuid,target_starts_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare b public.bookings%rowtype;
begin
 select * into b from public.bookings where id=target_booking_id;
 perform pg_advisory_xact_lock(hashtextextended(b.provider_id::text,8108));
 select * into b from public.bookings where id=target_booking_id for update;
 if b.id is null or not coalesce(b.provider_id=auth.uid() or exists(select 1 from public.businesses s where s.id=b.business_id and s.owner_id=auth.uid()),false) then raise exception 'Accès refusé' using errcode='42501';end if;
 update public.bookings set starts_at=target_starts_at,ends_at=target_starts_at+(b.ends_at-b.starts_at) where id=b.id;
end $$;
revoke all on function public.reschedule_owned_booking(uuid,timestamptz) from public,anon;
grant execute on function public.reschedule_owned_booking(uuid,timestamptz) to authenticated;
create function public.get_my_team_directory()
returns table(business_id uuid,collaborator_id uuid,display_name text,title text)
language sql stable security definer set search_path='' as $$
 select c.business_id,c.id,c.display_name,c.title from public.collaborators c
 where c.is_active and c.archived_at is null and exists(select 1 from public.current_collaborator_access() a where a.business_id=c.business_id);
$$;
revoke all on function public.get_my_team_directory() from public,anon;
grant execute on function public.get_my_team_directory() to authenticated;
notify pgrst,'reload schema';
commit;
