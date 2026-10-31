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

set local role authenticated;
set local request.jwt.claim.role='authenticated';
select set_config('request.jwt.claim.sub',client_id::text,true),
set_config('request.jwt.claims',jsonb_build_object('sub',client_id,'role','authenticated','aal','aal1')::text,true)
from qa_booking_context;
do $$
declare c record; p record; b public.bookings%rowtype; start_time timestamptz;
  blocked boolean; hour_value time; n integer;
begin
  select * into c from qa_booking_context;
  -- Draft provider must fail even through a direct insert.
  select * into p from qa_booking_providers where not approved;
  blocked:=false;
  begin
    insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount,currency)
    values(c.client_id,p.provider_id,p.service_id,(c.target_day+time '09:00') at time zone p.zone,
      (c.target_day+time '10:00') at time zone p.zone,'salon',1,'XOF');
  exception when check_violation or exclusion_violation or insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL: draft provider accepted a booking'; end if;

  for p in select * from qa_booking_providers where approved loop
    perform set_config('request.jwt.claim.sub',c.client_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',c.client_id,'role','authenticated')::text,true);
    -- Outside opening hours, off-grid, and an explicit blocked period.
    foreach hour_value in array array[time '06:00',time '09:10',time '13:00'] loop
      blocked:=false;
      begin
        insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount,currency)
        values(c.client_id,p.provider_id,p.service_id,(c.target_day+hour_value) at time zone p.zone,
          ((c.target_day+hour_value) at time zone p.zone)+interval '1 hour','salon',1,'XOF');
      exception when exclusion_violation then blocked:=true; end;
      if not blocked then raise exception 'FAIL: % invalid slot % accepted',p.city,hour_value; end if;
    end loop;
    start_time:=(c.target_day+time '09:00') at time zone p.zone;
    if not exists(select from public.get_available_slots(p.provider_id,p.service_id,c.target_day,1) s where s.slot_start=start_time) then
      raise exception 'FAIL: % valid slot missing',p.city;
    end if;
    -- Deliberately tampered amount, currency, duration and status.
    insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount,currency,status)
    values(c.client_id,p.provider_id,p.service_id,start_time,start_time+interval '10 minutes','salon',1,'XOF','confirmed') returning * into b;
    if b.currency<>p.currency or b.total_amount<>4500 or b.ends_at<>start_time+interval '1 hour' or b.status<>'pending' then
      raise exception 'FAIL: % server contract not authoritative',p.city;
    end if;
    if exists(select from public.get_available_slots(p.provider_id,p.service_id,c.target_day,1) s where s.slot_start=start_time) then
      raise exception 'FAIL: occupied slot still offered'; end if;
    blocked:=false;
    begin
      insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount)
      values(c.client_id,p.provider_id,p.service_id,start_time,start_time+interval '1 hour','salon',4500);
    exception when exclusion_violation then blocked:=true; end;
    if not blocked then raise exception 'FAIL: duplicate booking accepted'; end if;
    blocked:=false;
    begin update public.bookings set status='confirmed' where id=b.id;
    exception when others then blocked:=true; end;
    if not blocked then raise exception 'FAIL: client confirmed own booking'; end if;
    perform set_config('request.jwt.claim.sub',c.stranger_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',c.stranger_id,'role','authenticated')::text,true);
    select count(*) into n from public.bookings where id=b.id;
    if n<>0 then raise exception 'FAIL: unrelated client can read booking'; end if;
    update public.bookings set status='cancelled_by_client' where id=b.id;
    get diagnostics n=row_count;
    if n<>0 then raise exception 'FAIL: unrelated client can change booking'; end if;
    perform set_config('request.jwt.claim.sub',p.provider_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',p.provider_id,'role','authenticated')::text,true);
    if not exists(select from public.notifications where profile_id=p.provider_id and kind='booking_created' and data->>'booking_id'=b.id::text) then
      raise exception 'FAIL: provider internal notification missing'; end if;
    update public.bookings set status='confirmed' where id=b.id;
    get diagnostics n=row_count;
    if n<>1 then raise exception 'FAIL: provider confirmation missing'; end if;
    perform set_config('request.jwt.claim.sub',c.client_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',c.client_id,'role','authenticated')::text,true);
    if not exists(select from public.notifications where profile_id=c.client_id and kind='booking_status_changed'
      and data->>'booking_id'=b.id::text and body like '%'||p.zone||'%' and body like '%09:00%') then
      raise exception 'FAIL: local timezone confirmation notification missing'; end if;
    update public.bookings set status='cancelled_by_client',cancellation_reason='QA transaction' where id=b.id;
    if not exists(select from public.notifications where profile_id=c.client_id and data->>'booking_id'=b.id::text and data->>'status'='cancelled_by_client') then
      raise exception 'FAIL: cancellation notification missing'; end if;
    if not exists(select from public.get_available_slots(p.provider_id,p.service_id,c.target_day,1) s where s.slot_start=start_time) then
      raise exception 'FAIL: cancelled slot not released'; end if;
    insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount)
    values(c.client_id,p.provider_id,p.service_id,start_time,start_time+interval '1 hour','salon',4500);
  end loop;
end $$;
reset role;
rollback;
select 'PASS: Paris/EUR and New York/USD; draft, off-hours, off-grid, closure and duplicate refusals; authoritative price/duration/status; client/provider RLS; confirmation, local notifications, cancellation and rebooking. All fixtures rolled back. Not browser E2E or concurrent transactions.' result;
