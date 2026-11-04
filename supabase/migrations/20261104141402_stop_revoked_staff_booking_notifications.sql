begin;
create function booking_private.staff_booking_notification_recipient(target_collaborator uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select c.profile_id from public.collaborators c
 join booking_private.collaborator_access a on a.collaborator_id=c.id and a.business_id=c.business_id and a.profile_id=c.profile_id
 join public.profiles p on p.id=c.profile_id join public.businesses b on b.id=c.business_id
 where c.id=target_collaborator and c.is_active and c.archived_at is null and b.archived_at is null
 and a.revoked_at is null and 'bookings.read'=any(a.permissions) and p.account_status='active' and not p.is_suspended;
$$;
revoke all on function booking_private.staff_booking_notification_recipient(uuid) from public,anon,authenticated;
do $migration$ declare definition text; target text; old_select text;begin
 foreach target in array array['booking_private.record_assignment()','booking_private.notify_staff_booking_status()'] loop
  select pg_get_functiondef(target::regprocedure) into definition;
  old_select:=case when target='booking_private.record_assignment()' then 'select c.profile_id into employee_profile from public.collaborators c where c.id=new.collaborator_id and c.is_active and c.archived_at is null;' else 'select c.profile_id into employee from public.collaborators c where c.id=new.collaborator_id and c.is_active and c.archived_at is null;' end;
  if position(old_select in definition)=0 then raise exception 'Unexpected staff notification definition';end if;
  definition:=replace(definition,old_select,case when target='booking_private.record_assignment()' then 'select booking_private.staff_booking_notification_recipient(new.collaborator_id) into employee_profile;' else 'select booking_private.staff_booking_notification_recipient(new.collaborator_id) into employee;' end);
  execute definition;
 end loop;
end $migration$;
notify pgrst,'reload schema';
commit;
