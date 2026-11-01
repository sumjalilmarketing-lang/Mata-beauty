-- Reconcile legacy grants made before approval became mandatory.
-- Keep accounts, applications, documents and publications; only revoke the
-- premature professional role. Approval will grant it through the workflow.
with revoked as (
  delete from public.account_roles r
  where r.role = 'professional'
    and not exists (
      select 1 from public.provider_profiles p
      where p.profile_id = r.profile_id and p.status = 'approved'
    )
  returning r.profile_id
)
insert into public.audit_logs(action, entity_type, entity_id, before_data, after_data)
select 'professional.legacy_approval_reconciled', 'account_roles', profile_id,
  jsonb_build_object('role', 'professional'),
  jsonb_build_object('role_removed', 'professional', 'reason', 'Professional approval required')
from revoked;
