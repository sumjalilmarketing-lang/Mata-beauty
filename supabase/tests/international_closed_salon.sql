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


create temporary table qa_closed_salon as select gen_random_uuid() business_id;
insert into public.businesses(id,owner_id,name,slug,address,city,status,country_code,timezone,currency)
select business_id,p.provider_id,'QA salon fermé','qa-transaction-'||business_id,'Adresse fictive',p.city,'approved',p.country,p.zone,p.currency
from qa_closed_salon cross join qa_booking_providers p where p.city='Paris';
update public.provider_services s set business_id=b.business_id from qa_closed_salon b,qa_booking_providers p where s.id=p.service_id and p.city='Paris';
insert into public.business_hours(business_id,weekday,is_closed)
select business_id,extract(dow from target_day)::smallint,true from qa_closed_salon cross join qa_booking_context;

update public.provider_services set archived_at=now() where id=(select service_id from qa_booking_providers where city='New York');
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $$
declare c record; p record; blocked boolean;
begin
  select * into c from qa_booking_context;
  perform set_config('request.jwt.claim.sub',c.client_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.client_id,'role','authenticated')::text,true);
  for p in select * from qa_booking_providers where approved loop
    if exists(select from public.get_available_slots(p.provider_id,p.service_id,c.target_day,1)) then
      raise exception 'FAIL: closed salon/archived listing visible'; end if;
    blocked:=false;
    begin
      insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount)
      values(c.client_id,p.provider_id,p.service_id,(c.target_day+time '09:00') at time zone p.zone,
        (c.target_day+time '10:00') at time zone p.zone,'salon',4500);
    exception when check_violation or exclusion_violation then blocked:=true; end;
    if not blocked then raise exception 'FAIL: closed salon/archived booking accepted'; end if;
  end loop;
end $$;
reset role;
rollback;
select 'PASS: closed non-team salon and archived service absent from public availability and rejected on direct authenticated insert. All fixtures rolled back.' result;
