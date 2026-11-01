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
      and not p.is_suspended
      and membership.is_active
      and membership.revoked_at is null
      and role.is_active
  );
$$;
