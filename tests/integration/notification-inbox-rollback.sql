begin;
select set_config('test.inbox_owner',gen_random_uuid()::text,true),set_config('test.inbox_other',gen_random_uuid()::text,true),set_config('test.inbox_notice',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) select current_setting(k)::uuid,'inbox-qa-'||current_setting(k)||'@example.invalid',now(),'{"qa_suppress_email":true}'::jsonb from(values('test.inbox_owner'),('test.inbox_other'))t(k);
insert into public.profiles(id,display_name) select current_setting(k)::uuid,'Inbox QA' from(values('test.inbox_owner'),('test.inbox_other'))t(k) on conflict(id) do update set display_name=excluded.display_name;
insert into public.notifications(id,profile_id,kind,title,body,data) values(current_setting('test.inbox_notice')::uuid,current_setting('test.inbox_owner')::uuid,'test','Synthetic inbox test','Synthetic',jsonb_build_object('actor_id',current_setting('test.inbox_other')));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.inbox_owner'),'role','authenticated')::text,true);
select public.set_notification_dismissed(current_setting('test.inbox_notice')::uuid,true);
do $$begin
 if not exists(select 1 from public.notifications where id=current_setting('test.inbox_notice')::uuid and dismissed_at is not null and read_at is not null) then raise exception 'Dismiss/read failed';end if;
 if not exists(select 1 from public.get_notification_actors(array[current_setting('test.inbox_notice')::uuid]) where actor_name='Inbox QA') then raise exception 'Actor summary missing';end if;
end $$;
select public.set_notification_dismissed(current_setting('test.inbox_notice')::uuid,false);
do $$begin if not exists(select 1 from public.notifications where id=current_setting('test.inbox_notice')::uuid and dismissed_at is null) then raise exception 'Restore failed';end if;end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.inbox_other'),'role','authenticated')::text,true);
do $$begin
 begin perform public.set_notification_dismissed(current_setting('test.inbox_notice')::uuid,true);raise exception 'Other account dismissed notification';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.get_notification_actors(array[current_setting('test.inbox_notice')::uuid])) then raise exception 'Other account read actor data';end if;
end $$;
reset role;
select 'PASS: owner dismissal marks read; undo restores; actor names private to recipient; other account denied' result;
rollback;
