begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
-- Delegated services are distinct from historical broad internal roles.
insert into public.admin_permissions(key,domain,description,is_sensitive) values
 ('payouts.read','finance','Lecture des versements sans gestion',true),('teams.manage','teams','Gérer ses équipes déléguées',true),('commercial.cases','commercial','Dossiers commerciaux attribués',true),('finance.cases','finance','Dossiers financiers attribués',true),('support.cases','support','Réclamations attribuées',true) on conflict(key) do nothing;
insert into public.admin_roles(key,name,description,is_system) values
 ('commercial_manager','Responsable commercial','Supervision de ses équipes commerciales',true),('commercial_agent','Commercial d’équipe','Prospects et dossiers attribués',true),
 ('finance_manager','Responsable financier','Supervision financière et équipes déléguées',true),('finance_agent','Agent financier','Dossiers attribués uniquement',true),
 ('support_manager','Responsable service client','Supervision de ses équipes support',true),('support_agent','Agent service client','Réclamations attribuées',true) on conflict(key) do nothing;
insert into public.admin_role_permissions(role_id,permission_key)
select r.id,p.permission from public.admin_roles r cross join lateral unnest(case r.key
 when 'commercial_manager' then array['teams.manage','crm.manage','commercial.cases'] when 'commercial_agent' then array['crm.manage','commercial.cases']
 when 'finance_manager' then array['teams.manage','finance.cases','payments.read','payouts.read'] when 'finance_agent' then array['finance.cases']
 when 'support_manager' then array['teams.manage','support.cases'] when 'support_agent' then array['support.cases']
 when 'commercial' then array['commercial.cases'] when 'finance' then array['finance.cases','payouts.read'] when 'support' then array['support.cases']
 when 'super_admin' then array['teams.manage','commercial.cases','finance.cases','support.cases'] else '{}'::text[] end)p(permission) on conflict do nothing;
create policy "Delegated finance payout read" on public.payouts for select to authenticated using(public.has_admin_permission('payouts.read'));
create policy "Delegated finance payout batch read" on public.payout_batches for select to authenticated using(public.has_admin_permission('payouts.read'));
create table public.department_teams(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 2 and 120),department text not null check(department in('commercial','finance','support')),
 manager_id uuid not null references public.profiles(id),is_active boolean not null default true,version integer not null default 1,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create table public.department_team_members(team_id uuid not null references public.department_teams(id),user_id uuid not null references public.profiles(id),status text not null default 'active' check(status in('active','suspended','revoked')),added_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),primary key(team_id,user_id));
create unique index department_one_active_team on public.department_team_members(user_id) where status in('active','suspended');
create index department_teams_manager on public.department_teams(manager_id) where is_active;
create table public.department_team_events(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.department_teams(id),actor_id uuid not null references public.profiles(id),target_id uuid references public.profiles(id),action text not null,reason text not null check(length(trim(reason)) between 2 and 1000),created_at timestamptz not null default now());
create index department_events_team_time on public.department_team_events(team_id,created_at desc);
alter table public.internal_invitations add column department_team_id uuid references public.department_teams(id);
create index department_invitations_team on public.internal_invitations(department_team_id) where department_team_id is not null;
create function public.department_actor_enabled()returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.admin_mfa_required() and exists(select 1 from public.profiles p join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id where p.id=auth.uid() and p.role='admin' and p.account_status='active' and not p.is_suspended and m.is_active and m.revoked_at is null and r.is_active);$$;
create function public.department_manager_enabled(target_team uuid)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.department_teams t join public.profiles p on p.id=t.manager_id join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id where t.id=target_team and t.is_active and p.role='admin' and p.account_status='active' and not p.is_suspended and m.is_active and m.revoked_at is null and r.is_active and r.key=t.department||'_manager');$$;
create function public.department_can_manage(target_team uuid)returns boolean language sql stable security definer set search_path='' as $$
 select public.department_actor_enabled() and(public.is_super_admin() or(public.has_admin_permission('teams.manage') and public.department_manager_enabled(target_team) and exists(select 1 from public.department_teams where id=target_team and manager_id=auth.uid())));$$;
create function public.department_can_access(target_team uuid,target_assignee uuid)returns boolean language sql stable security definer set search_path='' as $$
 select public.department_actor_enabled() and(public.is_super_admin() or(public.department_manager_enabled(target_team) and(public.department_can_manage(target_team) or(target_assignee=auth.uid() and exists(select 1 from public.department_team_members m join public.department_teams t on t.id=m.team_id where m.team_id=target_team and m.user_id=auth.uid() and m.status='active' and public.has_admin_permission(t.department||'.cases'))))));$$;
create function public.department_is_assignee(target_team uuid,target_user uuid)returns boolean language sql stable security definer set search_path='' as $$
 select public.department_manager_enabled(target_team) and exists(select 1 from public.department_teams t join public.profiles p on p.id=target_user where t.id=target_team and p.role='admin'and p.account_status='active' and not p.is_suspended and(t.manager_id=target_user or exists(select 1 from public.department_team_members m join public.admin_user_roles ar on ar.user_id=m.user_id join public.admin_roles r on r.id=ar.role_id where m.team_id=t.id and m.user_id=target_user and m.status='active' and ar.is_active and ar.revoked_at is null and r.is_active and r.key=t.department||'_agent')));$$;
alter table public.department_teams enable row level security;
alter table public.department_team_members enable row level security;
alter table public.department_team_events enable row level security;
revoke all on public.department_teams,public.department_team_members,public.department_team_events from public,anon,authenticated;
grant select on public.department_teams,public.department_team_members,public.department_team_events to authenticated;
create policy "Department team scope" on public.department_teams for select to authenticated using(public.department_can_manage(id) or public.department_can_access(id,auth.uid()));
create policy "Department member scope" on public.department_team_members for select to authenticated using(public.department_can_manage(team_id) or(user_id=auth.uid() and public.department_can_access(team_id,user_id)));
create policy "Department events managers" on public.department_team_events for select to authenticated using(public.department_can_manage(team_id));
create function public.department_set_team(target_team uuid,target_version integer,target_department text,target_name text,manager_email text,enabled boolean,reason text)returns uuid language plpgsql security definer set search_path='' as $$
declare target_manager uuid; result_id uuid; old_manager uuid; dept text;
begin
 if not public.department_actor_enabled() or not public.is_super_admin() then raise exception 'Super Admin requis' using errcode='42501';end if;
 if length(trim(coalesce(reason,''))) not between 2 and 1000 or length(trim(coalesce(target_name,''))) not between 2 and 120 or enabled is null then raise exception 'Informations invalides';end if;
 select u.id into target_manager from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=lower(trim(manager_email)) and u.email_confirmed_at is not null and p.account_status='active' and not p.is_suspended;
 if target_manager is null or target_manager=auth.uid() then raise exception 'Autre compte confirmé actif requis';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_manager::text,7421));
 if target_team is null then dept:=target_department;else select department,manager_id into dept,old_manager from public.department_teams where id=target_team and version=target_version for update;if not found then raise exception 'Équipe modifiée' using errcode='40001';end if;end if;
 if dept is null or dept not in('commercial','finance','support') then raise exception 'Service invalide';end if;
 if exists(select 1 from public.department_team_members where user_id=target_manager and status in('active','suspended')) or exists(select 1 from public.department_teams where manager_id=target_manager and department<>dept and is_active) then raise exception 'Ce compte appartient déjà à une autre équipe ou branche';end if;
 if exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=target_manager and m.is_active and m.revoked_at is null and r.key<>dept||'_manager') then raise exception 'Retirez explicitement les autres rôles avant cette délégation';end if;
 perform public.admin_assign_role(target_manager,dept||'_manager',reason);
 if target_team is null then insert into public.department_teams(name,department,manager_id,is_active,created_by)values(trim(target_name),dept,target_manager,enabled,auth.uid())returning id into result_id;
 else update public.department_teams set name=trim(target_name),manager_id=target_manager,is_active=enabled,version=version+1 where id=target_team returning id into result_id;end if;
 if old_manager is not null and old_manager<>target_manager and not exists(select 1 from public.department_teams where manager_id=old_manager and is_active) then update public.admin_user_roles m set is_active=false,revoked_at=now() from public.admin_roles r where r.id=m.role_id and m.user_id=old_manager and r.key=dept||'_manager';end if;
 if not exists(select 1 from public.department_teams where manager_id=target_manager and is_active) then update public.admin_user_roles m set is_active=false,revoked_at=now() from public.admin_roles r where r.id=m.role_id and m.user_id=target_manager and r.key=dept||'_manager';end if;
 insert into public.department_team_events(team_id,actor_id,target_id,action,reason)values(result_id,auth.uid(),target_manager,'team.delegated',trim(reason));return result_id;
end;$$;
create function public.department_add_member(target_team uuid,target_email text,reason text)returns uuid language plpgsql security definer set search_path='' as $$
declare target_user uuid; worker_role text; worker_id uuid;
begin
 perform 1 from public.department_teams where id=target_team for update;
 if not public.department_can_manage(target_team) or not public.department_manager_enabled(target_team) then raise exception 'Responsable de cette équipe requis' using errcode='42501';end if;
 if length(trim(coalesce(reason,''))) not between 2 and 1000 then raise exception 'Justification requise';end if;
 select department||'_agent' into worker_role from public.department_teams where id=target_team;
 select u.id into target_user from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=lower(trim(target_email)) and u.email_confirmed_at is not null and p.account_status='active' and not p.is_suspended;
 if target_user is null or target_user=auth.uid() then raise exception 'Autre compte confirmé actif requis';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_user::text,7421));
 if exists(select 1 from public.admin_user_roles where user_id=target_user and is_active and revoked_at is null) or exists(select 1 from public.department_teams where manager_id=target_user and is_active) or exists(select 1 from public.department_team_members where user_id=target_user and status in('active','suspended')) then raise exception 'Ce compte possède déjà un accès interne ; transfert réservé au Super Admin';end if;
 select id into worker_id from public.admin_roles where key=worker_role and is_active;
 insert into public.admin_user_roles(user_id,role_id,assigned_by,requires_mfa,is_active,revoked_at)values(target_user,worker_id,auth.uid(),true,true,null)on conflict(user_id,role_id)do update set assigned_by=auth.uid(),requires_mfa=true,is_active=true,revoked_at=null;
 insert into public.department_team_members(team_id,user_id,added_by)values(target_team,target_user,auth.uid())on conflict(team_id,user_id)do update set status='active',added_by=auth.uid();
 update public.profiles set role='admin' where id=target_user;
 insert into public.department_team_events(team_id,actor_id,target_id,action,reason)values(target_team,auth.uid(),target_user,'member.added',trim(reason));return target_user;
end;$$;
create function public.department_member_action(target_team uuid,target_user uuid,target_action text,reason text)returns void language plpgsql security definer set search_path='' as $$
declare prior text;worker_role text;
begin
 perform 1 from public.department_teams where id=target_team for update;
 if not public.department_can_manage(target_team) or target_user=auth.uid() then raise exception 'Responsable de cette équipe requis' using errcode='42501';end if;
 if target_action is null or target_action not in('suspend','reactivate','revoke') or length(trim(coalesce(reason,''))) not between 2 and 1000 then raise exception 'Action invalide';end if;
 select status into prior from public.department_team_members where team_id=target_team and user_id=target_user for update;
 if not found or(prior='revoked' and target_action<>'revoke')then raise exception 'Nouvelle attribution explicite requise';end if;
 select department||'_agent' into worker_role from public.department_teams where id=target_team;
 if target_action='reactivate'and(not exists(select 1 from public.profiles where id=target_user and account_status='active'and not is_suspended)or exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=target_user and m.is_active and m.revoked_at is null and r.key<>worker_role)or exists(select 1 from public.department_teams where manager_id=target_user and is_active))then raise exception 'Autre accès ou compte indisponible : décision du Super Admin requise' using errcode='42501';end if;
 update public.department_team_members set status=case target_action when 'suspend' then 'suspended' when 'reactivate' then 'active' else 'revoked' end where team_id=target_team and user_id=target_user;
 update public.admin_user_roles m set is_active=(target_action='reactivate'),revoked_at=case when target_action='revoke' then now() else null end from public.admin_roles r where r.id=m.role_id and m.user_id=target_user and r.key=worker_role;
 update public.internal_invitations set status=case target_action when 'revoke' then 'revoked' when 'suspend' then 'suspended' else 'active' end where department_team_id=target_team and user_id=target_user;
 insert into public.department_team_events(team_id,actor_id,target_id,action,reason)values(target_team,auth.uid(),target_user,'member.'||target_action,trim(reason));
end;$$;
create function public.department_prepare_invitation(target_team uuid,target_email text,given_name text,family_name text)returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;worker_role text;
begin
 perform 1 from public.department_teams where id=target_team for update;
 if not public.department_can_manage(target_team) or not public.department_manager_enabled(target_team) then raise exception 'Responsable requis' using errcode='42501';end if;
 if length(trim(coalesce(given_name,''))) not between 1 and 100 or length(trim(coalesce(family_name,''))) not between 1 and 100 or coalesce(target_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(target_email)>254 then raise exception 'Invitation invalide';end if;
 if exists(select 1 from auth.users where lower(email)=lower(trim(target_email))) then raise exception 'Utilisez Ajouter un compte existant';end if;
 if(select count(*)from public.internal_invitations where invited_by=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Trop d’invitations';end if;
 select department||'_agent' into worker_role from public.department_teams where id=target_team;
 insert into public.internal_invitations(email,first_name,last_name,role_key,invited_by,department_team_id)values(lower(trim(target_email)),trim(given_name),trim(family_name),worker_role,auth.uid(),target_team)returning id into result_id;
 insert into public.department_team_events(team_id,actor_id,action,reason)values(target_team,auth.uid(),'invitation.prepared','Invitation d’un nouvel agent préparée');return result_id;
end;$$;
create function public.department_bind_invitation(target_team uuid,target_invitation uuid,target_user uuid)returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.department_teams where id=target_team for update;
 if not public.department_can_manage(target_team) or not public.department_manager_enabled(target_team) then raise exception 'Accès refusé' using errcode='42501';end if;
 if exists(select 1 from public.admin_user_roles where user_id=target_user and is_active and revoked_at is null)then raise exception 'Accès interne déjà présent' using errcode='42501';end if;
 update public.internal_invitations i set user_id=target_user where i.id=target_invitation and i.department_team_id=target_team and i.status='pending' and i.expires_at>now() and(i.user_id is null or i.user_id=target_user)and exists(select 1 from auth.users u where u.id=target_user and lower(u.email)=i.email and u.invited_at is not null);
 if not found then raise exception 'Invitation inaccessible' using errcode='42501';end if;
 update public.profiles p set first_name=i.first_name,last_name=i.last_name,display_name=i.first_name||' '||i.last_name from public.internal_invitations i where p.id=target_user and i.id=target_invitation;
end;$$;
create function public.department_resend_invitation(target_team uuid,target_invitation uuid)returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.department_teams where id=target_team for update;
 if not public.department_can_manage(target_team)or not public.department_manager_enabled(target_team)then raise exception 'Accès refusé' using errcode='42501';end if;
 update public.internal_invitations set invited_by=auth.uid(),expires_at=now()+interval '24 hours',sent_at=now(),delivery_version=delivery_version+1,provider_message_id=null where id=target_invitation and department_team_id=target_team and status='pending' and coalesce(sent_at,created_at)<now()-interval '60 seconds';
 if not found then raise exception 'Invitation indisponible ou dernier envoi trop récent';end if;
 insert into public.department_team_events(team_id,actor_id,action,reason)values(target_team,auth.uid(),'invitation.renewed','Invitation renouvelée par le responsable actuel');
end;$$;
create function public.department_revoke_invitation(target_team uuid,target_invitation uuid)returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.department_teams where id=target_team for update;
 if not public.department_can_manage(target_team)then raise exception 'Accès refusé' using errcode='42501';end if;
 update public.internal_invitations set status='revoked' where id=target_invitation and department_team_id=target_team and status='pending';if not found then raise exception 'Invitation inaccessible' using errcode='42501';end if;
 insert into public.department_team_events(team_id,actor_id,action,reason)values(target_team,auth.uid(),'invitation.revoked','Invitation retirée par le responsable');
end;$$;
create table public.department_cases(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.department_teams(id),assigned_to uuid not null references public.profiles(id),title text not null check(length(trim(title))between 2 and 180),details text not null default '' check(length(details)<=4000),status text not null default 'open' check(status in('open','in_progress','waiting','completed')),provider_id uuid references public.provider_profiles(profile_id)on delete set null,payment_id uuid references public.payments(id)on delete set null,ticket_id uuid references public.support_tickets(id)on delete set null,due_at timestamptz,version integer not null default 1,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index department_case_ticket_unique on public.department_cases(ticket_id)where ticket_id is not null;
create unique index department_case_provider_unique on public.department_cases(provider_id)where provider_id is not null;
create index department_cases_scope on public.department_cases(team_id,assigned_to,updated_at desc);
create table public.department_case_events(id uuid primary key default gen_random_uuid(),case_id uuid not null references public.department_cases(id),actor_id uuid not null references public.profiles(id),body text not null check(length(trim(body))between 1 and 5000),created_at timestamptz not null default now());
create index department_case_events_time on public.department_case_events(case_id,created_at desc);
alter table public.department_cases enable row level security;
alter table public.department_case_events enable row level security;
revoke all on public.department_cases,public.department_case_events from public,anon,authenticated;
grant select on public.department_cases,public.department_case_events to authenticated;
create policy "Department assigned cases" on public.department_cases for select to authenticated using(public.department_can_access(team_id,assigned_to));
create policy "Department assigned case history" on public.department_case_events for select to authenticated using(exists(select 1 from public.department_cases c where c.id=case_id and public.department_can_access(c.team_id,c.assigned_to)));
create function public.department_save_case(target_case uuid,target_version integer,target_team uuid,target_assignee uuid,case_title text,case_details text,case_due timestamptz,linked_provider uuid default null,linked_payment uuid default null,linked_ticket uuid default null)returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;dept text;
begin
 perform 1 from public.department_teams where id=target_team for update;
 if not public.department_can_manage(target_team)or not public.department_is_assignee(target_team,target_assignee)then raise exception 'Affectation refusée' using errcode='42501';end if;
 select department into dept from public.department_teams where id=target_team;
 if(dept<>'commercial' and linked_provider is not null)or(dept<>'finance' and linked_payment is not null)or(dept<>'support' and linked_ticket is not null)then raise exception 'Référence hors du service';end if;
 if linked_provider is not null then perform pg_advisory_xact_lock(hashtextextended(linked_provider::text,7422));end if;
 if linked_provider is not null and not public.is_super_admin()and exists(select 1 from public.crm_leads l where l.linked_provider_id=linked_provider and l.team_id is distinct from target_team)then raise exception 'Dossier lié à une autre équipe' using errcode='42501';end if;
 if linked_ticket is not null and not public.is_super_admin()and exists(select 1 from public.support_tickets where id=linked_ticket and assigned_to is not null and not public.department_is_assignee(target_team,assigned_to))then raise exception 'Réclamation affectée ailleurs' using errcode='42501';end if;
 if target_case is null then insert into public.department_cases(team_id,assigned_to,title,details,due_at,provider_id,payment_id,ticket_id,created_by)values(target_team,target_assignee,trim(case_title),trim(case_details),case_due,linked_provider,linked_payment,linked_ticket,auth.uid())returning id into result_id;
 else update public.department_cases set assigned_to=target_assignee,title=trim(case_title),details=trim(case_details),due_at=case_due,provider_id=linked_provider,payment_id=linked_payment,ticket_id=linked_ticket,version=version+1,updated_at=now()where id=target_case and team_id=target_team and version=target_version returning id into result_id;if not found then raise exception 'Dossier modifié ou inaccessible' using errcode='40001';end if;end if;
 if linked_ticket is not null then update public.support_tickets set assigned_to=target_assignee where id=linked_ticket;end if;
 insert into public.department_case_events(case_id,actor_id,body)values(result_id,auth.uid(),'Dossier affecté ou mis à jour par le responsable');
 insert into public.notifications(profile_id,kind,title,body,data)values(target_assignee,'department_assignment','Un dossier vous est attribué',trim(case_title),jsonb_build_object('href',case dept when 'commercial'then '/commercial/cases' when 'finance'then '/finance/cases' else '/support-agent/cases' end));return result_id;
end;$$;
create function public.department_update_case(target_case uuid,target_version integer,new_status text,note text)returns void language plpgsql security definer set search_path='' as $$
declare item public.department_cases;
begin
 select * into item from public.department_cases where id=target_case for update;
 if not found or not public.department_can_access(item.team_id,item.assigned_to)then raise exception 'Dossier inaccessible' using errcode='42501';end if;
 if item.version<>target_version then raise exception 'Dossier modifié' using errcode='40001';end if;
 if new_status is null or new_status not in('open','in_progress','waiting','completed')or length(trim(coalesce(note,'')))not between 2 and 5000 then raise exception 'Statut et compte rendu requis';end if;
 update public.department_cases set status=new_status,version=version+1,updated_at=now()where id=item.id;
 insert into public.department_case_events(case_id,actor_id,body)values(item.id,auth.uid(),trim(note));
 if item.ticket_id is not null then update public.support_tickets set status=case new_status when 'completed'then 'resolved' when 'waiting'then 'pending' else 'open'end,updated_at=now()where id=item.ticket_id;end if;
 -- No payment/refund/payout is triggered by case tracking.
end;$$;
create function public.department_case_detail(target_case uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item public.department_cases;result jsonb;dept text;
begin
 select * into item from public.department_cases where id=target_case;if not found or not public.department_can_access(item.team_id,item.assigned_to)then raise exception 'Dossier inaccessible' using errcode='42501';end if;
 select department into dept from public.department_teams where id=item.team_id;
 result:=jsonb_build_object('case',to_jsonb(item),'events',(select coalesce(jsonb_agg(x order by x.created_at),'[]')from(select e.id,e.body,e.created_at,p.display_name actor_name from public.department_case_events e join public.profiles p on p.id=e.actor_id where e.case_id=item.id order by e.created_at desc limit 100)x));
 if dept='finance'and item.payment_id is not null then result:=result||jsonb_build_object('payment',(select jsonb_build_object('amount',coalesce(p.gross_amount,p.amount),'currency',trim(p.currency),'status',p.payment_status,'is_test',p.is_test or p.provider='mock')from public.payments p where p.id=item.payment_id));end if;
 if dept='support'and item.ticket_id is not null then result:=result||jsonb_build_object('ticket',(select jsonb_build_object('subject',subject,'status',status,'priority',priority)from public.support_tickets where id=item.ticket_id),'messages',(select coalesce(jsonb_agg(x order by x.created_at),'[]')from(select id,body,is_internal,created_at from public.support_messages where ticket_id=item.ticket_id order by created_at desc limit 100)x));end if;return result;
end;$$;
create function public.department_reply_case(target_case uuid,message text,internal_note boolean)returns void language plpgsql security definer set search_path='' as $$
declare item public.department_cases;
begin
 select * into item from public.department_cases where id=target_case for update;if not found or not public.department_can_access(item.team_id,item.assigned_to)or item.ticket_id is null then raise exception 'Réclamation inaccessible' using errcode='42501';end if;
 if length(trim(coalesce(message,'')))not between 2 and 5000 or internal_note is null then raise exception 'Message invalide';end if;
 insert into public.support_messages(ticket_id,sender_id,body,is_internal)values(item.ticket_id,auth.uid(),trim(message),internal_note);
 insert into public.department_case_events(case_id,actor_id,body)values(item.id,auth.uid(),case when internal_note then 'Note interne ajoutée à la réclamation'else 'Réponse publiée dans la réclamation'end);
end;$$;
alter table public.crm_leads add column team_id uuid references public.department_teams(id);
create index crm_leads_team_scope on public.crm_leads(team_id,assigned_to);
grant insert(team_id)on public.crm_leads to authenticated;
create function public.department_provider_access(target_provider uuid)returns boolean language sql stable security definer set search_path='' as $$
 select public.department_actor_enabled()and public.has_admin_permission('commercial.cases')and exists(select 1 from public.department_cases c where c.provider_id=target_provider and public.department_can_access(c.team_id,c.assigned_to));$$;
create function public.department_my_teams()returns table(id uuid,name text,department text,is_manager boolean)language sql stable security definer set search_path='' as $$
 select t.id,t.name,t.department,public.department_can_manage(t.id)from public.department_teams t where(t.is_active or public.is_super_admin())and(public.department_can_manage(t.id)or public.department_can_access(t.id,auth.uid()))order by t.name,t.id;$$;
create function public.department_context()returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.department_actor_enabled()or not(public.is_super_admin()or public.has_admin_permission('teams.manage'))then raise exception 'Responsable requis' using errcode='42501';end if;
 return jsonb_build_object('is_super',public.is_super_admin(),
 'teams',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('manager_email',u.email,'manager_name',p.display_name)order by t.name),'[]')from public.department_teams t join auth.users u on u.id=t.manager_id join public.profiles p on p.id=t.manager_id where public.department_can_manage(t.id)),
 'members',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('email',u.email,'display_name',p.display_name)),'[]')from public.department_team_members m join auth.users u on u.id=m.user_id join public.profiles p on p.id=m.user_id where public.department_can_manage(m.team_id)),
 'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'team_id',i.department_team_id,'email',i.email,'status',i.status,'expires_at',i.expires_at,'sent_at',i.sent_at)),'[]')from public.internal_invitations i where i.department_team_id is not null and public.department_can_manage(i.department_team_id)and i.status='pending'));
end;$$;
create function public.department_intake(target_team uuid,search_term text default '')returns jsonb language plpgsql stable security definer set search_path='' as $$
declare dept text;
begin
 if not public.department_can_manage(target_team)then raise exception 'Responsable requis' using errcode='42501';end if;
 select department into dept from public.department_teams where id=target_team;
 if dept='commercial'then return(select coalesce(jsonb_agg(x),'[]')from(select p.profile_id id,p.business_name label,p.city detail from public.provider_profiles p join public.professional_onboarding o on o.provider_id=p.profile_id where o.status in('submitted','under_review','additional_information_required')and strpos(lower(p.business_name||' '||p.city),lower(trim(search_term)))>0 and not exists(select 1 from public.department_cases c where c.provider_id=p.profile_id)and not exists(select 1 from public.crm_leads l where l.linked_provider_id=p.profile_id and l.team_id is distinct from target_team)order by p.business_name limit 30)x);
 elsif dept='support'then return(select coalesce(jsonb_agg(x),'[]')from(select t.id,t.subject label,t.priority detail from public.support_tickets t where t.assigned_to is null and t.status in('open','pending')and strpos(lower(t.subject),lower(trim(search_term)))>0 and not exists(select 1 from public.department_cases c where c.ticket_id=t.id)order by t.created_at desc limit 30)x);
 elsif dept='finance'then return(select coalesce(jsonb_agg(x),'[]')from(select p.id,p.id::text label,coalesce(p.gross_amount,p.amount)::text||' '||trim(p.currency)||' · '||p.payment_status::text detail from public.payments p where strpos(p.id::text,trim(search_term))>0 order by p.created_at desc limit 30)x);end if;return '[]'::jsonb;
end;$$;
create function public.department_crm_access(target_team uuid,assignee uuid)returns boolean language sql stable security definer set search_path='' as $$
 select public.crm_actor_enabled()and(public.is_super_admin()or(target_team is not null and exists(select 1 from public.department_teams where id=target_team and department='commercial')and public.department_can_access(target_team,assignee))or(target_team is null and assignee=auth.uid()and not exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=auth.uid()and m.is_active and m.revoked_at is null and r.key in('commercial_agent','commercial_manager'))));$$;
drop policy "CRM assigned read" on public.crm_leads;
drop policy "CRM own creation" on public.crm_leads;
drop policy "CRM assigned update" on public.crm_leads;
create policy "CRM assigned read" on public.crm_leads for select to authenticated using(public.department_crm_access(team_id,assigned_to));
create policy "CRM own creation" on public.crm_leads for insert to authenticated with check(created_by=auth.uid()and public.department_crm_access(team_id,assigned_to));
create policy "CRM assigned update" on public.crm_leads for update to authenticated using(public.department_crm_access(team_id,assigned_to))with check(public.department_crm_access(team_id,assigned_to));
drop policy "CRM assigned activity read" on public.crm_activities;
drop policy "CRM manual activity creation" on public.crm_activities;
create policy "CRM assigned activity read" on public.crm_activities for select to authenticated using(exists(select 1 from public.crm_leads l where l.id=lead_id and public.department_crm_access(l.team_id,l.assigned_to)));
create policy "CRM manual activity creation" on public.crm_activities for insert to authenticated with check(actor_id=auth.uid()and kind in('note','call','visit','meeting','email','whatsapp')and exists(select 1 from public.crm_leads l where l.id=lead_id and l.archived_at is null and public.department_crm_access(l.team_id,l.assigned_to)));
alter table public.crm_activities drop constraint crm_activities_kind_check;
alter table public.crm_activities add constraint crm_activities_kind_check check(kind in('note','call','visit','meeting','email','whatsapp','created','updated','assigned','archived','restored'));
create function public.department_move_prospect(target_lead uuid,target_version integer,target_assignee uuid,target_team uuid)returns void language plpgsql security definer set search_path='' as $$
declare item public.crm_leads;
begin
 perform 1 from public.department_teams where id=target_team for update;
 select * into item from public.crm_leads where id=target_lead for update;
 if not found or not public.department_crm_access(item.team_id,item.assigned_to)or not(public.is_super_admin()or public.department_can_manage(item.team_id))then raise exception 'Responsable du prospect requis' using errcode='42501';end if;
 if target_team is distinct from item.team_id and not public.is_super_admin()then raise exception 'Transfert entre branches réservé au Super Admin' using errcode='42501';end if;
 if target_team is not null and(not exists(select 1 from public.department_teams where id=target_team and department='commercial')or not public.department_is_assignee(target_team,target_assignee))then raise exception 'Commercial actif de cette équipe requis';end if;
 if target_team is null and(not public.is_super_admin()or not exists(select 1 from public.profiles p join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id where p.id=target_assignee and p.account_status='active'and not p.is_suspended and m.is_active and m.revoked_at is null and r.is_active and r.key='commercial'))then raise exception 'Commercial actif requis' using errcode='22023';end if;
 update public.crm_leads set assigned_to=target_assignee,team_id=target_team where id=target_lead and version=target_version;if not found then raise exception 'Prospect modifié' using errcode='40001';end if;
end;$$;

create or replace function public.crm_guard_lead() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Permit only FK-driven unlinking when a professional account is deleted.
  if tg_op='UPDATE' and pg_trigger_depth()>1 and old.linked_provider_id is not null and new.linked_provider_id is null
    and (to_jsonb(new)-'linked_provider_id'-'search_text')=(to_jsonb(old)-'linked_provider_id'-'search_text')
    and not exists(select 1 from public.provider_profiles p where p.profile_id=old.linked_provider_id) then
    new.version:=old.version+1; new.updated_at:=now(); return new;
  end if;
  if not public.crm_actor_enabled() then raise exception 'Accès CRM refusé' using errcode='42501'; end if;
  if tg_op='INSERT' then
    new.created_by:=auth.uid(); new.assigned_to:=auth.uid(); new.version:=1; new.created_at:=now(); new.updated_at:=now(); new.archived_at:=null;
  else
    if not public.department_crm_access(old.team_id,old.assigned_to) then raise exception 'Prospect inaccessible' using errcode='42501'; end if;
    if (new.assigned_to is distinct from old.assigned_to or new.team_id is distinct from old.team_id)and not(public.is_super_admin()or(new.team_id=old.team_id and public.department_can_manage(old.team_id)and public.department_is_assignee(old.team_id,new.assigned_to))) then raise exception 'Réaffectation réservée au Super Admin' using errcode='42501'; end if;
    new.id:=old.id; new.created_by:=old.created_by; new.created_at:=old.created_at; new.version:=old.version+1; new.updated_at:=now();
  end if;
  if not public.department_crm_access(new.team_id,new.assigned_to)then raise exception 'Équipe inaccessible' using errcode='42501';end if;
  if new.linked_provider_id is not null and(tg_op='INSERT'or new.linked_provider_id is distinct from old.linked_provider_id)and not(public.has_admin_permission('documents.review')or public.department_provider_access(new.linked_provider_id))then raise exception 'Affectez le dossier professionnel avant de le lier' using errcode='42501';end if;
  return new;
end; $$;
create or replace function public.crm_stamp_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Serialize with reassignment and recheck access: a former assignee cannot
  -- append a note after another transaction has transferred the lead.
  perform 1 from public.crm_leads l where l.id=new.lead_id and public.department_crm_access(l.team_id,l.assigned_to) for update;
  if not found then raise exception 'Prospect inaccessible' using errcode='42501'; end if;
  new.actor_id:=auth.uid(); new.created_at:=now();
  select coalesce(nullif(trim(p.display_name),''),'Équipe commerciale') into new.actor_name from public.profiles p where p.id=auth.uid();
  return new;
end; $$;
create or replace function public.crm_find_professionals(search_term text) returns table(profile_id uuid,business_name text,city text,status text)
language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.crm_actor_enabled() or not(public.has_admin_permission('providers.read')or public.has_admin_permission('commercial.cases')) then raise exception 'Accès aux dossiers refusé' using errcode='42501'; end if;
  if length(trim(search_term))<2 or length(search_term)>160 then return; end if;
  return query select p.profile_id,p.business_name,p.city,p.status::text from public.provider_profiles p
    where(public.has_admin_permission('providers.read')or public.department_provider_access(p.profile_id))and strpos(lower(p.business_name||' '||p.city),lower(trim(search_term)))>0 order by p.business_name,p.profile_id limit 20;
end; $$;
create or replace function public.crm_list_assignees()returns table(id uuid,label text)language plpgsql stable security definer set search_path='' as $$
begin
 if not public.crm_actor_enabled()then raise exception 'Accès CRM refusé' using errcode='42501';end if;
 return query select distinct p.id,coalesce(nullif(trim(p.display_name),''),'Commercial')from public.profiles p where p.account_status='active'and not p.is_suspended and(p.id=auth.uid()or exists(select 1 from public.department_teams t where t.department='commercial'and public.department_can_manage(t.id)and public.department_is_assignee(t.id,p.id))or(public.is_super_admin()and exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=p.id and m.is_active and m.revoked_at is null and r.key in('commercial','commercial_agent','commercial_manager'))))order by 2,1;
end;$$;
create or replace function public.crm_assign_lead(target_lead uuid,target_version integer,target_assignee uuid)returns void language plpgsql security definer set search_path='' as $$
declare current_team uuid;
begin select team_id into current_team from public.crm_leads where id=target_lead;perform public.department_move_prospect(target_lead,target_version,target_assignee,current_team);end;$$;
create function public.department_crm_assignees(target_team uuid)returns table(id uuid,label text)language plpgsql stable security definer set search_path='' as $$
begin
 if not public.crm_actor_enabled()or not public.department_can_manage(target_team)then raise exception 'Responsable requis' using errcode='42501';end if;
 return query select p.id,coalesce(nullif(trim(p.display_name),''),'Commercial')from public.profiles p where public.department_is_assignee(target_team,p.id)and exists(select 1 from public.department_teams t where t.id=target_team and t.department='commercial')order by 2,1;
end;$$;
alter function public.activate_internal_invitation(uuid)rename to department_legacy_activate_internal_invitation;
revoke all on function public.department_legacy_activate_internal_invitation(uuid)from public,anon,authenticated,service_role;
create function public.activate_internal_invitation(target_user_id uuid)returns boolean language plpgsql security definer set search_path='' as $$
declare invitation public.internal_invitations;team public.department_teams;activated boolean;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'or target_user_id is null then raise exception 'Service requis' using errcode='42501';end if;
 select * into invitation from public.internal_invitations where user_id=target_user_id;
 if invitation.id is null then return false;end if;
 if invitation.department_team_id is null then return public.department_legacy_activate_internal_invitation(target_user_id);end if;
 select * into team from public.department_teams where id=invitation.department_team_id for update;
 select * into invitation from public.internal_invitations where id=invitation.id for update;
 if not public.department_manager_enabled(team.id)or not exists(select 1 from public.profiles where id=target_user_id and account_status='active'and not is_suspended)then raise exception 'Délégation inactive' using errcode='42501';end if;
 if invitation.status='active'then return exists(select 1 from public.department_team_members where team_id=team.id and user_id=target_user_id and status='active');end if;
 if invitation.role_key<>team.department||'_agent'or not(invitation.invited_by=team.manager_id or exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id where m.user_id=invitation.invited_by and m.is_active and m.revoked_at is null and r.key='super_admin'and r.is_active and p.account_status='active'and not p.is_suspended))then raise exception 'Invitation à faire réapprouver par le responsable actuel' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_user_id::text,7421));
 if exists(select 1 from public.admin_user_roles where user_id=target_user_id and is_active and revoked_at is null)or exists(select 1 from public.department_team_members where user_id=target_user_id and status in('active','suspended'))then raise exception 'Un autre accès existe déjà' using errcode='42501';end if;
 activated:=public.department_legacy_activate_internal_invitation(target_user_id);
 if activated then insert into public.department_team_members(team_id,user_id,added_by)values(team.id,target_user_id,invitation.invited_by)on conflict(team_id,user_id)do update set status='active',added_by=excluded.added_by;
 insert into public.department_team_events(team_id,actor_id,target_id,action,reason)values(team.id,invitation.invited_by,target_user_id,'member.activated','Invitation acceptée par son destinataire confirmé');end if;return activated;
end;$$;
revoke all on function public.activate_internal_invitation(uuid)from public,anon,authenticated;
grant execute on function public.activate_internal_invitation(uuid)to service_role;
create policy "Assigned professional profile" on public.provider_profiles for select to authenticated using(public.department_provider_access(profile_id));
create policy "Assigned professional onboarding" on public.professional_onboarding for select to authenticated using(public.department_provider_access(provider_id));
create policy "Assigned professional documents" on public.provider_documents for select to authenticated using(public.department_provider_access(provider_id));
create policy "Assigned professional business" on public.businesses for select to authenticated using(public.department_provider_access(owner_id));
create policy "Assigned document preview" on storage.objects for select to authenticated using(bucket_id='provider-documents'and case when(storage.foldername(name))[1]~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'then public.department_provider_access(((storage.foldername(name))[1])::uuid)else false end);
-- Extend permission gates while preserving completeness, self-decision and audit.
do $$declare signature text;source text;provider_expression text;patched text;begin
 foreach signature in array array['public.professional_application_detail(uuid)','public.professional_application_history(uuid)','public.professional_application_readiness(uuid)','public.review_professional_application(uuid,text,text)','public.request_professional_document_update(uuid,text)']loop
 source:=pg_get_functiondef(signature::regprocedure);
 if position('public.has_admin_permission(''documents.review'')'in source)=0 then raise exception 'Définition inattendue : %',signature;end if;
 provider_expression:=case when signature like '%request_professional_document_update%'then '(select d.provider_id from public.provider_documents d where d.id=target_document_id)'else 'target_provider_id'end;
 patched:=replace(source,'public.has_admin_permission(''documents.review'')','(public.has_admin_permission(''documents.review'')or public.department_provider_access('||provider_expression||'))');
 patched:=replace(patched,'public.has_admin_permission(''providers.read'')','(public.has_admin_permission(''providers.read'')or public.department_provider_access('||provider_expression||'))');
 patched:=replace(patched,'public.has_admin_permission(''providers.verify'')','(public.has_admin_permission(''providers.verify'')or public.department_provider_access('||provider_expression||'))');execute patched;end loop;
end $$;
create function public.department_profile_grant_allowed(target_user uuid)returns boolean language sql stable security definer set search_path='' as $$
 select target_user<>auth.uid()and public.department_actor_enabled()and exists(select 1 from public.department_team_members m join public.department_teams t on t.id=m.team_id join public.admin_user_roles ar on ar.user_id=m.user_id join public.admin_roles r on r.id=ar.role_id where m.user_id=target_user and m.added_by=auth.uid()and m.status='active'and public.department_can_manage(t.id)and public.department_manager_enabled(t.id)and ar.assigned_by=auth.uid()and ar.is_active and ar.revoked_at is null and ar.requires_mfa and r.is_active and r.key=t.department||'_agent');$$;
-- Existing privilege triggers keep their other checks, including immutable consents.
do $$declare sig text;source text;atom text;begin
 foreach sig in array array['public.protect_profile_privileges()','public.protect_profile_security_fields()']loop
 source:=pg_get_functiondef(sig::regprocedure);atom:=case when sig like '%protect_profile_privileges%'then 'new.role is distinct from old.role and not public.is_super_admin()'else 'old.role is distinct from new.role and not public.is_super_admin()'end;
 if position(atom in source)=0 then raise exception 'Protection de profil inattendue : %',sig;end if;
 execute replace(source,atom,atom||' and not(old.role<>''admin''and new.role=''admin''and public.department_profile_grant_allowed(old.id))');end loop;
 source:=pg_get_functiondef('public.protect_provider_review_fields()'::regprocedure);atom:='or public.has_admin_permission(''providers.verify'') or public.has_admin_permission(''providers.suspend'') then return new; end if;';
 if position(atom in source)=0 then raise exception 'Protection des décisions professionnelles inattendue';end if;
 execute replace(source,atom,'or public.has_admin_permission(''providers.verify'') or public.has_admin_permission(''providers.suspend'') or(tg_op=''UPDATE''and current_user=''postgres''and public.department_provider_access(new.profile_id)and(to_jsonb(new)-''status''-''verified_at''-''updated_at'')=(to_jsonb(old)-''status''-''verified_at''-''updated_at''))then return new;end if;');
 source:=pg_get_functiondef('public.protect_document_review_fields()'::regprocedure);atom:='or public.has_admin_permission(''documents.review'') then return new; end if;';
 if position(atom in source)=0 then raise exception 'Protection des documents inattendue';end if;
 execute replace(source,atom,'or public.has_admin_permission(''documents.review'')or(tg_op=''UPDATE''and current_user=''postgres''and public.department_provider_access(new.provider_id)and(to_jsonb(new)-''status''-''rejection_reason''-''reviewed_by''-''reviewed_at'')=(to_jsonb(old)-''status''-''rejection_reason''-''reviewed_by''-''reviewed_at''))then return new;end if;');
end $$;
create function public.department_team_report(target_team uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.department_can_manage(target_team)then raise exception 'Responsable requis' using errcode='42501';end if;
 return jsonb_build_object('agents',(select coalesce(jsonb_agg(x),'[]')from(select m.user_id,p.display_name,m.status,
 (select count(*)from public.crm_leads l where l.team_id=target_team and l.assigned_to=m.user_id and l.archived_at is null)prospects,
 (select count(*)from public.crm_activities a join public.crm_leads l on l.id=a.lead_id where l.team_id=target_team and a.actor_id=m.user_id and a.kind='visit'and a.created_at>=now()-interval '30 days')visits,
 (select count(*)from public.crm_activities a join public.crm_leads l on l.id=a.lead_id where l.team_id=target_team and a.actor_id=m.user_id and a.kind='call'and a.created_at>=now()-interval '30 days')calls,
 (select count(*)from public.crm_leads l where l.team_id=target_team and l.assigned_to=m.user_id and l.archived_at is null and l.stage not in('won','lost')and l.next_follow_up_at<=now())due,
 (select count(*)from public.department_cases c where c.team_id=target_team and c.assigned_to=m.user_id and c.status<>'completed')cases_open
 from public.department_team_members m join public.profiles p on p.id=m.user_id where m.team_id=target_team order by p.display_name)x),
 'crm_activity',(select coalesce(jsonb_agg(x),'[]')from(select a.id,a.kind,a.body,a.actor_name,a.created_at,l.name prospect from public.crm_activities a join public.crm_leads l on l.id=a.lead_id where l.team_id=target_team order by a.created_at desc limit 100)x),
 'team_events',(select coalesce(jsonb_agg(x),'[]')from(select e.action,e.reason,e.created_at,p.display_name actor_name from public.department_team_events e join public.profiles p on p.id=e.actor_id where e.team_id=target_team order by e.created_at desc limit 100)x));
end;$$;
-- Internal membership must not inherit historical is_admin() access to drafts.
create function public.department_is_scoped_actor()returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=auth.uid()and m.is_active and m.revoked_at is null and r.is_active and r.key in('commercial_manager','commercial_agent','finance_manager','finance_agent','support_manager','support_agent'));$$;
create policy "Delegated private media boundary" on storage.objects as restrictive for select to authenticated using(
 not public.department_is_scoped_actor()or bucket_id<>'provider-social-media'or(storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.social_post_media media where media.bucket_id='provider-social-media'and(media.storage_path=objects.name or media.thumbnail_path=objects.name)and public.is_public_social_post(media.post_id)));
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like 'department_%'and p.proname<>'department_legacy_activate_internal_invitation'loop
 execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated,service_role',f.signature);end loop;
end $$;
commit;
