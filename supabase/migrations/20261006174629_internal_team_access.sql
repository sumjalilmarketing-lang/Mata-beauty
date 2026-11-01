-- Invitation lifecycle only. Permissions continue to come exclusively from
-- admin_roles/admin_user_roles/admin_role_permissions and their MFA gate.
create table public.internal_invitations (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(trim(email))),
 first_name text not null check(length(trim(first_name)) between 1 and 100),
 last_name text not null check(length(trim(last_name)) between 1 and 100),
 role_key text not null references public.admin_roles(key),
 user_id uuid unique references public.profiles(id) on delete cascade,
 invited_by uuid not null references public.profiles(id),
 status text not null default 'pending' check(status in ('pending','active','suspended','revoked')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 expires_at timestamptz not null default now()+interval '24 hours',
 activated_at timestamptz,
 delivery_version integer not null default 1,
 provider_message_id text
);
alter table public.internal_invitations enable row level security;
revoke all on public.internal_invitations from anon,authenticated;
grant select on public.internal_invitations to authenticated;
grant all on public.internal_invitations to service_role;
create policy "team managers read invitations" on public.internal_invitations for select to authenticated
 using(public.is_super_admin() and public.has_admin_permission('roles.manage'));

-- Do not permit AAL1 managers, self changes, NULL actions or silent role merging.
create function public.require_team_manager() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2'
 or not public.is_super_admin() or not public.has_admin_permission('roles.manage') then
 raise exception 'Super Admin avec MFA requis' using errcode='42501'; end if;
end; $$;
revoke all on function public.require_team_manager() from public,anon,authenticated;

create or replace function public.admin_assign_role(target_user_id uuid,target_role_key text,reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare target_role_id uuid; previous_roles jsonb;
begin
 perform public.require_team_manager();
 if target_user_id is null or target_user_id=auth.uid() then raise exception 'Modification de son propre accès interdite' using errcode='42501'; end if;
 if length(trim(coalesce(reason,'')))<2 then raise exception 'Justification requise'; end if;
 perform 1 from public.profiles where id=target_user_id for update;
 if not found then raise exception 'Compte introuvable'; end if;
 select id into target_role_id from public.admin_roles where key=target_role_key and is_active;
 if target_role_id is null then raise exception 'Rôle invalide'; end if;
 perform pg_advisory_xact_lock(72819001);
 if target_role_key<>'super_admin' and exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=target_user_id and m.is_active and r.key='super_admin')
 and not exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id where m.user_id<>target_user_id and m.is_active and m.revoked_at is null and r.key='super_admin' and not p.is_suspended) then raise exception 'Dernier Super Admin protégé'; end if;
 select coalesce(jsonb_agg(r.key),'[]'::jsonb) into previous_roles from public.admin_user_roles m
 join public.admin_roles r on r.id=m.role_id where m.user_id=target_user_id and m.is_active and m.revoked_at is null;
 update public.admin_user_roles set is_active=false,revoked_at=now() where user_id=target_user_id and is_active;
 update public.profiles set role='admin',updated_at=now() where id=target_user_id;
 insert into public.admin_user_roles(user_id,role_id,assigned_by,requires_mfa,is_active,revoked_at)
 values(target_user_id,target_role_id,auth.uid(),true,true,null)
 on conflict(user_id,role_id) do update set assigned_by=auth.uid(),requires_mfa=true,is_active=true,revoked_at=null,assigned_at=now();
 update public.internal_invitations set role_key=target_role_key where user_id=target_user_id;
 perform public.write_admin_audit('admin.role_assigned','profiles',target_user_id,jsonb_build_object('roles',previous_roles),jsonb_build_object('role',target_role_key),reason);
 insert into public.notifications(profile_id,kind,title,body,data) values(target_user_id,'internal_access','Votre rôle a été modifié','Votre accès est soumis aux permissions de votre nouveau rôle.',jsonb_build_object('href','/admin'));
 return true;
end; $$;
revoke all on function public.admin_assign_role(uuid,text,text) from public,anon;
grant execute on function public.admin_assign_role(uuid,text,text) to authenticated;

create function public.admin_prepare_invitation(target_email text,given_name text,family_name text,target_role_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation_id uuid;
begin
 perform public.require_team_manager();
 if target_email is null or length(target_email)>254 or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'E-mail invalide'; end if;
 if target_role_key is null or target_role_key='super_admin' or not exists(select 1 from public.admin_roles where key=target_role_key and is_active) then raise exception 'Rôle non autorisé pour invitation'; end if;
 if exists(select 1 from auth.users where lower(email)=lower(trim(target_email))) then raise exception 'Ce compte existe déjà : utilisez la gestion du membre, sans réinitialiser son accès'; end if;
 insert into public.internal_invitations(email,first_name,last_name,role_key,invited_by)
 values(lower(trim(target_email)),trim(given_name),trim(family_name),target_role_key,auth.uid()) returning id into invitation_id;
 perform public.write_admin_audit('team.invitation_created','internal_invitations',invitation_id,null,jsonb_build_object('role',target_role_key),'Invitation interne');
 return invitation_id;
end; $$;
revoke all on function public.admin_prepare_invitation(text,text,text,text) from public,anon;
grant execute on function public.admin_prepare_invitation(text,text,text,text) to authenticated;

-- Binding validates the server-created Auth identity, never trusts metadata roles.
create function public.admin_bind_invitation(target_invitation_id uuid,target_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare invitation public.internal_invitations;
begin
 perform public.require_team_manager();
 select * into invitation from public.internal_invitations where id=target_invitation_id for update;
 if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now()
 or (invitation.user_id is not null and invitation.user_id<>target_user_id)
 or not exists(select 1 from auth.users where id=target_user_id and lower(email)=invitation.email and invited_at is not null) then raise exception 'Invitation invalide' using errcode='42501'; end if;
 update public.internal_invitations set user_id=target_user_id where id=invitation.id;
 update public.profiles set first_name=invitation.first_name,last_name=invitation.last_name,display_name=invitation.first_name||' '||invitation.last_name where id=target_user_id;
 -- No role is granted until the recipient confirms and activates the invitation.
 return true;
end; $$;
revoke all on function public.admin_bind_invitation(uuid,uuid) from public,anon;
grant execute on function public.admin_bind_invitation(uuid,uuid) to authenticated;

create function public.activate_internal_invitation() returns boolean
language plpgsql security definer set search_path='' as $$
declare invitation public.internal_invitations; role_id_value uuid;
begin
 if auth.uid() is null then raise exception 'Authentification requise' using errcode='42501'; end if;
 select * into invitation from public.internal_invitations where user_id=auth.uid() for update;
 if invitation.id is null then return false; end if;
 if invitation.status='active' then return true; end if;
 if invitation.status<>'pending' or invitation.expires_at<=now() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and encrypted_password<>'') then raise exception 'Invitation expirée ou compte non activé' using errcode='42501'; end if;
 select id into role_id_value from public.admin_roles where key=invitation.role_key and is_active and key<>'super_admin';
 if role_id_value is null then raise exception 'Rôle indisponible'; end if;
 update public.profiles set role='admin',updated_at=now() where id=auth.uid() and not is_suspended;
 if not found then raise exception 'Compte suspendu' using errcode='42501'; end if;
 insert into public.admin_user_roles(user_id,role_id,assigned_by,requires_mfa) values(auth.uid(),role_id_value,invitation.invited_by,true);
 update public.internal_invitations set status='active',activated_at=now() where id=invitation.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'team.account_activated','profiles',auth.uid(),jsonb_build_object('status','pending'),jsonb_build_object('status','active','role',invitation.role_key));
 insert into public.notifications(profile_id,kind,title,body,data) values(invitation.invited_by,'internal_access','Un membre a activé son compte',invitation.first_name||' '||invitation.last_name||' a activé son accès.',jsonb_build_object('href','/admin/administrators'));
 return true;
end; $$;
revoke all on function public.activate_internal_invitation() from public,anon;
grant execute on function public.activate_internal_invitation() to authenticated;

create function public.admin_change_internal_access(target_user_id uuid,target_action text,reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare old_suspended boolean;
begin
 perform public.require_team_manager();
 if target_user_id is null or target_user_id=auth.uid() or target_action is null or target_action not in ('suspend','reactivate','revoke') or length(trim(coalesce(reason,'')))<2 then raise exception 'Action invalide' using errcode='42501'; end if;
 select is_suspended into old_suspended from public.profiles where id=target_user_id for update;
 if not found or not exists(select 1 from public.admin_user_roles where user_id=target_user_id) then raise exception 'Membre interne introuvable'; end if;
 -- Prevent disabling the last active super administrator, including concurrent requests.
 perform pg_advisory_xact_lock(72819001);
 if target_action<>'reactivate' and exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=target_user_id and m.is_active and r.key='super_admin')
 and not exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id where m.user_id<>target_user_id and m.is_active and m.revoked_at is null and r.key='super_admin' and not p.is_suspended) then raise exception 'Dernier Super Admin protégé'; end if;
 if target_action='reactivate' and not exists(select 1 from public.admin_user_roles where user_id=target_user_id and is_active and revoked_at is null) then raise exception 'Un accès révoqué exige une nouvelle attribution explicite'; end if;
 update public.profiles set is_suspended=(target_action<>'reactivate'),updated_at=now() where id=target_user_id;
 if target_action='revoke' then update public.admin_user_roles set is_active=false,revoked_at=now() where user_id=target_user_id; end if;
 update public.internal_invitations set status=case target_action when 'reactivate' then 'active' when 'revoke' then 'revoked' else 'suspended' end where user_id=target_user_id;
 if target_action<>'reactivate' then
  update auth.users set banned_until='infinity'::timestamptz where id=target_user_id;
  delete from auth.sessions where user_id=target_user_id;
  update public.admin_sessions set revoked_at=now() where user_id=target_user_id and revoked_at is null;
 else update auth.users set banned_until=null where id=target_user_id; end if;
 perform public.write_admin_audit('team.'||target_action,'profiles',target_user_id,jsonb_build_object('suspended',old_suspended),jsonb_build_object('action',target_action),reason);
 insert into public.notifications(profile_id,kind,title,body,data) values(target_user_id,'internal_access','Votre accès interne a été modifié',case target_action when 'suspend' then 'Votre accès a été suspendu.' when 'revoke' then 'Votre accès a été révoqué.' else 'Votre accès a été réactivé.' end,jsonb_build_object('href','/admin'));
 return true;
end; $$;
revoke all on function public.admin_change_internal_access(uuid,text,text) from public,anon;
grant execute on function public.admin_change_internal_access(uuid,text,text) to authenticated;

create function public.admin_resend_invitation(target_invitation_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare invitation public.internal_invitations;
begin
 perform public.require_team_manager();
 select * into invitation from public.internal_invitations where id=target_invitation_id for update;
 if invitation.id is null or invitation.status<>'pending' then raise exception 'Invitation non disponible'; end if;
 if coalesce(invitation.sent_at,invitation.created_at)>now()-interval '60 seconds' then raise exception 'Patientez une minute avant un nouvel envoi'; end if;
 update public.internal_invitations set expires_at=now()+interval '24 hours',delivery_version=delivery_version+1,sent_at=now(),provider_message_id=null where id=invitation.id;
 perform public.write_admin_audit('team.invitation_resent','internal_invitations',invitation.id,null,jsonb_build_object('version',invitation.delivery_version+1),'Renvoi demandé');
 return true;
end; $$;
revoke all on function public.admin_resend_invitation(uuid) from public,anon;
grant execute on function public.admin_resend_invitation(uuid) to authenticated;

create function public.admin_list_team() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_team_manager();
 select coalesce(jsonb_agg(row_data),'[]'::jsonb) into result from (
 select p.id user_id,p.first_name,p.last_name,p.display_name,p.avatar_url,u.email,u.created_at,u.last_sign_in_at,
 case when i.status='pending' then 'pending' when p.is_suspended then case when exists(select 1 from public.admin_user_roles m where m.user_id=p.id and m.is_active and m.revoked_at is null) then 'suspended' else 'revoked' end else 'active' end status,
 exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified') mfa_enabled,
 coalesce((select jsonb_agg(r.key) from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=p.id and m.is_active and m.revoked_at is null),'[]'::jsonb) roles
 from public.profiles p join auth.users u on u.id=p.id left join public.internal_invitations i on i.user_id=p.id
 where exists(select 1 from public.admin_user_roles m where m.user_id=p.id) or i.id is not null
 order by u.created_at desc
 ) row_data;
 return result;
end; $$;
revoke all on function public.admin_list_team() from public,anon;
grant execute on function public.admin_list_team() to authenticated;
