begin;
-- Existing reminders use appointment_reminder, not booking_reminder.
-- Extend the canonical inbox so staff and salon owners also see changes.
create or replace function public.enqueue_web_push() returns trigger language plpgsql security definer set search_path='' as $$
declare appointment public.bookings; recipient record;
begin
 if new.kind in ('booking_created','booking_status_changed','booking_assignment','booking_reminder','appointment_reminder') then
  insert into public.web_push_deliveries(notification_id,subscription_id)
  select new.id,s.id from public.web_push_subscriptions s join public.profiles p on p.id=s.profile_id
  where s.profile_id=new.profile_id and not p.is_suspended and p.account_status<>'deleted';
 end if;
 if new.kind in ('booking_created','booking_status_changed','appointment_reminder') and coalesce(new.data->>'booking_id','') ~* '^[0-9a-f-]{36}$' then
  select * into appointment from public.bookings where id=(new.data->>'booking_id')::uuid;
  -- Only fan out once, from the provider's event, never recursively.
  if appointment.id is not null and new.profile_id=appointment.provider_id then
   for recipient in
    select distinct on (person.id) person.id,targets.prefix from (
     select c.profile_id as id,'/staff'::text as prefix from public.collaborators c
      where c.id=appointment.collaborator_id and c.is_active and c.archived_at is null
     union all
     select b.owner_id,'/salon' from public.businesses b where b.id=appointment.business_id
    ) targets join public.profiles person on person.id=targets.id
    where person.id not in (appointment.provider_id,appointment.client_id) and not person.is_suspended and person.account_status<>'deleted'
    order by person.id,targets.prefix
   loop
    insert into public.notifications(profile_id,kind,title,body,data)
    values(recipient.id,new.kind,new.title,new.body,new.data||jsonb_build_object('href',recipient.prefix||'/bookings#booking-'||appointment.id));
   end loop;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.enqueue_web_push() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
