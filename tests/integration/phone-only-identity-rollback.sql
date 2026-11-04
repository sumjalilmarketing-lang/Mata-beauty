-- Test project only; verifies identity state, not real code delivery. All writes rolled back.
begin;
select set_config('test.phone_only_user',gen_random_uuid()::text,true);
insert into auth.users(id,email,phone,raw_app_meta_data,raw_user_meta_data) values(current_setting('test.phone_only_user')::uuid,'','221770000077','{"qa_suppress_email":true}','{"display_name":"Compte téléphone QA","legal_accepted":true,"country_code":"SN","role":"admin"}');
do $$begin if (select account_status from public.profiles where id=current_setting('test.phone_only_user')::uuid)<>'phone_unverified' then raise exception 'Phone-only identity incorrectly requires email';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.phone_only_user'),'role','authenticated')::text,true);
do $$begin if public.synchronize_account_status()<>'phone_unverified' then raise exception 'Unverified phone activated';end if;end $$;
reset role;
update auth.users set phone_confirmed_at=now() where id=current_setting('test.phone_only_user')::uuid;
set local role authenticated;
select public.ensure_authenticated_profile();
do $$begin if public.synchronize_account_status()<>'active' then raise exception 'Verified phone did not activate without email';end if;end $$;
select public.request_professional_profile();
reset role;
do $$begin
 if exists(select 1 from public.account_roles where profile_id=current_setting('test.phone_only_user')::uuid and role not in ('customer','professional')) then raise exception 'Unexpected privileged application role';end if;
 if exists(select 1 from public.admin_user_roles where user_id=current_setting('test.phone_only_user')::uuid) then raise exception 'Metadata granted admin access';end if;
 if (select status from public.provider_profiles where profile_id=current_setting('test.phone_only_user')::uuid)='approved' then raise exception 'Phone registration bypassed professional review';end if;
end $$;
rollback;
select 'PASS: no email required for phone identity; unverified phone remains blocked; verified phone activates client; professional application remains subject to review; metadata cannot grant administrator rights. No real code sent; all writes rolled back.' as result;
