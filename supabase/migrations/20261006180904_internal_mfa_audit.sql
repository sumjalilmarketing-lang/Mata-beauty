create function public.audit_internal_mfa_activation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='verified' and old.status is distinct from new.status
 and exists(select 1 from public.admin_user_roles where user_id=new.user_id and is_active and revoked_at is null) then
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(new.user_id,'team.mfa_activated','profiles',new.user_id,jsonb_build_object('verified',false),jsonb_build_object('verified',true));
 end if;
 return new;
end; $$;
revoke all on function public.audit_internal_mfa_activation() from public,anon,authenticated;
create trigger internal_mfa_activated after update of status on auth.mfa_factors
for each row execute function public.audit_internal_mfa_activation();
