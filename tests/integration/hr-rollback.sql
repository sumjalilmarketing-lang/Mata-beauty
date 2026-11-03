-- TEST ONLY. Fixed synthetic identities and SQL claims; no real Auth login.
-- One transaction always rolled back: no persistent account/role, no endpoint,
-- no external network call and no existing reservation/payment changed.
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
select set_config('qa.hr_ids',(select jsonb_object_agg(label,gen_random_uuid())::text from unnest(array['root','head_a','head_b','agent_a','agent_b','agent_c','finance_head','finance_agent','support_head','support_agent','client','provider'])label),true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select value::uuid,'qa-hr-rollback-'||value||'@example.invalid',now(),'{"qa_suppress_email":true}',jsonb_build_object('display_name','QA delegation rollback '||key,'legal_accepted','true')from jsonb_each_text(current_setting('qa.hr_ids')::jsonb);
update public.profiles set role='admin'where id=(current_setting('qa.hr_ids')::jsonb->>'root')::uuid;
insert into public.admin_user_roles(user_id,role_id,requires_mfa)select(current_setting('qa.hr_ids')::jsonb->>'root')::uuid,id,true from public.admin_roles where key='super_admin';
set local role authenticated;
do $$declare ids jsonb:=current_setting('qa.hr_ids')::jsonb;t uuid;b uuid;e uuid;p uuid;l uuid;doc uuid;person jsonb;salary jsonb;path text;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'root','role','authenticated','aal','aal2')::text,true);
 t:=public.department_set_team(null,null,'hr','QA RH A','qa-hr-rollback-'||(ids->>'head_a')||'@example.invalid',true,'Nomination de recette RH');
 b:=public.department_set_team(null,null,'hr','QA RH B','qa-hr-rollback-'||(ids->>'head_b')||'@example.invalid',true,'Nomination de recette RH');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'head_a','role','authenticated','aal','aal2')::text,true);
 perform public.department_add_member(t,'qa-hr-rollback-'||(ids->>'agent_a')||'@example.invalid','Recrutement de recette RH');
 perform public.hr_create_team('QA RH annexe','Création par responsable RH');
 person:=jsonb_build_object('employee_number','QA-RH-'||gen_random_uuid(),'display_name','Salarié RH de recette','email','qa-hr-rollback-'||(ids->>'agent_a')||'@example.invalid','job_title','Commercial','business_department','Commercial','status','active','hired_on','2026-01-01','annual_leave_days',20,'payroll_delegated',true);
 e:=public.hr_save_employee(null,null,t,(ids->>'agent_a')::uuid,person,'Dossier RH de recette');
 if not exists(select 1 from public.hr_employees where id=e and profile_id=(ids->>'agent_a')::uuid)then raise exception 'Association email incorrecte';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'agent_a','role','authenticated','aal','aal2')::text,true);
 if public.has_admin_permission('payments.read')or public.has_admin_permission('hr.manage')or not public.department_is_scoped_actor()then raise exception 'Permissions RH incompatibles';end if;
 salary:='{"period":"2026-11","base":300000,"bonus":50000,"ipres_employee":16800,"ipm_employee":5000,"income_tax":25000,"trimf":1000,"other_deductions":0,"css_employer":5000,"ipres_employer":25200,"ipm_employer":5000,"calculation_reference":"Montants synthétiques de recette, pas un barème légal"}';
 p:=public.hr_save_item(null,null,e,'payroll','Paie synthétique',salary,'submitted','Préparation de recette');
 if not exists(select 1 from public.hr_items where id=p and(data->>'net')::bigint=302200)then raise exception 'Net incorrect';end if;
 begin perform public.hr_save_item(p,1,e,'payroll','Paie synthétique',salary,'approved','Auto approbation interdite');raise exception 'Paie auto-approuvée';exception when insufficient_privilege then null;end;
 l:=public.hr_save_item(null,null,e,'leave','Congé de recette','{"leave_type":"annual","start_on":"2026-11-09","end_on":"2026-11-11","days":3}','requested','Demande de recette');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'head_a','role','authenticated','aal','aal2')::text,true);
 perform public.hr_save_item(p,1,e,'payroll','Paie synthétique',salary,'approved','Contrôle du second responsable');
 perform public.hr_record_export(p);
 perform public.hr_save_item(l,1,e,'leave','Congé de recette','{"leave_type":"annual","start_on":"2026-11-09","end_on":"2026-11-11","days":3}','approved','Accord du responsable');
 if not exists(select 1 from public.hr_events where item_id=p and action='payroll.exported')then raise exception 'Export non tracé';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'head_b','role','authenticated','aal','aal2')::text,true);
 if exists(select 1 from public.hr_employees where id=e)or exists(select 1 from public.hr_items where id=p)then raise exception 'Fuite entre équipes RH';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'head_a','role','authenticated','aal','aal2')::text,true);
 perform public.department_member_action(t,(ids->>'agent_a')::uuid,'revoke','Fin de recette RH');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'agent_a','role','authenticated','aal','aal2')::text,true);
 if exists(select 1 from public.hr_employees where id=e)or exists(select 1 from public.hr_items where id=p)then raise exception 'Révocation RH inefficace';end if;
end$$;
reset role;
rollback;
select 'PASS HR hosted PostgreSQL: head appointment, staff recruitment, employee/email association, scoped permissions, salary preparation and second approval, net, leave approval, export audit, cross-team isolation and revocation. Synthetic claims, all changes rolled back; no real Auth login, file bytes or payment.'result;
