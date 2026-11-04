-- TEST PROJECT ONLY. Synthetic users and invitations; no email; complete rollback.
begin;
select set_config('test.link_owner',gen_random_uuid()::text,true),
       set_config('test.link_recipient',gen_random_uuid()::text,true),
       set_config('test.link_other',gen_random_uuid()::text,true),
       set_config('test.link_unconfirmed',gen_random_uuid()::text,true),
       set_config('test.link_business',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select current_setting(k)::uuid,'link-qa-'||current_setting(k)||'@example.invalid',
       case when k='test.link_unconfirmed' then null else now() end,
       '{"qa_suppress_email":true}'::jsonb,'{"display_name":"Invitation QA rollback"}'::jsonb
from (values('test.link_owner'),('test.link_recipient'),('test.link_other'),('test.link_unconfirmed')) t(k);
insert into public.profiles(id,display_name)
select current_setting(k)::uuid,'Invitation QA rollback'
from (values('test.link_owner'),('test.link_recipient'),('test.link_other'),('test.link_unconfirmed')) t(k)
on conflict(id) do nothing;
insert into public.provider_profiles(profile_id,business_name,slug)
values(current_setting('test.link_owner')::uuid,'Invitation QA rollback','link-qa-'||current_setting('test.link_owner'));
insert into public.businesses(id,owner_id,name,slug,address,city)
values(current_setting('test.link_business')::uuid,current_setting('test.link_owner')::uuid,'Invitation QA rollback','link-qa-'||current_setting('test.link_business'),'QA','QA');

-- QA project only. All fixture writes are rolled back; no email or WhatsApp send.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_owner'),'role','authenticated')::text,true);
select set_config('test.phone_invite',public.create_business_phone_invitation(current_setting('test.link_business')::uuid,'+221770000099','member',array['bookings.read','messages.read','messages.reply'],repeat('b',64))::text,true);
select public.set_salon_brand_image(current_setting('test.link_business')::uuid,'logo','https://qa.example/storage/v1/object/public/business-media/'||current_setting('test.link_business')||'/logo.png');
reset role;
do $$begin
 if (select logo_url from public.provider_profiles where profile_id=current_setting('test.link_owner')::uuid) is distinct from ('https://qa.example/storage/v1/object/public/business-media/'||current_setting('test.link_business')||'/logo.png') then raise exception 'Professional logo not propagated'; end if;
 if (select status from public.businesses where id=current_setting('test.link_business')::uuid)<>'draft' then raise exception 'Draft salon unexpectedly published'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_other'),'role','authenticated')::text,true);
do $$begin
 begin perform public.owner_list_business_phone_invitations(current_setting('test.link_business')::uuid);raise exception 'Owner data exposed';exception when insufficient_privilege then null;end;
 begin perform public.set_salon_brand_image(current_setting('test.link_business')::uuid,'logo','https://qa.example/storage/v1/object/public/business-media/'||current_setting('test.link_business')||'/other.png');raise exception 'Non-owner replaced logo';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_recipient'),'role','authenticated')::text,true);
do $$declare result jsonb;begin
 begin perform public.accept_business_invitation(repeat('b',64));raise exception 'Phone invitation accepted through email bypass';exception when insufficient_privilege then null;end;
 result:=public.respond_business_invitation(repeat('b',64));
 if result->>'state'<>'accepted' then raise exception 'Direct acceptance failed';end if;
 perform set_config('test.phone_collaborator',result->>'collaboratorId',true);
 if not exists(select 1 from public.current_collaborator_access() a where 'messages.reply'=any(a.permissions)) then raise exception 'Direct access grant absent';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_recipient'),'role','authenticated')::text,true);
do $$begin
 if not exists(select 1 from public.current_collaborator_access() a where a.collaborator_id=current_setting('test.phone_collaborator')::uuid and 'messages.reply'=any(a.permissions)) then raise exception 'Approved permissions absent';end if;
 begin perform public.respond_business_invitation(repeat('b',64));raise exception 'Consumed token reused';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_owner'),'role','authenticated')::text,true);
select public.revoke_business_collaborator_access(current_setting('test.link_business')::uuid,current_setting('test.phone_collaborator')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_recipient'),'role','authenticated')::text,true);
do $$begin if exists(select 1 from public.current_collaborator_access()) then raise exception 'Revoked access survived';end if;end $$;
reset role;
-- Existing QA booking only: exercise real RLS with its legacy link left NULL.
select set_config('test.message_booking',(select b.id::text from public.bookings b join public.profiles p on p.id=b.client_id where coalesce(to_jsonb(b)->>'conversation_id','')='' and p.account_status='active' and not p.is_suspended limit 1),true);
do $$begin if current_setting('test.message_booking',true) is null or current_setting('test.message_booking',true)='' then raise exception 'QA booking with null legacy link required';end if;end $$;
select set_config('test.message_client',(select client_id::text from public.bookings where id=current_setting('test.message_booking')::uuid),true),set_config('test.message_provider',(select provider_id::text from public.bookings where id=current_setting('test.message_booking')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.message_client'),'role','authenticated')::text,true);
select set_config('test.message_conversation',public.ensure_booking_conversation(current_setting('test.message_booking')::uuid)::text,true);
insert into public.messages(conversation_id,sender_id,body) values(current_setting('test.message_conversation')::uuid,current_setting('test.message_client')::uuid,'QA regression: client message after reservation');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.message_provider'),'role','authenticated')::text,true);
insert into public.messages(conversation_id,sender_id,body) values(current_setting('test.message_conversation')::uuid,current_setting('test.message_provider')::uuid,'QA regression: professional reply');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_other'),'role','authenticated')::text,true);
do $$begin
 begin insert into public.messages(conversation_id,sender_id,body) values(current_setting('test.message_conversation')::uuid,auth.uid(),'QA forbidden outsider message');raise exception 'Outsider sent a message';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.messages where conversation_id=current_setting('test.message_conversation')::uuid) then raise exception 'Outsider read conversation';end if;
end $$;
reset role;
rollback;
select 'PASS: messages with NULL legacy link, recipient/owner replies, outsider denied; logo propagation; phone invitation direct acceptance, no email bypass, token consumption, revocation. All writes rolled back; no actual WhatsApp/email sent.' as result;
