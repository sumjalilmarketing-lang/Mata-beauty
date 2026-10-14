-- Integration test for fictitious Stories and message-request flows.
-- Runs only on an isolated Supabase/PostgreSQL clone and rolls back all rows.
begin;

do $seed$
declare
  provider_id uuid := 'a3146001-0000-4000-8000-000000000001';
  story_active uuid := 'a3146002-0000-4000-8000-000000000002';
  story_expired uuid := 'a3146003-0000-4000-8000-000000000003';
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (provider_id,'authenticated','authenticated','qa-v2-story-provider@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"QA Story Provider"}',now(),now()),
    ('a3146004-0000-4000-8000-000000000004','authenticated','authenticated','qa-v2-story-client@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"QA Story Client"}',now(),now());
  insert into public.provider_profiles(profile_id,business_name,slug,status,city,activity_type)
  values(provider_id,'QA Story Provider','qa-v2-story-provider','approved','Dakar','independent');
  insert into public.professional_stories(id,provider_id,caption,storage_path,content_type,size_bytes,status,published_at,expires_at)
  values
    (story_active,provider_id,'Story QA active','qa-private/fake-active.mp4','video/mp4',1024,'published',now()-interval '1 minute',now()+interval '23 hours 59 minutes'),
    (story_expired,provider_id,'Story QA expirée','qa-private/fake-expired.mp4','video/mp4',1024,'published',now()-interval '25 hours',now()-interval '1 hour');
end
$seed$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','a3146004-0000-4000-8000-000000000004',true);
select public.ensure_provider_conversation('a3146001-0000-4000-8000-000000000001');

do $client_request$
declare conv_id uuid;
begin
  select id into conv_id from public.conversations
  where booking_id is null and client_id='a3146004-0000-4000-8000-000000000004'
    and provider_id='a3146001-0000-4000-8000-000000000001';
  if conv_id is null then raise exception 'Client conversation request was not created'; end if;
  if (select request_status from public.conversations where id=conv_id)<>'pending' then raise exception 'Request did not start pending'; end if;
  insert into public.messages(conversation_id,sender_id,body,message_type,metadata,client_nonce)
  values(conv_id,'a3146004-0000-4000-8000-000000000004','Bonjour, puis-je avoir un devis ?','text','{}','a3146005-0000-4000-8000-000000000005');
  begin
    insert into public.messages(conversation_id,sender_id,body,message_type,metadata,client_nonce)
    values(conv_id,'a3146004-0000-4000-8000-000000000004','Second message avant acceptation','text','{}','a3146006-0000-4000-8000-000000000006');
    raise exception 'Pending request accepted a second initial message';
  exception when insufficient_privilege then null;
  end;
end
$client_request$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a3146001-0000-4000-8000-000000000001',true);
do $provider_request$
declare conv_id uuid; request_count integer;
begin
  select id into conv_id from public.conversations
  where booking_id is null and client_id='a3146004-0000-4000-8000-000000000004'
    and provider_id='a3146001-0000-4000-8000-000000000001';
  select count(*) into request_count from jsonb_array_elements(public.list_my_message_requests());
  if request_count<>1 then raise exception 'Provider did not receive the pending request'; end if;
  if not public.respond_to_message_request(conv_id,true) then raise exception 'Provider could not accept request'; end if;
  if public.respond_to_message_request(conv_id,true) then raise exception 'Request acceptance was not idempotent'; end if;
  if (select request_status from public.conversations where id=conv_id)<>'accepted' then raise exception 'Request state was not accepted'; end if;
end
$provider_request$;

reset role;
do $notification$
begin
  if not exists(select 1 from public.notifications where profile_id='a3146004-0000-4000-8000-000000000004' and kind='message_request_accepted') then
    raise exception 'Requester notification was not created';
  end if;
end
$notification$;

do $stories$
declare active_count integer;
begin
  select count(*) into active_count from public.list_active_professional_stories(30)
    where provider_id='a3146001-0000-4000-8000-000000000001';
  if active_count<>1 then raise exception 'Active Story query must hide the expired Story; returned %',active_count; end if;
end
$stories$;

rollback;
