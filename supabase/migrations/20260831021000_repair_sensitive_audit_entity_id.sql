begin;

create or replace function public.audit_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_entity_id uuid;
begin
  target_entity_id := case
    when tg_table_name = 'provider_profiles' then (to_jsonb(new)->>'profile_id')::uuid
    else (to_jsonb(new)->>'id')::uuid
  end;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values(auth.uid(), tg_op, tg_table_name, target_entity_id, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

commit;
