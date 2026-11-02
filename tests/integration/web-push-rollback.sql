-- TEST PROJECT ONLY. No delivery is sent. All fixtures are rolled back.
begin;
select set_config('test.push_owner',gen_random_uuid()::text,true),set_config('test.push_other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select current_setting(k)::uuid,'push-qa-'||current_setting(k)||'@example.invalid','{"qa_suppress_email":true}'::jsonb,'{"display_name":"Push QA rollback"}'::jsonb from (values('test.push_owner'),('test.push_other')) t(k);
insert into public.profiles(id,display_name) select current_setting(k)::uuid,'Push QA rollback' from (values('test.push_owner'),('test.push_other')) t(k) on conflict(id) do nothing;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.push_owner'),'role','authenticated')::text,true);
select public.register_web_push('https://web.push.apple.com/qa-rollback','{"auth":"aaaaaaaaaaaaaaaaaaaaaa","p256dh":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',true);
do $$ begin if (select count(*) from public.web_push_subscriptions where endpoint='https://web.push.apple.com/qa-rollback')<>1 then raise exception 'owner read failed'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.push_other'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.web_push_subscriptions where endpoint='https://web.push.apple.com/qa-rollback') then raise exception 'RLS privacy failed'; end if;
 delete from public.web_push_subscriptions where endpoint='https://web.push.apple.com/qa-rollback';
 begin
  perform public.register_web_push('https://127.0.0.1/private','{}',true);
  raise exception 'SSRF allowed';
 exception when raise_exception then if sqlerrm='SSRF allowed' then raise; end if; end;
end $$;
reset role;
insert into public.notifications(profile_id,kind,title,body,data) values(current_setting('test.push_owner')::uuid,'booking_created','QA','QA','{}');
do $$ declare first_count int; second_count int; begin
 select count(*) into first_count from public.claim_web_push();
 select count(*) into second_count from public.claim_web_push();
 if first_count<>1 or second_count<>0 then raise exception 'claim/duplicate failed % %',first_count,second_count; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.push_owner'),'role','authenticated')::text,true);
delete from public.web_push_subscriptions where endpoint='https://web.push.apple.com/qa-rollback';
reset role;
do $$ begin if exists(select 1 from public.web_push_deliveries q join public.notifications n on n.id=q.notification_id where n.profile_id=current_setting('test.push_owner')::uuid) then raise exception 'revoke cascade failed'; end if; end $$;
rollback;
