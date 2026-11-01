-- product_events uses ON DELETE SET NULL: keep analytics records, remove identity linkage.
create or replace function public.account_retained_dependencies(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare dependency record; total bigint; result jsonb := '[]';
begin
  for dependency in
    select distinct n.nspname, t.relname, a.attname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and n.nspname='public'
      and c.confrelid in ('public.profiles'::regclass,'public.client_profiles'::regclass,'auth.users'::regclass)
      and t.relname not in ('profiles','client_profiles','account_roles','profile_preferences','profile_privacy_settings',
        'notification_preferences','notifications','welcome_email_deliveries','post_likes','post_saves','follows',
        'admin_account_state','product_events')
  loop
    execute format('select count(*) from %I.%I where %I=$1',dependency.nspname,dependency.relname,dependency.attname)
      into total using target_user_id;
    if total>0 then result:=result||jsonb_build_array(jsonb_build_object('table',dependency.relname,'column',dependency.attname,'count',total)); end if;
  end loop;
  select count(*) into total from storage.objects where owner_id=target_user_id::text
    or split_part(name,'/',1)=target_user_id::text;
  if total>0 then result:=result||jsonb_build_array(jsonb_build_object('table','documents_et_fichiers','count',total)); end if;
  return result;
end; $$;
revoke all on function public.account_retained_dependencies(uuid) from public,anon,authenticated;

