drop function public.activate_internal_invitation();
create function public.activate_internal_invitation(target_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare invitation public.internal_invitations; role_id_value uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or target_user_id is null then raise exception 'Authentification requise' using errcode='42501'; end if;
 select * into invitation from public.internal_invitations where user_id=target_user_id for update;
 if invitation.id is null then return false; end if;
 if invitation.status='active' then return true; end if;
 if invitation.status<>'pending' or invitation.expires_at<=now() or not exists(select 1 from auth.users where id=target_user_id and email_confirmed_at is not null and encrypted_password<>'') then raise exception 'Invitation expirée ou compte non activé' using errcode='42501'; end if;
 select id into role_id_value from public.admin_roles where key=invitation.role_key and is_active and key<>'super_admin';
 if role_id_value is null then raise exception 'Rôle indisponible'; end if;
 update public.profiles set role='admin',updated_at=now() where id=target_user_id and not is_suspended;
 if not found then raise exception 'Compte suspendu' using errcode='42501'; end if;
 insert into public.admin_user_roles(user_id,role_id,assigned_by,requires_mfa) values(target_user_id,role_id_value,invitation.invited_by,true);
 update public.internal_invitations set status='active',activated_at=now() where id=invitation.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(target_user_id,'team.account_activated','profiles',target_user_id,jsonb_build_object('status','pending'),jsonb_build_object('status','active','role',invitation.role_key));
 insert into public.notifications(profile_id,kind,title,body,data) values(invitation.invited_by,'internal_access','Un membre a activé son compte',invitation.first_name||' '||invitation.last_name||' a activé son accès.',jsonb_build_object('href','/admin/administrators'));
 return true;
end; $$;
revoke all on function public.activate_internal_invitation(uuid) from public,anon,authenticated;
grant execute on function public.activate_internal_invitation(uuid) to service_role;


