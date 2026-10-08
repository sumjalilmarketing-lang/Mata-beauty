create or replace function public.finish_admin_account_deletion(operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare operation public.admin_account_operations; gone boolean;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service serveur requis' using errcode='42501'; end if;
  select * into operation from public.admin_account_operations where id=operation_id for update;
  if not found or operation.action<>'delete' then raise exception 'Opération introuvable'; end if;
  if operation.status='completed' then
    return jsonb_build_object('operationId',operation_id,'status','completed');
  end if;
  gone:=not exists(select 1 from auth.users where id=operation.target_user_id)
    and not exists(select 1 from public.profiles where id=operation.target_user_id);
  update public.admin_account_operations set status=case when gone then 'completed' else 'failed' end,completed_at=now() where id=operation_id;
  if not gone then update public.admin_account_state set deletion_pending=false where user_id=operation.target_user_id; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(operation.actor_id,case when gone then 'account.deleted' else 'account.deletion_failed' end,'profiles',operation.target_user_id,
    '{}',jsonb_build_object('operation_id',operation_id,'auth_and_profile_removed',gone,'reason',operation.reason));
  return jsonb_build_object('operationId',operation_id,'status',case when gone then 'completed' else 'failed' end);
end; $$;
