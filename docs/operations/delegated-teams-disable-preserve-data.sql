-- Emergency feature disable, ONLY after delegated_department_teams was applied.
-- Authorized operator runs in the intended environment. Preserves all records.
-- Restore the preceding application deployment as part of the same incident.
begin;
update public.department_teams set is_active=false,version=version+1 where is_active;
update public.department_team_members set status='suspended'where status='active';
update public.admin_user_roles m set is_active=false,revoked_at=now()
from public.admin_roles r where r.id=m.role_id and r.key in
('commercial_manager','commercial_agent','finance_manager','finance_agent','support_manager','support_agent')and m.is_active;
update public.internal_invitations set status='revoked'where department_team_id is not null and status='pending';
-- Do not drop tables, erase histories, or restore broad permissions to agents.
commit;
