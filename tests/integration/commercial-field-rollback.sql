-- TEST ONLY. Fixed synthetic identities and SQL claims; no real Auth login.
-- One transaction always rolled back: no persistent account/role, no endpoint,
-- no external network call and no existing reservation/payment changed.
begin;
set local statement_timeout='120s';
set local lock_timeout='5s';
select set_config('qa.field_ids',(select jsonb_object_agg(label,gen_random_uuid())::text from unnest(array['root','head_a','head_b','agent_a','agent_b','agent_c','finance_head','finance_agent','support_head','support_agent','client','provider'])label),true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select value::uuid,'qa-field-rollback-'||value||'@example.invalid',now(),'{"qa_suppress_email":true}',jsonb_build_object('display_name','QA delegation rollback '||key,'legal_accepted','true')from jsonb_each_text(current_setting('qa.field_ids')::jsonb);
update public.profiles set role='admin'where id=(current_setting('qa.field_ids')::jsonb->>'root')::uuid;
insert into public.admin_user_roles(user_id,role_id,requires_mfa)select(current_setting('qa.field_ids')::jsonb->>'root')::uuid,id,true from public.admin_roles where key='super_admin';
insert into public.provider_profiles(profile_id,business_name,slug,city,onboarding_progress)
values((current_setting('qa.field_ids')::jsonb->>'provider')::uuid,'QA delegation rollback provider','qa-field-'||(current_setting('qa.field_ids')::jsonb->>'provider'),'Dakar',100);
insert into public.professional_onboarding(provider_id,status)values((current_setting('qa.field_ids')::jsonb->>'provider')::uuid,'submitted');
with inserted as(insert into public.support_tickets(requester_id,subject)values((current_setting('qa.field_ids')::jsonb->>'client')::uuid,'QA delegation rollback claim')returning id)select set_config('qa.field_ticket',id::text,true)from inserted;
set local role authenticated;
do $$declare ids jsonb:=current_setting('qa.field_ids')::jsonb;ta uuid;tb uuid;l uuid;s uuid:=gen_random_uuid();v uuid:=gen_random_uuid();r uuid;c uuid;a uuid;n integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'root','role','authenticated','aal','aal2')::text,true);
 ta:=public.department_set_team(null,null,'commercial','QA field rollback A','qa-field-rollback-'||(ids->>'head_a')||'@example.invalid',true,'Recette terrain');
 tb:=public.department_set_team(null,null,'commercial','QA field rollback B','qa-field-rollback-'||(ids->>'head_b')||'@example.invalid',true,'Recette terrain');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'head_a','role','authenticated','aal','aal2')::text,true);
 perform public.commercial_create_team('QA field created by manager','Extension terrain');
 perform public.department_add_member(ta,'qa-field-rollback-'||(ids->>'agent_a')||'@example.invalid','Recrutement terrain');
 c:=public.department_save_case(null,null,ta,(ids->>'agent_a')::uuid,'QA field candidat','Contrôle',null,(ids->>'provider')::uuid,null,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'agent_a','role','authenticated','aal','aal2')::text,true);
 begin perform public.commercial_create_team('Forbidden','Refus attendu');raise exception 'Agent created team';exception when insufficient_privilege then null;end;
 insert into public.crm_leads(name,team_id)values('QA field prospect',ta)returning id into l;
 perform public.commercial_clock(s,ta,'shift_start',null,'','','{"status":"denied"}');
 perform public.commercial_clock(s,ta,'shift_start',null,'','','{"status":"denied"}');
 if(select count(*)from public.commercial_field_events where session_id=s)<>1 then raise exception 'Idempotence incorrecte';end if;
 perform public.commercial_clock(v,ta,'visit_start',l,'Salon terrain','',jsonb_build_object('status','available','latitude',14.7,'longitude',-17.4,'accuracy',12,'captured_at',clock_timestamp()));
 begin perform public.commercial_clock(gen_random_uuid(),ta,'shift_end',null,'','Bilan prématuré','{"status":"denied"}');raise exception 'Open visit allowed day end';exception when raise_exception then if sqlerrm<>'Terminez la visite avant la journée'then raise;end if;end;
 perform public.commercial_clock(gen_random_uuid(),ta,'visit_end',null,'','Salon rencontré et dossier demandé','{"status":"denied"}');
 perform public.commercial_clock(gen_random_uuid(),ta,'shift_end',null,'','Journée terminée, une visite','{"status":"denied"}');
 perform public.department_update_case(c,1,'in_progress','Rapport de contrôle du dossier');
 perform public.review_professional_application((ids->>'provider')::uuid,'rejected','Pièce non conforme en recette');
 if(select count(*)from public.commercial_reports where team_id=ta and kind='decision')<>1 then raise exception 'Décision non transmise';end if;
 a:=public.commercial_save_appointment(null,null,ta,l,'Présentation Mata','Dakar','2026-12-01T10:00Z','2026-12-01T11:00Z','planned','');
 perform public.commercial_save_appointment(a,1,ta,l,'Présentation Mata','Dakar','2026-12-01T10:00Z','2026-12-01T11:00Z','completed','Rendez-vous réalisé');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'head_b','role','authenticated','aal','aal2')::text,true);
 if exists(select 1 from public.commercial_field_events where team_id=ta)or exists(select 1 from public.commercial_reports where team_id=ta)then raise exception 'Fuite entre équipes';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'head_a','role','authenticated','aal','aal2')::text,true);
 if(public.commercial_team_positions(ta,0)->>'total')::integer<>1 then raise exception 'Vue équipe incorrecte';end if;
 select id into r from public.commercial_reports where team_id=ta limit 1;
 if r is null then raise exception 'Rapports absents pour responsable';end if;
 perform public.commercial_acknowledge_report(r);
 if not exists(select 1 from public.notifications where profile_id=(ids->>'head_a')::uuid and kind='commercial_report')then raise exception 'Notification absente';end if;
 perform public.department_member_action(ta,(ids->>'agent_a')::uuid,'revoke','Fin de recette');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>'agent_a','role','authenticated','aal','aal2')::text,true);
 if exists(select 1 from public.commercial_field_events where team_id=ta)then raise exception 'Révocation inefficace';end if;
end $$;
reset role;
rollback;
select 'PASS commercial field PostgreSQL: creation, membership, shift/visit transitions, GPS, retry, case/decision reports, current manager notification, appointment completion, manager positions, team isolation and revocation. All synthetic data rolled back; no real Auth login.'result;
