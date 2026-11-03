-- TEST PROJECT ONLY, after department_workspaces migration. Not a production test.
-- Synthetic identities, no auth API calls or email sends. SQL claims exercise SQL
-- authorization; browser login and actual MFA enrollment require separate tests.
begin;
do $$ begin
  if not exists(select 1 from public.admin_roles where key='commercial') then
    raise exception 'Apply department_workspaces to Test first';
  end if;
end $$;
select set_config('test.dept_commercial',gen_random_uuid()::text,true),
       set_config('test.dept_finance',gen_random_uuid()::text,true),
       set_config('test.dept_support',gen_random_uuid()::text,true),
       set_config('test.dept_super',gen_random_uuid()::text,true),
       set_config('test.dept_candidate',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select current_setting(k)::uuid,'department-qa-'||current_setting(k)||'@example.invalid',now(),
       '{"qa_suppress_email":true}'::jsonb,'{"display_name":"Department QA rollback"}'::jsonb
from (values('test.dept_commercial'),('test.dept_finance'),('test.dept_support'),('test.dept_super'),('test.dept_candidate')) t(k);
insert into public.profiles(id,display_name)
select current_setting(k)::uuid,'Department QA rollback'
from (values('test.dept_commercial'),('test.dept_finance'),('test.dept_support'),('test.dept_super'),('test.dept_candidate')) t(k)
on conflict(id) do nothing;
update public.profiles set role='admin' where id in (current_setting('test.dept_commercial')::uuid,current_setting('test.dept_finance')::uuid,current_setting('test.dept_support')::uuid,current_setting('test.dept_super')::uuid);
insert into public.admin_user_roles(user_id,role_id,requires_mfa)
select current_setting(t.k)::uuid,r.id,true from
(values('test.dept_commercial','commercial'),('test.dept_finance','finance'),('test.dept_support','support'),('test.dept_super','super_admin')) t(k,role_key)
join public.admin_roles r on r.key=t.role_key;
insert into public.provider_profiles(profile_id,business_name,slug,onboarding_progress)
values(current_setting('test.dept_candidate')::uuid,'Department QA','department-qa-'||current_setting('test.dept_candidate'),10);
insert into public.professional_onboarding(provider_id,status)
values(current_setting('test.dept_candidate')::uuid,'submitted') on conflict(provider_id) do update set status='submitted';
insert into public.support_tickets(requester_id,subject)
values(current_setting('test.dept_candidate')::uuid,'Department QA claim');
do $$ begin
  if not exists(select 1 from public.notifications where profile_id=current_setting('test.dept_commercial')::uuid and kind='application_to_review' and data->>'href'='/commercial?dossier='||current_setting('test.dept_candidate')) then raise exception 'Commercial notification missing'; end if;
  if exists(select 1 from public.notifications where profile_id in (current_setting('test.dept_finance')::uuid,current_setting('test.dept_support')::uuid) and kind='application_to_review') then raise exception 'Wrong department notified'; end if;
end $$;
set local role authenticated;
do $$ declare item record; denied text; begin
  for item in select * from (values
    ('test.dept_commercial','documents.review',array['users.read','payments.read','support.manage','roles.manage','audit.read']),
    ('test.dept_finance','payments.read',array['documents.review','providers.verify','support.manage','roles.manage','audit.read']),
    ('test.dept_support','support.manage',array['documents.review','providers.verify','payments.read','roles.manage','audit.read'])
  ) t(k,allowed,denied) loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting(item.k),'role','authenticated','aal','aal1')::text,true);
    if public.has_admin_permission(item.allowed) then raise exception 'MFA bypass for %',item.k; end if;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting(item.k),'role','authenticated','aal','aal2')::text,true);
    if not public.has_admin_permission(item.allowed) then raise exception 'Expected permission missing for %',item.k; end if;
    foreach denied in array item.denied loop
      if public.has_admin_permission(denied) then raise exception 'Cross-department grant % for %',denied,item.k; end if;
    end loop;
    begin perform public.admin_list_team(); raise exception 'Non-super managed team'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.dept_commercial'),'role','authenticated','aal','aal2')::text,true);
do $$ begin
  if not exists(select 1 from public.professional_application_detail(current_setting('test.dept_candidate')::uuid)) then raise exception 'Commercial dossier unavailable'; end if;
  begin perform public.finance_payment_overview(); raise exception 'Commercial read finance overview'; exception when insufficient_privilege then null; end;
  if exists(select 1 from public.support_tickets where requester_id=current_setting('test.dept_candidate')::uuid) then raise exception 'Commercial read support ticket'; end if;
  begin
    perform public.review_professional_application(current_setting('test.dept_candidate')::uuid,'approved','QA must refuse missing documents');
    raise exception 'Incomplete dossier approved';
  exception when raise_exception then
    if sqlerrm not like 'Dossier incomplet%' then raise; end if;
  end;
  perform public.review_professional_application(current_setting('test.dept_candidate')::uuid,'additional_information_required','QA request missing documents');
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.dept_finance'),'role','authenticated','aal','aal2')::text,true);
do $$ begin
  perform public.finance_payment_overview();
  if exists(select 1 from public.audit_logs) then raise exception 'Finance read global audit'; end if;
  if exists(select 1 from public.support_tickets where requester_id=current_setting('test.dept_candidate')::uuid) then raise exception 'Finance read support ticket'; end if;
  begin
    perform public.professional_application_detail(current_setting('test.dept_candidate')::uuid);
    raise exception 'Finance read dossier';
  exception when raise_exception then if sqlerrm<>'Accès au dossier refusé' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.dept_support'),'role','authenticated','aal','aal2')::text,true);
do $$ begin
  if not exists(select 1 from public.support_tickets where requester_id=current_setting('test.dept_candidate')::uuid) then raise exception 'Support ticket unavailable'; end if;
  begin perform public.finance_payment_overview(); raise exception 'Support read finance'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.dept_super'),'role','authenticated','aal','aal2')::text,true);
select public.admin_assign_role(current_setting('test.dept_candidate')::uuid,'commercial','QA commercial assignment');
reset role;
do $$ begin
  if (select count(*) from public.admin_user_roles where user_id=current_setting('test.dept_candidate')::uuid and is_active and revoked_at is null)<>1 then raise exception 'Role assignment merged privileges'; end if;
  if has_function_privilege('anon','public.finance_payment_overview(timestamptz,timestamptz)','EXECUTE') then raise exception 'Anonymous overview grant'; end if;
end $$;
select 'PASS department SQL authorization checks; all synthetic changes rolled back' as result;
rollback;
