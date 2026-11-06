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


reset role;
-- One salon's name follows the public professional identity; several salons
-- must not overwrite one another's public brand.
update public.businesses set name='QA Multi Salon' where id=(select business_id from qa_transfer);
do $$begin
 if exists(select 1 from public.provider_profiles p join qa_transfer q on q.owner_id=p.profile_id where p.business_name='QA Multi Salon') then raise exception 'FAIL: multiple salons overwrite public identity';end if;
end $$;
update public.businesses set archived_at=now() where id=(select outside_business_id from qa_transfer);
update public.businesses set name='QA Public Name' where id=(select business_id from qa_transfer);
do $$begin
 if not exists(select 1 from public.provider_profiles p join qa_transfer q on q.owner_id=p.profile_id where p.business_name='QA Public Name') then raise exception 'FAIL: single salon name not synchronized';end if;
end $$;
-- Establish a real conversation using the normal participant contract.
select set_config('request.jwt.claim.sub',client_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',client_id,'role','authenticated')::text,true) from qa_transfer;
select set_config('qa.conversation',public.ensure_booking_conversation(booking_id)::text,true) from qa_transfer;
update public.conversation_members set last_read_at=now()-interval '1 hour' where conversation_id=current_setting('qa.conversation')::uuid;
insert into public.messages(conversation_id,sender_id,body) select current_setting('qa.conversation')::uuid,owner_id,'QA incoming' from qa_transfer;
insert into public.messages(conversation_id,sender_id,body) select current_setting('qa.conversation')::uuid,client_id,'QA own message' from qa_transfer;
insert into public.messages(conversation_id,sender_id,body,deleted_at) select current_setting('qa.conversation')::uuid,owner_id,'QA deleted',now() from qa_transfer;
set local role authenticated;
do $$begin
 if (public.my_unread_inbox_counts()->>'messages')::int<>1 then raise exception 'FAIL: unread count includes own/deleted messages or misses incoming message';end if;
 perform public.mark_conversation_read(current_setting('qa.conversation')::uuid);
 if (public.my_unread_inbox_counts()->>'messages')::int<>0 then raise exception 'FAIL: count did not clear after reading';end if;
end $$;
select set_config('request.jwt.claim.sub',stranger_id::text,true),set_config('request.jwt.claims',jsonb_build_object('sub',stranger_id,'role','authenticated')::text,true) from qa_transfer;
do $$begin
 if (public.my_unread_inbox_counts()->>'messages')::int<>0 then raise exception 'FAIL: outsider sees someone else unread messages';end if;
end $$;
set local role anon;
do $$begin
 begin perform public.my_unread_inbox_counts(); raise exception 'FAIL: anonymous inbox count exposed';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: identity sync, multi salon isolation, own unread counts, own/deleted exclusions, read clearing, outsider isolation and anonymous denial; synthetic fixtures rolled back' result;
