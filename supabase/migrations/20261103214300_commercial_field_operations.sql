begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
-- Team creation never appoints another manager or grants a new role.
create function public.commercial_create_team(team_name text,reason text)returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.department_actor_enabled() or not exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=auth.uid() and m.is_active and m.revoked_at is null and r.is_active and r.key='commercial_manager')then raise exception 'Responsable commercial requis' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7421));
 if length(trim(coalesce(team_name,'')))not between 2 and 120 or length(trim(coalesce(reason,'')))not between 2 and 1000 then raise exception 'Nom et motif requis';end if;
 if(select count(*)from public.department_teams where manager_id=auth.uid()and is_active)>=30 then raise exception 'Limite de trente équipes actives';end if;
 if exists(select 1 from public.department_teams where manager_id=auth.uid()and is_active and lower(trim(name))=lower(trim(team_name)))then raise exception 'Nom déjà utilisé';end if;
 insert into public.department_teams(name,department,manager_id,created_by)values(trim(team_name),'commercial',auth.uid(),auth.uid())returning id into result;
 insert into public.department_team_events(team_id,actor_id,action,reason)values(result,auth.uid(),'team.created',trim(reason));return result;
end;$$;
create table public.commercial_field_events(
 id uuid primary key,team_id uuid not null references public.department_teams(id),actor_id uuid not null references public.profiles(id),recorded_by uuid not null default auth.uid() references public.profiles(id),
 action text not null check(action in('shift_start','shift_end','visit_start','visit_end')),session_id uuid not null,visit_id uuid,
 lead_id uuid references public.crm_leads(id),place text not null check(length(place)<=180),body text not null default '' check(length(body)<=5000),
 latitude double precision,longitude double precision,accuracy double precision,geo_status text not null check(geo_status in('available','denied','unavailable','timeout','unsupported')),captured_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 check((geo_status='available' and latitude between -90 and 90 and longitude between -180 and 180 and accuracy between 0 and 100000 and latitude is not null and longitude is not null and accuracy is not null and captured_at is not null)or(geo_status<>'available'and latitude is null and longitude is null and accuracy is null and captured_at is null)),
 check((action in('visit_start','visit_end')and visit_id is not null and length(trim(place))>=2)or(action in('shift_start','shift_end')and visit_id is null)));
create unique index commercial_shift_once on public.commercial_field_events(session_id,action)where action in('shift_start','shift_end');
create unique index commercial_visit_once on public.commercial_field_events(visit_id,action)where action in('visit_start','visit_end');
create index commercial_field_actor_time on public.commercial_field_events(actor_id,created_at desc,id);
create index commercial_field_team_time on public.commercial_field_events(team_id,created_at desc,id);
create table public.commercial_reports(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.department_teams(id),actor_id uuid not null references public.profiles(id),
 kind text not null check(kind in('visit','case','decision','daily')),title text not null,body text not null check(length(trim(body))between 2 and 5000),source_id uuid,created_at timestamptz not null default clock_timestamp(),acknowledged_at timestamptz,acknowledged_by uuid references public.profiles(id));
create index commercial_reports_team_time on public.commercial_reports(team_id,created_at desc,id);
create index commercial_reports_actor_time on public.commercial_reports(actor_id,created_at desc,id);
create table public.commercial_appointments(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.department_teams(id),actor_id uuid not null references public.profiles(id),lead_id uuid references public.crm_leads(id),
 title text not null check(length(trim(title))between 2 and 180),place text not null check(length(trim(place))between 2 and 180),starts_at timestamptz not null,ends_at timestamptz not null,
 status text not null default 'planned' check(status in('planned','completed','cancelled')),notes text not null default ''check(length(notes)<=5000),version integer not null default 1,created_at timestamptz not null default clock_timestamp(),check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours'));
create index commercial_appointments_team_time on public.commercial_appointments(team_id,starts_at desc,id);
create index commercial_appointments_actor_time on public.commercial_appointments(actor_id,starts_at desc,id);
alter table public.commercial_field_events enable row level security;
alter table public.commercial_reports enable row level security;
alter table public.commercial_appointments enable row level security;
revoke all on public.commercial_field_events,public.commercial_reports,public.commercial_appointments from public,anon,authenticated;
grant select on public.commercial_field_events,public.commercial_reports,public.commercial_appointments to authenticated;
create policy "Commercial field scoped" on public.commercial_field_events for select to authenticated using(public.department_can_access(team_id,actor_id));
create policy "Commercial report scoped" on public.commercial_reports for select to authenticated using(public.department_can_access(team_id,actor_id));
create policy "Commercial appointment scoped" on public.commercial_appointments for select to authenticated using(public.department_can_access(team_id,actor_id));
-- Only internal triggers/RPCs may write reports. Notifications contain no GPS or dossier details.
create function public.commercial_report_notify()returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select manager_id into recipient from public.department_teams where id=new.team_id and is_active;
 if recipient is not null and public.department_manager_enabled(new.team_id)then
 insert into public.notifications(profile_id,kind,title,body,data)values(recipient,'commercial_report','Nouveau rapport commercial',new.title,jsonb_build_object('href','/commercial/reports','report_id',new.id,'team_id',new.team_id));end if;
 return new;
end;$$;
create trigger commercial_report_delivery after insert on public.commercial_reports for each row execute function public.commercial_report_notify();
create function public.commercial_clock(request_id uuid,target_team uuid,target_action text,target_lead uuid,place_name text,report_body text,geo jsonb)returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.commercial_field_events; current_visit public.commercial_field_events; old_event public.commercial_field_events; sid uuid; vid uuid; lat double precision;lon double precision;acc double precision;captured timestamptz;gs text;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7421));
 perform 1 from public.department_teams where id=target_team and department='commercial' for update;
 if not found or not public.department_can_access(target_team,auth.uid())then raise exception 'Équipe commerciale active requise' using errcode='42501';end if;
 if request_id is null or target_action is null or target_action not in('shift_start','shift_end','visit_start','visit_end')then raise exception 'Pointage invalide';end if;
 select * into old_event from public.commercial_field_events where id=request_id;
 if found then if old_event.actor_id=auth.uid()and old_event.team_id=target_team and old_event.action=target_action then return old_event.id;else raise exception 'Identifiant déjà utilisé' using errcode='42501';end if;end if;
 gs:=geo->>'status';
 if gs is null or gs not in('available','denied','unavailable','timeout','unsupported')then raise exception 'État GPS requis';end if;
 if gs='available'then
 lat:=(geo->>'latitude')::double precision;lon:=(geo->>'longitude')::double precision;acc:=(geo->>'accuracy')::double precision;captured:=(geo->>'captured_at')::timestamptz;
 if lat is null or lon is null or acc is null or captured is null or not(lat between -90 and 90 and lon between -180 and 180 and acc between 0 and 100000)or captured<clock_timestamp()-interval '5 minutes'or captured>clock_timestamp()+interval '1 minute'then raise exception 'Position invalide ou périmée';end if;
 elsif geo ? 'latitude' or geo ? 'longitude' or geo ? 'accuracy' or geo ? 'captured_at'then raise exception 'Coordonnées incompatibles avec absence GPS';end if;
 if length(coalesce(report_body,''))>5000 or length(coalesce(place_name,''))>180 then raise exception 'Texte trop long';end if;
 select * into prior from public.commercial_field_events e where actor_id=auth.uid()and action='shift_start'and public.department_can_access(team_id,actor_id)and not exists(select 1 from public.commercial_field_events z where z.session_id=e.session_id and z.action='shift_end')order by created_at desc limit 1;
 if target_action='shift_start'then
 if prior.id is not null then raise exception 'Une journée est déjà ouverte';end if;sid:=request_id;
 else
 if prior.id is null or prior.team_id<>target_team then raise exception 'Ouvrez votre journée dans cette équipe';end if;sid:=prior.session_id;
 end if;
 select * into current_visit from public.commercial_field_events e where e.session_id=sid and e.action='visit_start'and not exists(select 1 from public.commercial_field_events z where z.visit_id=e.visit_id and z.action='visit_end')limit 1;
 if target_action='visit_start'then
 if current_visit.id is not null then raise exception 'Terminez la visite en cours';end if;
 if length(trim(coalesce(place_name,'')))<2 then raise exception 'Lieu de visite requis';end if;
 if target_lead is null or not exists(select 1 from public.crm_leads l where l.id=target_lead and l.team_id=target_team and l.archived_at is null and public.department_crm_access(l.team_id,l.assigned_to))then raise exception 'Prospect accessible requis' using errcode='42501';end if;
 vid:=request_id;
 elsif target_action='visit_end'then
 if current_visit.id is null then raise exception 'Aucune visite ouverte';end if;
 if length(trim(coalesce(report_body,'')))<3 then raise exception 'Compte rendu obligatoire';end if;
 vid:=current_visit.visit_id;target_lead:=current_visit.lead_id;place_name:=current_visit.place;
 elsif target_action='shift_end'then
 if current_visit.id is not null then raise exception 'Terminez la visite avant la journée';end if;
 if length(trim(coalesce(report_body,'')))<3 then raise exception 'Bilan de journée obligatoire';end if;
 end if;
 insert into public.commercial_field_events(id,team_id,actor_id,action,session_id,visit_id,lead_id,place,body,latitude,longitude,accuracy,geo_status,captured_at)
 values(request_id,target_team,auth.uid(),target_action,sid,vid,case when vid is null then null else target_lead end,case when vid is null then ''else trim(place_name)end,trim(coalesce(report_body,'')),lat,lon,acc,gs,captured);
 if target_action in('visit_end','shift_end')then insert into public.commercial_reports(team_id,actor_id,kind,title,body,source_id)values(target_team,auth.uid(),case target_action when 'visit_end'then 'visit'else 'daily'end,case target_action when 'visit_end'then 'Visite : '||place_name else 'Bilan de journée'end,trim(report_body),request_id);end if;
 return request_id;
end;$$;
create function public.commercial_field_state()returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.commercial_field_events;v public.commercial_field_events;
begin
 if not public.department_actor_enabled() or not public.has_admin_permission('commercial.cases')then raise exception 'Accès commercial requis' using errcode='42501';end if;
 select * into s from public.commercial_field_events e where actor_id=auth.uid()and action='shift_start'and public.department_can_access(team_id,actor_id)and not exists(select 1 from public.commercial_field_events z where z.session_id=e.session_id and z.action='shift_end')order by created_at desc limit 1;
 if s.id is not null then select * into v from public.commercial_field_events e where session_id=s.session_id and action='visit_start'and not exists(select 1 from public.commercial_field_events z where z.visit_id=e.visit_id and z.action='visit_end')limit 1;end if;
 return jsonb_build_object('shift',case when s.id is null then null else to_jsonb(s)end,'visit',case when v.id is null then null else to_jsonb(v)end);
end;$$;
create function public.commercial_acknowledge_report(target_report uuid)returns void language plpgsql security definer set search_path='' as $$
begin
 update public.commercial_reports set acknowledged_at=clock_timestamp(),acknowledged_by=auth.uid()where id=target_report and acknowledged_at is null and public.department_can_manage(team_id);
 if not found and not exists(select 1 from public.commercial_reports where id=target_report and public.department_can_manage(team_id))then raise exception 'Rapport inaccessible' using errcode='42501';end if;
end;$$;
create function public.commercial_save_appointment(target_id uuid,target_version integer,target_team uuid,target_lead uuid,appointment_title text,appointment_place text,start_time timestamptz,end_time timestamptz,new_status text,report_body text)returns uuid language plpgsql security definer set search_path='' as $$
declare item public.commercial_appointments; result uuid;
begin
 perform pg_advisory_xact_lock(7341,1); -- Serialize appointment overlap checks across agents and managers.
 if not exists(select 1 from public.department_teams where id=target_team and department='commercial')or not public.department_can_access(target_team,auth.uid())then raise exception 'Équipe inaccessible' using errcode='42501';end if;
 if new_status is null or new_status not in('planned','completed','cancelled')or length(trim(coalesce(appointment_title,'')))not between 2 and 180 or length(trim(coalesce(appointment_place,'')))not between 2 and 180 or start_time is null or end_time is null or end_time<=start_time or end_time>start_time+interval '24 hours'or length(coalesce(report_body,''))>5000 then raise exception 'Rendez-vous invalide';end if;
 if new_status<>'planned'and length(trim(coalesce(report_body,'')))<3 then raise exception 'Compte rendu requis';end if;
 if target_lead is not null and not exists(select 1 from public.crm_leads l where id=target_lead and team_id=target_team and archived_at is null and public.department_crm_access(l.team_id,l.assigned_to))then raise exception 'Prospect inaccessible' using errcode='42501';end if;
 if target_id is not null then select * into item from public.commercial_appointments where id=target_id for update;if not found or item.team_id<>target_team or not public.department_can_access(item.team_id,item.actor_id)then raise exception 'Rendez-vous inaccessible' using errcode='42501';end if;if item.version is distinct from target_version then raise exception 'Rendez-vous modifié' using errcode='40001';end if;end if;
 if new_status='planned'and exists(select 1 from public.commercial_appointments where actor_id=coalesce(item.actor_id,auth.uid())and status='planned'and id is distinct from target_id and starts_at<end_time and ends_at>start_time)then raise exception 'Un rendez-vous chevauche cet horaire';end if;
 if target_id is null then insert into public.commercial_appointments(team_id,actor_id,lead_id,title,place,starts_at,ends_at,status,notes)values(target_team,auth.uid(),target_lead,trim(appointment_title),trim(appointment_place),start_time,end_time,new_status,trim(coalesce(report_body,'')))returning id into result;
 else update public.commercial_appointments set lead_id=target_lead,title=trim(appointment_title),place=trim(appointment_place),starts_at=start_time,ends_at=end_time,status=new_status,notes=trim(coalesce(report_body,'')),version=version+1 where id=target_id returning id into result;end if;
 if new_status<>'planned'and (target_id is null or item.status is distinct from new_status)then insert into public.commercial_reports(team_id,actor_id,kind,title,body,source_id)values(target_team,auth.uid(),'case','Rendez-vous : '||trim(appointment_title),trim(report_body),result);end if;
 return result;
end;$$;
create function public.commercial_close_day(target_start uuid,reason text)returns void language plpgsql security definer set search_path='' as $$
declare s public.commercial_field_events;v public.commercial_field_events;
begin
 select * into s from public.commercial_field_events where id=target_start and action='shift_start';
 if not found or not public.department_can_manage(s.team_id)then raise exception 'Responsable de cette équipe requis' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(s.actor_id::text,7421));
 perform 1 from public.department_teams where id=s.team_id for update;
 if not public.department_can_manage(s.team_id)then raise exception 'Accès révoqué' using errcode='42501';end if;
 if length(trim(coalesce(reason,'')))not between 3 and 1000 then raise exception 'Motif requis';end if;
 if exists(select 1 from public.commercial_field_events where session_id=s.session_id and action='shift_end')then return;end if;
 select * into v from public.commercial_field_events e where session_id=s.session_id and action='visit_start'and not exists(select 1 from public.commercial_field_events z where z.visit_id=e.visit_id and z.action='visit_end')limit 1;
 if v.id is not null then insert into public.commercial_field_events(id,team_id,actor_id,action,session_id,visit_id,lead_id,place,body,geo_status)values(gen_random_uuid(),s.team_id,s.actor_id,'visit_end',s.session_id,v.visit_id,v.lead_id,v.place,'Clôture par responsable : '||trim(reason),'unsupported');end if;
 insert into public.commercial_field_events(id,team_id,actor_id,action,session_id,place,body,geo_status)values(gen_random_uuid(),s.team_id,s.actor_id,'shift_end',s.session_id,'','Clôture par responsable : '||trim(reason),'unsupported');
 insert into public.commercial_reports(team_id,actor_id,kind,title,body,source_id)values(s.team_id,auth.uid(),'daily','Clôture de journée par le responsable',trim(reason),target_start);
end;$$;
revoke all on function public.commercial_close_day(uuid,text)from public,anon;
grant execute on function public.commercial_close_day(uuid,text)to authenticated;
create function public.commercial_case_report()returns trigger language plpgsql security definer set search_path='' as $$
declare c public.department_cases;
begin
 select * into c from public.department_cases where id=new.case_id;
 if exists(select 1 from public.department_teams where id=c.team_id and department='commercial')then insert into public.commercial_reports(team_id,actor_id,kind,title,body,source_id)values(c.team_id,new.actor_id,'case',c.title,new.body,new.id);end if;return new;
end;$$;
create trigger commercial_case_report_delivery after insert on public.department_case_events for each row execute function public.commercial_case_report();
create function public.commercial_decision_report()returns trigger language plpgsql security definer set search_path='' as $$
declare c public.department_cases;
begin
 if new.status is not distinct from old.status and new.rejection_reason is not distinct from old.rejection_reason then return new;end if;
 if new.status not in('verified','approved','rejected','additional_information_required','under_review')or auth.uid()is null then return new;end if;
 select * into c from public.department_cases where provider_id=new.provider_id;
 if c.id is not null and public.department_can_access(c.team_id,c.assigned_to)then insert into public.commercial_reports(team_id,actor_id,kind,title,body,source_id)values(c.team_id,auth.uid(),'decision','Dossier : '||c.title||' · '||new.status,coalesce(nullif(trim(new.rejection_reason),''),'Décision enregistrée'),new.provider_id);end if;return new;
end;$$;
create trigger commercial_decision_delivery after update on public.professional_onboarding for each row execute function public.commercial_decision_report();
revoke all on function public.commercial_report_notify(),public.commercial_case_report(),public.commercial_decision_report()from public,anon,authenticated;
revoke all on function public.commercial_create_team(text,text),public.commercial_clock(uuid,uuid,text,uuid,text,text,jsonb),public.commercial_field_state(),public.commercial_acknowledge_report(uuid),public.commercial_save_appointment(uuid,integer,uuid,uuid,text,text,timestamptz,timestamptz,text,text)from public,anon;
grant execute on function public.commercial_create_team(text,text),public.commercial_clock(uuid,uuid,text,uuid,text,text,jsonb),public.commercial_field_state(),public.commercial_acknowledge_report(uuid),public.commercial_save_appointment(uuid,integer,uuid,uuid,text,text,timestamptz,timestamptz,text,text)to authenticated;
commit;
