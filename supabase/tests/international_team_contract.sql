-- Database integration acceptance ONLY in mata-beauty-global-test.
-- Synthetic fixtures are rolled back, including internal notifications and
-- welcome queues. No passwords, real identities, privileged role grants or
-- external deliveries. This does not certify browser login or pro approval.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
create temporary table qa_booking_context as
select gen_random_uuid() client_id,gen_random_uuid() stranger_id,current_date+7 target_day;
create temporary table qa_booking_providers as
select gen_random_uuid() provider_id,gen_random_uuid() service_id,* from (values
  ('Paris','FR','Europe/Paris','EUR',true),
  ('New York','US','America/New_York','USD',true),
  ('Draft','FR','Europe/Paris','EUR',false)
) v(city,country,zone,currency,approved);
grant select on qa_booking_context,qa_booking_providers to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select client_id,'qa-transaction-'||client_id||'@example.test',now(),'{"legal_accepted":true,"country_code":"FR","locale":"fr-FR"}'::jsonb from qa_booking_context
union all select stranger_id,'qa-transaction-'||stranger_id||'@example.test',now(),'{"legal_accepted":true,"country_code":"US","locale":"en-US"}'::jsonb from qa_booking_context
union all select provider_id,'qa-transaction-'||provider_id||'@example.test',now(),jsonb_build_object('legal_accepted',true,'country_code',country,'locale','fr-FR') from qa_booking_providers;
insert into public.provider_profiles(profile_id,business_name,slug,status,city,country_code,timezone,currency,service_mode)
select provider_id,'QA transaction '||city,'qa-transaction-'||provider_id,
case when approved then 'approved'::public.provider_status else 'draft'::public.provider_status end,
city,country,zone,currency,'salon' from qa_booking_providers;
insert into public.provider_services(id,provider_id,service_id,title,duration_minutes,price_amount,currency)
select p.service_id,p.provider_id,(select id from public.services where is_active limit 1),
'QA transaction',60,4500,p.currency from qa_booking_providers p;
insert into public.availability_rules(provider_id,weekday,starts_at,ends_at,slot_interval_minutes)
select provider_id,extract(dow from target_day)::smallint,'09:00','18:00',30
from qa_booking_providers cross join qa_booking_context;
insert into public.availability_exceptions(provider_id,starts_at,ends_at,is_available)
select provider_id,(target_day+time '13:00') at time zone zone,(target_day+time '14:00') at time zone zone,false
from qa_booking_providers cross join qa_booking_context;

-- Team fixtures extend the same transaction, never a real approval flow.
create temporary table qa_team_context as
select provider_id,service_id,city,zone,currency,gen_random_uuid() business_id,
  gen_random_uuid() collaborator_id,gen_random_uuid() staff_id from qa_booking_providers where approved;
grant select on qa_team_context to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select staff_id,'qa-transaction-'||staff_id||'@example.test',now(),'{"legal_accepted":true,"country_code":"FR","locale":"fr-FR"}'::jsonb from qa_team_context;
insert into public.businesses(id,owner_id,name,slug,address,city,status,country_code,timezone,currency)
select t.business_id,t.provider_id,'QA salon '||t.city,'qa-transaction-'||t.business_id,'Adresse fictive',t.city,'approved',p.country,t.zone,t.currency
from qa_team_context t join qa_booking_providers p using(provider_id);
update public.provider_services s set business_id=t.business_id from qa_team_context t where s.id=t.service_id;
insert into public.collaborators(id,business_id,profile_id,display_name)
select collaborator_id,business_id,staff_id,'QA collaborateur' from qa_team_context;
insert into public.collaborator_services(collaborator_id,provider_service_id)
select collaborator_id,service_id from qa_team_context;
insert into public.business_hours(business_id,weekday,opens_at,closes_at)
select business_id,extract(dow from target_day)::smallint,'09:00','23:59' from qa_team_context cross join qa_booking_context;
insert into public.collaborator_hours(collaborator_id,weekday,starts_at,ends_at,slot_interval_minutes)
select collaborator_id,extract(dow from target_day)::smallint,'09:00','23:59',30 from qa_team_context cross join qa_booking_context;
insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,permissions,granted_by)
select collaborator_id,business_id,staff_id,array['bookings.read','bookings.manage','services.read'],provider_id from qa_team_context;
update public.businesses b set team_booking_enabled=true from qa_team_context t where b.id=t.business_id;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $$
declare c record; t record; b public.bookings%rowtype; starts timestamptz; blocked boolean; n integer;
begin
  select * into c from qa_booking_context;
  for t in select * from qa_team_context loop
    perform set_config('request.jwt.claim.sub',c.client_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',c.client_id,'role','authenticated')::text,true);
    starts:=(c.target_day+time '22:00') at time zone t.zone;
    if not exists(select from public.get_team_available_slots(t.service_id,c.target_day,1) s where s.slot_start=starts and s.collaborator_id=t.collaborator_id) then
      raise exception 'FAIL: team slot absent in %',t.city; end if;
    insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount)
    values(c.client_id,t.provider_id,t.service_id,starts,starts+interval '1 hour','salon',1) returning * into b;
    if b.collaborator_id<>t.collaborator_id or b.business_id<>t.business_id or b.currency<>t.currency then
      raise exception 'FAIL: team assignment/currency mismatch'; end if;
    if not exists(select from public.notifications where profile_id=c.client_id and kind='booking_assignment'
      and data->>'booking_id'=b.id::text and body like '%22:00%' and body like '%'||t.zone||'%') then
      raise exception 'FAIL: assignment notification timezone incorrect in %',t.city; end if;
    perform set_config('request.jwt.claim.sub',t.staff_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',t.staff_id,'role','authenticated')::text,true);
    if not exists(select from public.current_collaborator_access() a where a.business_id=t.business_id) then
      raise exception 'FAIL: staff scope missing'; end if;
    if not exists(select from public.get_staff_booking_agenda_global(c.target_day,1) a
      where a.id=b.id and a.time_zone=t.zone) then
      raise exception 'FAIL: local-date staff agenda misses late booking in %',t.city; end if;
    if not exists(select from public.get_staff_services() s where s.id=t.service_id and s.currency=t.currency) then
      raise exception 'FAIL: staff service currency missing'; end if;
    blocked:=false;
    begin perform public.owner_list_collaborator_access(t.business_id);
    exception when insufficient_privilege then blocked:=true; end;
    if not blocked then raise exception 'FAIL: staff obtained owner-only account access'; end if;
    perform public.staff_update_booking_status(b.id,'confirmed');
    perform set_config('request.jwt.claim.sub',c.stranger_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',c.stranger_id,'role','authenticated')::text,true);
    if exists(select from public.get_staff_booking_agenda_global(c.target_day,1)) then
      raise exception 'FAIL: unrelated account sees staff agenda'; end if;
    blocked:=false;
    begin perform public.staff_update_booking_status(b.id,'in_progress');
    exception when insufficient_privilege then blocked:=true; end;
    if not blocked then raise exception 'FAIL: unrelated account changed team booking'; end if;
    perform set_config('request.jwt.claim.sub',t.provider_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',t.provider_id,'role','authenticated')::text,true);
    select count(*) into n from public.owner_list_collaborator_access(t.business_id);
    if n<>1 then raise exception 'FAIL: owner cannot manage own staff'; end if;
    perform set_config('request.jwt.claim.sub',c.client_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',c.client_id,'role','authenticated')::text,true);
    update public.bookings set status='cancelled_by_client' where id=b.id;
    if not exists(select from public.get_team_available_slots(t.service_id,c.target_day,1) s
      where s.slot_start=starts and s.collaborator_id=t.collaborator_id) then
      raise exception 'FAIL: team slot not released'; end if;
    perform set_config('request.jwt.claim.sub',t.provider_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',t.provider_id,'role','authenticated')::text,true);
    perform public.revoke_business_collaborator_access(t.business_id,t.collaborator_id);
    perform set_config('request.jwt.claim.sub',t.staff_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',t.staff_id,'role','authenticated')::text,true);
    if exists(select from public.current_collaborator_access())
      or exists(select from public.get_staff_booking_agenda_global(c.target_day,1))
      or exists(select from public.get_staff_services()) then
      raise exception 'FAIL: revoked staff retains access'; end if;
    blocked:=false;
    begin perform public.staff_update_booking_status(b.id,'confirmed');
    exception when insufficient_privilege then blocked:=true; end;
    if not blocked then raise exception 'FAIL: revoked staff can change booking'; end if;

  end loop;
end $$;
reset role;
rollback;
select 'PASS: Paris/EUR and New York/USD salons; automatic qualified assignment, local late-night agenda, assignment notification timezone, scoped staff services, staff confirmation, owner-only access, unrelated-account refusals slot release and staff revocation. All fixtures rolled back. Not browser E2E.' result;
