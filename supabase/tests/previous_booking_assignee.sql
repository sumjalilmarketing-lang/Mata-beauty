-- Run on mata-beauty-global-test. Everything, including deliveries, rolls back.
begin;
create temporary table assignment_probe (
  id uuid, collaborator_id uuid, client_id uuid, provider_id uuid
);
create trigger assignment_probe_notice after update of collaborator_id on assignment_probe
for each row execute function booking_private.notify_previous_booking_assignee();
do $$
declare business uuid; owner uuid; staff uuid; client uuid; previous_member uuid; next_member uuid;
  appointment uuid:=gen_random_uuid(); notice_count integer;
begin
  select id,owner_id into strict business,owner from public.businesses limit 1;
  select id into strict staff from public.profiles where id<>owner and not is_suspended and account_status='active' limit 1;
  select id into strict client from public.profiles where id not in (owner,staff) limit 1;
  insert into public.collaborators(business_id,profile_id,display_name)
    values(business,null,'QA previous assignee') returning id into previous_member;
  -- Use a staff profile without altering an existing employee's account link.
  select id into next_member from public.collaborators where business_id=business and profile_id=staff;
  if next_member is null then
    insert into public.collaborators(business_id,profile_id,display_name)
      values(business,staff,'QA linked assignee') returning id into next_member;
  end if;
  insert into assignment_probe values(appointment,next_member,client,owner);
  update assignment_probe set collaborator_id=collaborator_id;
  if exists(select from public.notifications where data->>'booking_id'=appointment::text) then
    raise exception 'Unchanged assignment produced a notification'; end if;
  update assignment_probe set collaborator_id=previous_member;
  select count(*) into notice_count from public.notifications where data->>'booking_id'=appointment::text;
  if notice_count<>1 or not exists(select from public.notifications
    where data->>'booking_id'=appointment::text and profile_id=staff and kind='booking_assignment'
    and data->>'assignment_removed'='true' and data->>'href'='/staff/bookings') then
    raise exception 'Previous employee notification missing or sent to another participant'; end if;
  update assignment_probe set collaborator_id=null;
  if (select count(*) from public.notifications where data->>'booking_id'=appointment::text)<>1 then
    raise exception 'Unlinked employee produced an extra notification'; end if;
  update assignment_probe set collaborator_id=next_member;
  update assignment_probe set collaborator_id=null;
  if (select count(*) from public.notifications where data->>'booking_id'=appointment::text)<>2 then
    raise exception 'Assignment removal did not notify the linked employee'; end if;
end $$;
rollback;
select 'PASS: unchanged assignment, reassignment, unlinked employee and removal; targeted notifications; all changes rolled back' result;
