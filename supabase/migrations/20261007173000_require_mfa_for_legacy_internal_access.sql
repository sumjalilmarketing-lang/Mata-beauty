-- Legacy requires_mfa=false flags must never authorize an AAL1 internal session.
create or replace function public.admin_mfa_required()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_user_roles m
 join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
 where m.user_id=auth.uid() and p.role='admin' and not p.is_suspended
 and m.is_active and m.revoked_at is null and r.is_active)
 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2';
$$;
update public.admin_user_roles set requires_mfa=true where not requires_mfa;

