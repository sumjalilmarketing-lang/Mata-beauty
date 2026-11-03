begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
insert into public.admin_permissions(key,domain,description,is_sensitive)values('hr.cases','hr','Dossiers RH attribués',true),('hr.manage','hr','Supervision RH',true)on conflict do nothing;
insert into public.admin_roles(key,name,description,is_system)values('hr_manager','Responsable RH','Supervise ses équipes et valide les dossiers RH',true),('hr_agent','Gestionnaire RH','Traite les dossiers RH attribués',true)on conflict do nothing;
insert into public.admin_role_permissions(role_id,permission_key)select r.id,p from public.admin_roles r cross join lateral unnest(case r.key when 'hr_manager'then array['hr.cases','hr.manage','teams.manage']when 'hr_agent'then array['hr.cases']when 'super_admin'then array['hr.cases','hr.manage']else '{}'::text[]end)p on conflict do nothing;
alter table public.department_teams drop constraint department_teams_department_check;
alter table public.department_teams add constraint department_teams_department_check check(department in('commercial','finance','support','hr'));
do $$declare source text;begin
 source:=pg_get_functiondef('public.department_set_team(uuid,integer,text,text,text,boolean,text)'::regprocedure);
 if position($match$not in('commercial','finance','support')$match$in source)=0 then raise exception 'Définition de délégation inattendue';end if;
 execute replace(source,$match$not in('commercial','finance','support')$match$,$match$not in('commercial','finance','support','hr')$match$);
end$$;
create or replace function public.department_is_scoped_actor()returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=auth.uid()and m.is_active and m.revoked_at is null and r.is_active and r.key in('commercial_manager','commercial_agent','finance_manager','finance_agent','support_manager','support_agent','hr_manager','hr_agent'));$$;
do $$declare source text;begin
 source:=pg_get_functiondef('public.department_save_case(uuid,integer,uuid,uuid,text,text,timestamptz,uuid,uuid,uuid)'::regprocedure);
 if position($match$when 'finance'then '/finance/cases' else '/support-agent/cases'$match$in source)=0 then raise exception 'Notification de dossier inattendue';end if;
 execute replace(source,$match$when 'finance'then '/finance/cases' else '/support-agent/cases'$match$,$match$when 'finance'then '/finance/cases' when 'hr'then '/admin/hr' else '/support-agent/cases'$match$);
end$$;
create table public.hr_employees(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.department_teams(id),assigned_to uuid not null references public.profiles(id),profile_id uuid references public.profiles(id),employee_number text not null unique check(length(trim(employee_number))between 2 and 60),
 display_name text not null check(length(trim(display_name))between 2 and 180),email text not null check(length(email)<=254),job_title text not null check(length(job_title)<=180),business_department text not null check(length(business_department)<=120),status text not null check(status in('onboarding','active','left')),hired_on date not null,left_on date,annual_leave_days numeric(6,2)not null default 0 check(annual_leave_days between 0 and 366),payroll_delegated boolean not null default false,version integer not null default 1,created_at timestamptz not null default now(),check(left_on is null or left_on>=hired_on));
create unique index hr_employee_profile on public.hr_employees(profile_id)where profile_id is not null;
create index hr_employee_team_assignee on public.hr_employees(team_id,assigned_to);
create index hr_employee_assignee on public.hr_employees(assigned_to);
create function public.hr_employee_access(target_employee uuid)returns boolean language sql stable security definer set search_path='' as $$select public.department_actor_enabled()and public.has_admin_permission('hr.cases')and exists(select 1 from public.hr_employees e join public.department_teams t on t.id=e.team_id where e.id=target_employee and t.department='hr'and public.department_can_access(e.team_id,e.assigned_to));$$;
create function public.hr_payroll_access(target_employee uuid)returns boolean language sql stable security definer set search_path='' as $$select public.hr_employee_access(target_employee)and exists(select 1 from public.hr_employees e where e.id=target_employee and(public.department_can_manage(e.team_id)or e.payroll_delegated));$$;
create table public.hr_items(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hr_employees(id),kind text not null check(kind in('contract','leave','time','payroll','document','task')),title text not null check(length(trim(title))between 2 and 180),data jsonb not null check(jsonb_typeof(data)='object'and octet_length(data::text)<=20000),state text not null,version integer not null default 1,created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index hr_items_employee_kind on public.hr_items(employee_id,kind,updated_at desc,id);
create index hr_items_created_by on public.hr_items(created_by);
create index hr_items_updated_by on public.hr_items(updated_by);
create unique index hr_payroll_employee_period on public.hr_items(employee_id,(data->>'period'))where kind='payroll';
create unique index hr_document_path on public.hr_items((data->>'path'))where kind='document';
create function public.hr_item_access(target_employee uuid,item_kind text,item_data jsonb)returns boolean language sql stable security definer set search_path='' as $$select public.hr_employee_access(target_employee)and(item_kind<>'payroll'or public.hr_payroll_access(target_employee))and(item_kind<>'document'or coalesce(item_data->>'confidential','false')<>'true'or exists(select 1 from public.hr_employees e where e.id=target_employee and public.department_can_manage(e.team_id)));$$;
create table public.hr_events(id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.hr_employees(id),item_id uuid references public.hr_items(id),actor_id uuid not null references public.profiles(id),action text not null,note text not null check(length(trim(note))between 3 and 1000),created_at timestamptz not null default now());
create index hr_events_employee_time on public.hr_events(employee_id,created_at desc,id);
create index hr_events_item on public.hr_events(item_id);
create index hr_events_actor on public.hr_events(actor_id);
alter table public.hr_employees enable row level security;
alter table public.hr_items enable row level security;
alter table public.hr_events enable row level security;
revoke all on public.hr_employees,public.hr_items,public.hr_events from public,anon,authenticated;
grant select on public.hr_employees,public.hr_items,public.hr_events to authenticated;
create policy "HR employee scope"on public.hr_employees for select to authenticated using(public.hr_employee_access(id));
create policy "HR item scope"on public.hr_items for select to authenticated using(public.hr_item_access(employee_id,kind,data));
create policy "HR event scope"on public.hr_events for select to authenticated using(public.hr_employee_access(employee_id)and(item_id is null or exists(select 1 from public.hr_items i where i.id=item_id and public.hr_item_access(i.employee_id,i.kind,i.data))));
create function public.hr_save_employee(target_employee uuid,target_version integer,target_team uuid,target_assignee uuid,person jsonb,reason text)returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;previous public.hr_employees;linked uuid;
begin
 perform 1 from public.department_teams where id=target_team and department='hr'for update;
 if not found or not public.department_can_manage(target_team)or not public.department_is_assignee(target_team,target_assignee)then raise exception 'Responsable et agent RH actifs requis'using errcode='42501';end if;
 if length(trim(coalesce(reason,'')))not between 3 and 1000 or jsonb_typeof(person)<>'object'or exists(select 1 from jsonb_object_keys(person)k where k not in('employee_number','display_name','email','job_title','business_department','status','hired_on','left_on','annual_leave_days','payroll_delegated','profile_id'))then raise exception 'Fiche invalide';end if;
 linked:=nullif(person->>'profile_id','')::uuid;
 if target_employee is not null then select * into previous from public.hr_employees where id=target_employee for update;if not found or not public.department_can_manage(previous.team_id)or previous.version is distinct from target_version then raise exception 'Fiche modifiée ou inaccessible'using errcode='40001';end if;if previous.team_id<>target_team and not public.is_super_admin()then raise exception 'Transfert RH réservé au Super Admin'using errcode='42501';end if;end if;
 if target_employee is null then
 insert into public.hr_employees(team_id,assigned_to,profile_id,employee_number,display_name,email,job_title,business_department,status,hired_on,left_on,annual_leave_days,payroll_delegated)values(target_team,target_assignee,linked,trim(person->>'employee_number'),trim(person->>'display_name'),lower(trim(coalesce(person->>'email',''))),trim(coalesce(person->>'job_title','')),trim(coalesce(person->>'business_department','')),person->>'status',(person->>'hired_on')::date,nullif(person->>'left_on','')::date,coalesce((person->>'annual_leave_days')::numeric,0),coalesce((person->>'payroll_delegated')::boolean,false))returning id into result;
 else
 update public.hr_employees set assigned_to=target_assignee,team_id=target_team,profile_id=linked,employee_number=trim(person->>'employee_number'),display_name=trim(person->>'display_name'),email=lower(trim(coalesce(person->>'email',''))),job_title=trim(coalesce(person->>'job_title','')),business_department=trim(coalesce(person->>'business_department','')),status=person->>'status',hired_on=(person->>'hired_on')::date,left_on=nullif(person->>'left_on','')::date,annual_leave_days=coalesce((person->>'annual_leave_days')::numeric,0),payroll_delegated=coalesce((person->>'payroll_delegated')::boolean,false),version=version+1 where id=target_employee returning id into result;
 end if;
 insert into public.hr_events(employee_id,actor_id,action,note)values(result,auth.uid(),'employee.saved',trim(reason));return result;
end;$$;
create function public.hr_save_item(target_item uuid,target_version integer,target_employee uuid,item_kind text,item_title text,item_data jsonb,item_state text,reason text)returns uuid language plpgsql security definer set search_path='' as $$
declare e public.hr_employees;prior public.hr_items;result uuid;manager boolean;d1 date;d2 date;t1 timestamptz;t2 timestamptz;units numeric;used numeric;gross bigint;deductions bigint;cost bigint;k text;allowed text[];recipient uuid;
begin
 select * into e from public.hr_employees where id=target_employee for update;
 if not found or not public.hr_item_access(target_employee,item_kind,item_data)then raise exception 'Dossier RH inaccessible'using errcode='42501';end if;
 manager:=public.department_can_manage(e.team_id);
 if length(trim(coalesce(reason,'')))not between 3 and 1000 or length(trim(coalesce(item_title,'')))not between 2 and 180 or jsonb_typeof(item_data)is distinct from 'object'or item_kind is null then raise exception 'Informations invalides';end if;
 if target_item is not null then select * into prior from public.hr_items where id=target_item for update;if not found or prior.employee_id<>target_employee or prior.kind<>item_kind or not public.hr_item_access(prior.employee_id,prior.kind,prior.data)then raise exception 'Élément inaccessible'using errcode='42501';end if;if prior.version is distinct from target_version then raise exception 'Élément modifié'using errcode='40001';end if;
 if prior.state in('approved','signed','paid_recorded')and not((item_kind='payroll'and prior.state='approved'and item_state='paid_recorded'and manager)or(item_kind='leave'and prior.state='approved'and item_state='cancelled'and manager and prior.data=item_data)or(item_kind='contract'and prior.state='signed'and item_state='ended'and manager and prior.data=item_data))then raise exception 'Élément validé verrouillé ; créer un ajustement';end if;
 end if;
 if item_kind='contract'then
 allowed:=array['contract_type','start_on','end_on','weekly_hours','document_id'];
 if item_state is null or item_state not in('draft','review','signed','ended')or coalesce(item_data->>'contract_type','')not in('cdi','cdd','stage','prestation')then raise exception 'Contrat invalide';end if;
 d1:=(item_data->>'start_on')::date;d2:=nullif(item_data->>'end_on','')::date;
 if d1 is null or(d2 is not null and d2<d1)or coalesce((item_data->>'weekly_hours')::numeric,0)not between 1 and 60 then raise exception 'Dates ou durée de travail invalides';end if;
 if item_state in('signed','ended')and not manager then raise exception 'Validation responsable RH requise'using errcode='42501';end if;
 if nullif(item_data->>'document_id','')is not null and not exists(select 1 from public.hr_items d where d.id=(item_data->>'document_id')::uuid and d.employee_id=e.id and d.kind='document'and public.hr_item_access(d.employee_id,d.kind,d.data))then raise exception 'Document de contrat inaccessible';end if;
 if item_state='signed'and nullif(item_data->>'document_id','')is null then raise exception 'Joindre le contrat signé avant validation';end if;
 elsif item_kind='leave'then
 allowed:=array['leave_type','start_on','end_on','days'];
 if item_state is null or item_state not in('requested','approved','rejected','cancelled')or coalesce(item_data->>'leave_type','')not in('annual','sick','unpaid','other')then raise exception 'Absence invalide';end if;
 d1:=(item_data->>'start_on')::date;d2:=(item_data->>'end_on')::date;units:=(item_data->>'days')::numeric;
 if d1 is null or d2 is null or d2<d1 or extract(year from d1)<>extract(year from d2)or units is null or units<=0 or units>d2-d1+1 or units*2<>trunc(units*2)then raise exception 'Dates et jours décomptés invalides';end if;
 if item_state in('approved','rejected')and(not manager or e.profile_id=auth.uid())then raise exception 'Autre responsable RH requis'using errcode='42501';end if;
 if item_state in('requested','approved')and exists(select 1 from public.hr_items i where i.employee_id=e.id and i.kind='leave'and i.id is distinct from target_item and i.state in('requested','approved')and(i.data->>'start_on')::date<=d2 and(i.data->>'end_on')::date>=d1)then raise exception 'Une absence couvre déjà ces dates';end if;
 if item_state='approved'and item_data->>'leave_type'='annual'then select coalesce(sum((data->>'days')::numeric),0)into used from public.hr_items where employee_id=e.id and kind='leave'and state='approved'and id is distinct from target_item and data->>'leave_type'='annual'and extract(year from(data->>'start_on')::date)=extract(year from d1);if used+units>e.annual_leave_days then raise exception 'Solde annuel insuffisant';end if;end if;
 elsif item_kind='time'then
 allowed:=array['start_at','end_at','time_type'];
 if item_state is null or item_state not in('draft','submitted','approved','rejected')or coalesce(item_data->>'time_type','')not in('planned','actual')then raise exception 'Horaire invalide';end if;
 t1:=(item_data->>'start_at')::timestamptz;t2:=(item_data->>'end_at')::timestamptz;
 if t1 is null or t2 is null or t2<=t1 or t2>t1+interval '24 hours'then raise exception 'Plage horaire invalide';end if;
 if item_state in('approved','rejected')and(not manager or e.profile_id=auth.uid())then raise exception 'Autre responsable RH requis'using errcode='42501';end if;
 if item_state<>'rejected'and exists(select 1 from public.hr_items i where i.employee_id=e.id and i.kind='time'and i.id is distinct from target_item and i.state<>'rejected'and i.data->>'time_type'=item_data->>'time_type'and(i.data->>'start_at')::timestamptz<t2 and(i.data->>'end_at')::timestamptz>t1)then raise exception 'Chevauchement horaire';end if;
 elsif item_kind='payroll'then
 allowed:=array['period','base','bonus','ipres_employee','ipm_employee','income_tax','trimf','other_deductions','css_employer','ipres_employer','ipm_employer','calculation_reference','payment_reference'];
 if item_state is null or item_state not in('draft','submitted','approved','returned','paid_recorded')or coalesce(item_data->>'period','')!~'^[0-9]{4}-(0[1-9]|1[0-2])$'then raise exception 'Période de paie invalide';end if;
 foreach k in array array['base','bonus','ipres_employee','ipm_employee','income_tax','trimf','other_deductions','css_employer','ipres_employer','ipm_employer']loop if coalesce(item_data->>k,'')!~'^[0-9]{1,10}$'or(item_data->>k)::bigint>1000000000 then raise exception 'Montant entier en FCFA requis pour %',k;end if;end loop;
 gross:=(item_data->>'base')::bigint+(item_data->>'bonus')::bigint;deductions:=(item_data->>'ipres_employee')::bigint+(item_data->>'ipm_employee')::bigint+(item_data->>'income_tax')::bigint+(item_data->>'trimf')::bigint+(item_data->>'other_deductions')::bigint;cost:=gross+(item_data->>'css_employer')::bigint+(item_data->>'ipres_employer')::bigint+(item_data->>'ipm_employer')::bigint;
 if deductions>gross then raise exception 'Retenues supérieures au brut';end if;
 if item_state in('submitted','approved','paid_recorded')and length(trim(coalesce(item_data->>'calculation_reference','')))<3 then raise exception 'Référence du calcul social et fiscal obligatoire';end if;
 if item_state in('approved','returned','paid_recorded')and not manager then raise exception 'Validation RH requise'using errcode='42501';end if;
 if item_state='approved'and(prior.id is null or prior.state<>'submitted'or prior.created_by=auth.uid()or e.profile_id=auth.uid())then raise exception 'Un second responsable doit contrôler la paie soumise'using errcode='42501';end if;
 if item_state='paid_recorded'and(prior.state is distinct from 'approved'or length(trim(coalesce(item_data->>'payment_reference','')))<3 or(item_data-'gross'-'net'-'employer_cost'-'currency'-'payment_reference')is distinct from(prior.data-'gross'-'net'-'employer_cost'-'currency'-'payment_reference'))then raise exception 'Paie approuvée inchangée et référence de paiement requises';end if;
 elsif item_kind='document'then
 allowed:=array['path','filename','document_type','confidential'];
 if item_state is distinct from 'filed'or coalesce(item_data->>'path','')!~('^'||e.id::text||'/[0-9a-f-]{36}\.(pdf|jpg|png)$')or length(coalesce(item_data->>'filename',''))not between 1 and 180 or coalesce(item_data->>'document_type','')not in('identity','contract','certificate','other')or jsonb_typeof(item_data->'confidential')is distinct from 'boolean'then raise exception 'Document invalide';end if;
 if not exists(select 1 from storage.objects where bucket_id='hr-documents'and name=item_data->>'path')then raise exception 'Fichier privé absent';end if;
 if target_item is not null then raise exception 'Document immuable ; déposer une nouvelle version';end if;
 elsif item_kind='task'then
 allowed:=array['due_at','instructions'];if item_state is null or item_state not in('open','in_progress','waiting','completed')or length(coalesce(item_data->>'instructions',''))>5000 then raise exception 'Tâche invalide';end if;perform nullif(item_data->>'due_at','')::timestamptz;
 else raise exception 'Type RH invalide';end if;
 if exists(select 1 from jsonb_object_keys(item_data)key where key<>all(allowed))then raise exception 'Champ non autorisé';end if;
 if item_kind='payroll'then item_data:=item_data||jsonb_build_object('gross',gross,'net',gross-deductions,'employer_cost',cost,'currency','XOF');end if;
 if target_item is null then insert into public.hr_items(employee_id,kind,title,data,state,created_by,updated_by)values(e.id,item_kind,trim(item_title),item_data,item_state,auth.uid(),auth.uid())returning id into result;
 else update public.hr_items set title=trim(item_title),data=item_data,state=item_state,updated_by=auth.uid(),updated_at=clock_timestamp(),version=version+1 where id=target_item returning id into result;end if;
 insert into public.hr_events(employee_id,item_id,actor_id,action,note)values(e.id,result,auth.uid(),item_kind||'.'||item_state,trim(reason));
 select manager_id into recipient from public.department_teams where id=e.team_id;
 if recipient<>auth.uid()then insert into public.notifications(profile_id,kind,title,body,data)values(recipient,'hr_report','Mise à jour d’un dossier RH',e.display_name||' · '||item_kind,jsonb_build_object('href','/admin/hr','employee_id',e.id));end if;return result;
end;$$;
create function public.hr_create_team(team_name text,reason text)returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.department_actor_enabled()or not exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=auth.uid()and m.is_active and m.revoked_at is null and r.is_active and r.key='hr_manager')then raise exception 'Responsable RH requis'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7421));
 if length(trim(coalesce(team_name,'')))not between 2 and 120 or length(trim(coalesce(reason,'')))not between 3 and 1000 then raise exception 'Nom et motif requis';end if;
 if exists(select 1 from public.department_teams where manager_id=auth.uid()and department='hr'and is_active and lower(trim(name))=lower(trim(team_name)))or(select count(*)from public.department_teams where manager_id=auth.uid()and is_active)>=30 then raise exception 'Nom déjà utilisé ou limite atteinte';end if;
 insert into public.department_teams(name,department,manager_id,created_by)values(trim(team_name),'hr',auth.uid(),auth.uid())returning id into result;
 insert into public.department_team_events(team_id,actor_id,action,reason)values(result,auth.uid(),'team.created',trim(reason));return result;
end;$$;
revoke all on function public.hr_create_team(text,text)from public,anon;
grant execute on function public.hr_create_team(text,text)to authenticated;
create function public.hr_attendance(target_employee uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare worker uuid;
begin
 if not public.hr_employee_access(target_employee)then raise exception 'Accès RH refusé'using errcode='42501';end if;
 select profile_id into worker from public.hr_employees where id=target_employee;
 return(select coalesce(jsonb_agg(x),'[]')from(select e.action,e.created_at,e.place,e.recorded_by<>e.actor_id manager_correction from public.commercial_field_events e where e.actor_id=worker order by e.created_at desc limit 100)x);
end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('hr-documents','hr-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])on conflict(id)do nothing;
create function public.hr_storage_employee(object_name text)returns uuid language plpgsql immutable set search_path='' as $$begin if split_part(object_name,'/',1)~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'then return split_part(object_name,'/',1)::uuid;end if;return null;end;$$;
create policy "HR private upload"on storage.objects for insert to authenticated with check(bucket_id='hr-documents'and public.hr_employee_access(public.hr_storage_employee(name)));
create policy "HR orphan cleanup"on storage.objects for delete to authenticated using(bucket_id='hr-documents'and owner_id=auth.uid()::text and public.hr_employee_access(public.hr_storage_employee(name))and not exists(select 1 from public.hr_items i where i.kind='document'and i.data->>'path'=name));
create policy "HR private read"on storage.objects for select to authenticated using(bucket_id='hr-documents'and exists(select 1 from public.hr_items i where i.kind='document'and i.data->>'path'=name and public.hr_item_access(i.employee_id,i.kind,i.data)));
-- A restrictive boundary prevents pre-existing broad admin read policies exposing HR files.
create policy "HR private boundary"on storage.objects as restrictive for select to authenticated using(bucket_id<>'hr-documents'or exists(select 1 from public.hr_items i where i.kind='document'and i.data->>'path'=name and public.hr_item_access(i.employee_id,i.kind,i.data)));
revoke all on function public.hr_employee_access(uuid),public.hr_payroll_access(uuid),public.hr_item_access(uuid,text,jsonb),public.hr_save_employee(uuid,integer,uuid,uuid,jsonb,text),public.hr_save_item(uuid,integer,uuid,text,text,jsonb,text,text),public.hr_attendance(uuid),public.hr_storage_employee(text)from public,anon;
grant execute on function public.hr_employee_access(uuid),public.hr_payroll_access(uuid),public.hr_item_access(uuid,text,jsonb),public.hr_save_employee(uuid,integer,uuid,uuid,jsonb,text),public.hr_save_item(uuid,integer,uuid,text,text,jsonb,text,text),public.hr_attendance(uuid),public.hr_storage_employee(text)to authenticated;
commit;
