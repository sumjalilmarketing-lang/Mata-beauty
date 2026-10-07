-- Support escalation is a support ticket action, not publication moderation.
delete from public.admin_role_permissions permission
using public.admin_roles role
where permission.role_id=role.id and role.key='support' and permission.permission_key='reports.manage';
