begin;

-- record_assignment already informs the client, owner and new employee.
-- Complete that event with a notice to the employee losing the appointment.
create function booking_private.notify_previous_booking_assignee() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous_profile uuid; next_profile uuid;
begin
  if old.collaborator_id is null or new.collaborator_id is not distinct from old.collaborator_id then return new; end if;
  select c.profile_id into previous_profile from public.collaborators c
    join public.profiles p on p.id=c.profile_id
    where c.id=old.collaborator_id and not p.is_suspended and p.account_status<>'deleted';
  select c.profile_id into next_profile from public.collaborators c where c.id=new.collaborator_id;
  if previous_profile is not null and previous_profile not in (new.client_id,new.provider_id)
    and previous_profile is distinct from next_profile then
    insert into public.notifications(profile_id,kind,title,body,data)
    values(previous_profile,'booking_assignment','Rendez-vous retiré de votre planning',
      'Un rendez-vous a été réattribué et ne figure plus dans votre planning.',
      jsonb_build_object('booking_id',new.id,'assignment_removed',true,'href','/staff/bookings'));
  end if;
  return new;
end $$;
revoke all on function booking_private.notify_previous_booking_assignee() from public,anon,authenticated;
create trigger bookings_previous_assignee_notified after update of collaborator_id on public.bookings
for each row execute function booking_private.notify_previous_booking_assignee();

notify pgrst,'reload schema';
commit;
