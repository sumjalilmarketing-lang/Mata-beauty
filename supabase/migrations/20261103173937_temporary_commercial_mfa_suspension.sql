-- Optional, expiring MFA suspension for an individually authorised commercial
-- manager. No account is exempted by this migration and legacy flags stay inert.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$
begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.admin_mfa_required()'::regprocedure) is distinct from 'f6b0aae9d2c656c929c357bac373aec6' then
  raise exception 'Unexpected admin_mfa_required definition; no changes applied';
 end if;
end;
$guard$;
alter table public.admin_user_roles
 add column mfa_suspended_until timestamptz,
 add column mfa_suspension_reason text;
comment on column public.admin_user_roles.mfa_suspended_until is 'Owner-authorised temporary commercial-manager MFA exception. Never set by a browser input. Expiry, verified factor or another active role restores MFA.';
create or replace function public.admin_mfa_required()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_user_roles m
 join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
 where m.user_id=auth.uid() and p.role='admin' and not p.is_suspended
 and m.is_active and m.revoked_at is null and r.is_active)
 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2'
 and not exists(
  select 1 from public.admin_user_roles m
  join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
  where m.user_id=auth.uid() and p.role='admin' and p.account_status='active' and not p.is_suspended
   and m.is_active and m.revoked_at is null and r.is_active and r.key='commercial_manager'
   and m.mfa_suspended_until>now() and isfinite(m.mfa_suspended_until)
   and length(trim(coalesce(m.mfa_suspension_reason,'')))>=3
   and exists(select 1 from public.department_teams t where t.manager_id=p.id and t.department='commercial' and t.is_active)
   and not exists(select 1 from public.admin_user_roles other_membership join public.admin_roles other_role on other_role.id=other_membership.role_id
    where other_membership.user_id=p.id and other_membership.is_active and other_membership.revoked_at is null and other_role.is_active and other_role.key<>'commercial_manager')
   and not exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified')
 );
$$;
commit;
