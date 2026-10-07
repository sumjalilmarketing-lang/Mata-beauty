create or replace function public.admin_change_internal_access(target_user_id uuid,target_action text,reason text)
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
  update auth.users set banned_until=now()+interval '100 years' where id=target_user_id;
  delete from auth.sessions where user_id=target_user_id;
  update public.admin_sessions set revoked_at=now() where user_id=target_user_id and revoked_at is null;
 else update auth.users set banned_until=null where id=target_user_id; end if;
 perform public.write_admin_audit('team.'||target_action,'profiles',target_user_id,jsonb_build_object('suspended',old_suspended),jsonb_build_object('action',target_action),reason);
 insert into public.notifications(profile_id,kind,title,body,data) values(target_user_id,'internal_access','Votre accès interne a été modifié',case target_action when 'suspend' then 'Votre accès a été suspendu.' when 'revoke' then 'Votre accès a été révoqué.' else 'Votre accès a été réactivé.' end,jsonb_build_object('href','/admin'));
 return true;
end; $$;
revoke all on function public.admin_change_internal_access(uuid,text,text) from public,anon;
grant execute on function public.admin_change_internal_access(uuid,text,text) to authenticated;


