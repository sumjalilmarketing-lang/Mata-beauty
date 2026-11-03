CREATE OR REPLACE FUNCTION public.admin_mfa_required()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.admin_user_roles m
 join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
 where m.user_id=auth.uid() and p.role='admin' and not p.is_suspended
 and m.is_active and m.revoked_at is null and r.is_active)
 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2';
$function$
;
CREATE OR REPLACE FUNCTION public.has_admin_permission(required_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select not public.admin_mfa_required() and exists(select 1 from public.profiles p
 join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id
 left join public.admin_role_permissions rp on rp.role_id=r.id
 where p.id=auth.uid() and p.role='admin' and not p.is_suspended and m.is_active
 and m.revoked_at is null and r.is_active and (r.key='super_admin' or rp.permission_key=required_permission));
$function$
;
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select not public.admin_mfa_required() and exists(select 1 from public.profiles p
 join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id
 where p.id=auth.uid() and p.role='admin' and not p.is_suspended and m.is_active
 and m.revoked_at is null and r.is_active and r.key='super_admin');
$function$
;