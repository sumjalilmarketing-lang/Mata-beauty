-- Internal privileges require an active account even for a still-valid AAL2 token.
-- A revoked membership must not retain legacy is_admin() RLS privileges.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not public.admin_mfa_required() and exists (
    select 1
    from public.profiles p
    join public.admin_user_roles membership on membership.user_id = p.id
    join public.admin_roles role on role.id = membership.role_id
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.account_status = 'active' and not p.is_suspended
      and membership.is_active
      and membership.revoked_at is null
      and role.is_active
  );
$$;
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select not public.admin_mfa_required() and exists(select 1 from public.profiles p
 join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id
 where p.id=auth.uid() and p.role='admin' and p.account_status = 'active' and not p.is_suspended and m.is_active
 and m.revoked_at is null and r.is_active and r.key='super_admin');
$$;
create or replace function public.has_admin_permission(required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
 select not public.admin_mfa_required() and exists(select 1 from public.profiles p
 join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id
 left join public.admin_role_permissions rp on rp.role_id=r.id
 where p.id=auth.uid() and p.role='admin' and p.account_status = 'active' and not p.is_suspended and m.is_active
 and m.revoked_at is null and r.is_active and (r.key='super_admin' or rp.permission_key=required_permission));
$$;
