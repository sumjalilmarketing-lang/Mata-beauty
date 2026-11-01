begin;

-- Assignment notifications use the establishment timezone, like confirmations.
create or replace function booking_private.record_assignment() returns trigger language plpgsql security definer set search_path='' as $$
declare previous_id uuid; previous_name text; employee_profile uuid; message text; zone text;
begin
  if tg_op='UPDATE' then
    if new.collaborator_id is not distinct from old.collaborator_id then return new; end if;
    previous_id:=old.collaborator_id; previous_name:=old.collaborator_name;
  elsif new.collaborator_id is null then return new; end if;
  insert into public.booking_assignments(booking_id,previous_collaborator_id,collaborator_id,previous_name,collaborator_name,reason,actor_id)
    values(new.id,previous_id,new.collaborator_id,previous_name,new.collaborator_name,new.assignment_reason,auth.uid());
  zone:=coalesce(booking_private.provider_timezone(new.provider_id,new.business_id),'UTC');
  message:='Votre rendez-vous sera assuré par '||new.collaborator_name||'. '||to_char(new.starts_at at time zone zone,'DD/MM/YYYY à HH24:MI')||' ('||zone||')'||case when new.status='pending' then ' — demande en attente de confirmation.' else '.' end;
  insert into public.notifications(profile_id,kind,title,body,data) values(new.client_id,'booking_assignment','Votre professionnel',message,jsonb_build_object('booking_id',new.id,'collaborator_id',new.collaborator_id,'href','/app/bookings#booking-'||new.id));
  if tg_op='UPDATE' then insert into public.notifications(profile_id,kind,title,body,data) values(new.provider_id,'booking_assignment','Affectation mise à jour',message,jsonb_build_object('booking_id',new.id,'href','/pro/bookings#booking-'||new.id)); end if;
  select c.profile_id into employee_profile from public.collaborators c where c.id=new.collaborator_id and c.is_active and c.archived_at is null;
  if employee_profile is not null and employee_profile not in (new.client_id,new.provider_id) then
    insert into public.notifications(profile_id,kind,title,body,data) values(employee_profile,'booking_assignment','Nouvelle prestation prévue',message,jsonb_build_object('booking_id',new.id,'href','/staff/bookings#booking-'||new.id));
  end if;
  return new;
end $$;
revoke all on function booking_private.record_assignment() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
