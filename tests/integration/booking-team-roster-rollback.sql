-- Integration acceptance on mata-beauty-global-test only. Fixtures and all
-- notification queues roll back; no real salon, user or booking is modified.
begin;
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role"}';
create temporary table qa_transfer as select gen_random_uuid() owner_id,gen_random_uuid() client_id,
  gen_random_uuid() staff_id,gen_random_uuid() colleague_id,gen_random_uuid() stranger_id,
  gen_random_uuid() business_id,gen_random_uuid() outside_business_id,gen_random_uuid() service_id,
  gen_random_uuid() assigned_id,gen_random_uuid() candidate_id,gen_random_uuid() busy_id,
  gen_random_uuid() unqualified_id,gen_random_uuid() outside_id,gen_random_uuid() booking_id,
  ((current_date+7)+time '10:00') at time zone 'Africa/Dakar' starts_at;
grant select on qa_transfer to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
select id,'qa-transfer-'||id||'@example.test',now(),'{"legal_accepted":true,"country_code":"SN","locale":"fr-FR"}'::jsonb,
  '{"qa_suppress_email":true}'::jsonb from qa_transfer cross join lateral
  unnest(array[owner_id,client_id,staff_id,colleague_id,stranger_id]) id;
insert into public.provider_profiles(profile_id,business_name,slug,status,city,country_code,timezone,currency,service_mode)
select owner_id,'QA transfer','qa-transfer-'||owner_id,'approved','Dakar','SN','Africa/Dakar','XOF','salon' from qa_transfer;
insert into public.businesses(id,owner_id,name,slug,address,city,status,country_code,timezone,currency)
select business_id,owner_id,'QA transfer','qa-transfer-'||business_id,'QA','Dakar','approved','SN','Africa/Dakar','XOF' from qa_transfer
union all select outside_business_id,owner_id,'QA outside','qa-transfer-'||outside_business_id,'QA','Dakar','approved','SN','Africa/Dakar','XOF' from qa_transfer;
insert into public.provider_services(id,provider_id,business_id,service_id,title,duration_minutes,price_amount,currency)
select service_id,owner_id,business_id,(select id from public.services where is_active limit 1),'QA transfer',60,4500,'XOF' from qa_transfer;
insert into public.collaborators(id,business_id,profile_id,display_name)
select assigned_id,business_id,staff_id,'QA Assigned' from qa_transfer
union all select candidate_id,business_id,colleague_id,'QA Available' from qa_transfer
union all select busy_id,business_id,null,'QA Busy' from qa_transfer
union all select unqualified_id,business_id,null,'QA Unqualified' from qa_transfer
union all select outside_id,outside_business_id,null,'QA Outside' from qa_transfer;
insert into public.collaborator_services(collaborator_id,provider_service_id)
select id,service_id from qa_transfer cross join lateral unnest(array[assigned_id,candidate_id,busy_id]) id;
insert into public.collaborator_hours(collaborator_id,weekday,starts_at,ends_at)
select id,extract(dow from (starts_at at time zone 'Africa/Dakar'))::smallint,'08:00','22:00'
from qa_transfer cross join lateral unnest(array[assigned_id,candidate_id,busy_id,unqualified_id,outside_id]) id;
update public.businesses set team_booking_enabled=true where id=(select business_id from qa_transfer);
insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,permissions,granted_by)
select assigned_id,business_id,staff_id,array['bookings.read','bookings.manage'],owner_id from qa_transfer
union all select candidate_id,business_id,colleague_id,array['bookings.read','bookings.manage'],owner_id from qa_transfer;
select set_config('request.jwt.claim.sub',client_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',client_id,'role','authenticated')::text,true) from qa_transfer;
insert into public.bookings(id,client_id,provider_id,provider_service_id,collaborator_id,starts_at,ends_at,location_mode,total_amount,currency)
select booking_id,client_id,owner_id,service_id,assigned_id,starts_at,starts_at+interval '1 hour','salon',4500,'XOF' from qa_transfer;
select set_config('request.jwt.claim.sub',stranger_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',stranger_id,'role','authenticated')::text,true) from qa_transfer;
insert into public.bookings(client_id,provider_id,provider_service_id,collaborator_id,starts_at,ends_at,location_mode,total_amount,currency)
select stranger_id,owner_id,service_id,busy_id,starts_at,starts_at+interval '1 hour','salon',4500,'XOF' from qa_transfer;

-- The public roster includes qualified staff even when there are no slots.
do $$ declare q record; result jsonb; begin
 select * into q from qa_transfer;
 result:=public.get_booking_team_availability(q.service_id,current_date-2);
 if result->>'teamEnabled'<>'true' or jsonb_array_length(result->'people')<>3
   or jsonb_array_length(result->'slots')<>0 then raise exception 'FAIL: qualified roster disappears on a day without slots';end if;
 if exists(select 1 from jsonb_array_elements(result->'people') p where p->>'collaborator_id' in(q.unqualified_id::text,q.outside_id::text)) then
   raise exception 'FAIL: unqualified or outside staff exposed';end if;
 if exists(select 1 from jsonb_array_elements(result->'people') p where p ? 'email' or p ? 'phone' or p ? 'permissions') then
   raise exception 'FAIL: private staff fields exposed';end if;
end $$;
-- Server assignment: a named choice cannot overbook; no preference picks
-- the remaining qualified person. The inner block rolls back that extra booking.
do $$ declare q record; assigned uuid; begin
 select * into q from qa_transfer;
 perform set_config('request.jwt.claim.sub',q.staff_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',q.staff_id,'role','authenticated')::text,true);
 begin
  insert into public.bookings(client_id,provider_id,provider_service_id,collaborator_id,starts_at,ends_at,location_mode,total_amount,currency)
  values(q.staff_id,q.owner_id,q.service_id,q.assigned_id,q.starts_at,q.starts_at+interval '1 hour','salon',4500,'XOF');
  raise exception 'FAIL: named collaborator was overbooked';
 exception when exclusion_violation then null;end;
 begin
  insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount,currency)
  values(q.staff_id,q.owner_id,q.service_id,q.starts_at,q.starts_at+interval '1 hour','salon',4500,'XOF')
  returning collaborator_id into assigned;
  if assigned is distinct from q.candidate_id then raise exception 'FAIL: no preference chose busy or unqualified staff';end if;
  raise exception using errcode='P9001',message='rollback extra synthetic booking';
 exception when sqlstate 'P9001' then null;end;
end $$;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $$ declare c record; target uuid; blocked boolean; result jsonb; begin
  select * into c from qa_transfer;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.stranger_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',c.stranger_id::text,true);
  blocked:=false;
  begin perform * from public.get_reassignment_candidates(c.booking_id);
    exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL: unrelated client can read candidates'; end if;
  blocked:=false;
  begin perform public.reassign_booking_collaborator(c.booking_id,c.candidate_id,'Overbooké');
    exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL: unrelated client can reassign'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.staff_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',c.staff_id::text,true);
  if (select array_agg(id) from public.get_reassignment_candidates(c.booking_id)) is distinct from array[c.candidate_id] then
    raise exception 'FAIL: candidate list includes unavailable, unqualified, current or outside employee'; end if;
  foreach target in array array[c.busy_id,c.unqualified_id,c.outside_id] loop
    blocked:=false;
    begin perform public.reassign_booking_collaborator(c.booking_id,target,'Overbooké');
      exception when exclusion_violation then blocked:=true; end;
    if not blocked then raise exception 'FAIL: invalid target accepted'; end if;
  end loop;
  blocked:=false;
  begin perform public.reassign_booking_collaborator(c.booking_id,c.candidate_id,'  ');
    exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'FAIL: empty reason accepted'; end if;
  result:=public.reassign_booking_collaborator(c.booking_id,c.candidate_id,'Overbooké');
  if result->>'changed'<>'true' then raise exception 'FAIL: transfer did not happen'; end if;
  blocked:=false;
  begin perform public.reassign_booking_collaborator(c.booking_id,c.assigned_id,'Stale access');
    exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL: former assignee retains transfer rights'; end if;
end $$;
reset role;
do $$ declare c record; b public.bookings%rowtype; begin
  select * into c from qa_transfer;
  select * into strict b from public.bookings where id=c.booking_id;
  if b.collaborator_id<>c.candidate_id or b.starts_at<>c.starts_at or b.ends_at<>c.starts_at+interval '1 hour'
    or b.total_amount<>4500 or b.status<>'pending' then raise exception 'FAIL: booking contract changed'; end if;
  if not exists(select from public.booking_assignments where booking_id=b.id and actor_id=c.staff_id and reason='Overbooké') then
    raise exception 'FAIL: transfer audit missing'; end if;
  if not exists(select from public.notifications where profile_id=c.client_id and kind='booking_assignment' and data->>'booking_id'=b.id::text)
    or not exists(select from public.notifications where profile_id=c.colleague_id and kind='booking_assignment' and data->>'booking_id'=b.id::text)
    or not exists(select from public.notifications where profile_id=c.owner_id and kind='booking_assignment' and data->>'booking_id'=b.id::text)
    or not exists(select from public.notifications where profile_id=c.staff_id and data->>'assignment_removed'='true' and data->>'booking_id'=b.id::text) then
    raise exception 'FAIL: client, colleague, owner or old assignee notice missing'; end if;
  if exists(select from public.notifications where profile_id=c.stranger_id and data->>'booking_id'=b.id::text) then
    raise exception 'FAIL: unrelated person notified'; end if;
end $$;
do $$ declare c record; blocked boolean; mode text; begin
  select * into c from qa_transfer;
  perform set_config('request.jwt.claim.sub',c.colleague_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.colleague_id,'role','authenticated')::text,true);
  foreach mode in array array['read_only','revoked'] loop
    update booking_private.collaborator_access set
      permissions=case when mode='read_only' then array['bookings.read'] else array['bookings.read','bookings.manage'] end,
      revoked_at=case when mode='revoked' then now() else null end
      where collaborator_id=c.candidate_id;
    blocked:=false;
    begin perform public.reassign_booking_collaborator(c.booking_id,c.assigned_id,'Overbooké');
      exception when insufficient_privilege then blocked:=true; end;
    if not blocked then raise exception 'FAIL: read-only or revoked employee can reassign'; end if;
  end loop;
  update booking_private.collaborator_access set permissions=array['bookings.read','bookings.manage'],revoked_at=null
    where collaborator_id=c.candidate_id;
  perform set_config('request.jwt.claim.sub',c.owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);
  update public.bookings set status='confirmed' where id=c.booking_id;
  perform set_config('request.jwt.claim.sub',c.colleague_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.colleague_id,'role','authenticated')::text,true);
  perform public.reassign_booking_collaborator(c.booking_id,c.assigned_id,'Retour collègue disponible');
  perform set_config('request.jwt.claim.sub',c.staff_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.staff_id,'role','authenticated')::text,true);
  perform public.staff_update_booking_status(c.booking_id,'in_progress');
  if exists(select from public.get_reassignment_candidates(c.booking_id)) then
    raise exception 'FAIL: in-progress appointment offers transfer candidates'; end if;
  blocked:=false;
  begin perform public.reassign_booking_collaborator(c.booking_id,c.candidate_id,'Trop tard');
    exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL: in-progress appointment can be transferred'; end if;
end $$;
rollback;
select 'PASS: full-day qualified roster, named booking conflict, no-preference assignment, pending/confirmed transfers, busy/unqualified/outside targets rejected, unrelated/stale/read-only/revoked access denied, in-progress transfer rejected, immutable appointment, actor audit and targeted notifications; all fixtures rolled back' result;
