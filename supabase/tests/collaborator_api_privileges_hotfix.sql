-- pgTAP regression test for the targeted collaborator ACL migration.
-- Run only against the disposable local Supabase database after migrations.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- API roles must not have table-wide privileges of any kind.
select ok(
  not has_table_privilege(role_name, 'public.collaborators', privilege_name),
  format('%s has no table-wide %s', role_name, privilege_name)
)
from unnest(array['anon', 'authenticated']) as roles(role_name)
cross join unnest(array[
  'select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'
]) as privileges(privilege_name);

-- Public profile, team cards, booking and availability reads still need these
-- presentation columns for both anonymous and authenticated clients.
select ok(
  not exists (
    select 1
    from unnest(array[
      'id', 'business_id', 'display_name', 'title', 'avatar_url', 'is_bookable',
      'is_active', 'created_at', 'updated_at', 'archived_at', 'first_name',
      'public_last_name', 'specialties', 'buffer_minutes'
    ]) as expected(column_name)
    where not has_column_privilege(role_name, 'public.collaborators', expected.column_name, 'select')
  ),
  format('%s can read public collaborator presentation fields', role_name)
)
from unnest(array['anon', 'authenticated']) as roles(role_name);

-- Internal identity and permission fields must stay private wherever they
-- exist in the target schema (the column set differs between QA and Production).
select ok(
  not exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.collaborators'::regclass
      and a.attnum > 0 and not a.attisdropped
      and a.attname = any(array[
        'profile_id', 'internal_role', 'staff_permissions', 'commercial_permissions'
      ])
      and (
        has_column_privilege(role_name, a.attrelid, a.attname, 'select')
        or has_column_privilege(role_name, a.attrelid, a.attname, 'update')
        or has_column_privilege(role_name, a.attrelid, a.attname, 'insert')
      )
  ),
  format('%s cannot read or alter internal collaborator fields', role_name)
)
from unnest(array['anon', 'authenticated']) as roles(role_name);

-- Owner UI's direct presentation edits remain possible for authenticated users;
-- RLS decides which rows they may edit. Anonymous updates remain impossible.
select ok(
  not exists (
    select 1
    from unnest(array[
      'display_name', 'title', 'avatar_url', 'is_bookable', 'is_active',
      'archived_at', 'first_name', 'public_last_name', 'specialties', 'buffer_minutes'
    ]) as editable(column_name)
    where not has_column_privilege('authenticated', 'public.collaborators', editable.column_name, 'update')
  ),
  'authenticated owner workflows retain presentation updates'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'display_name', 'title', 'avatar_url', 'is_bookable', 'is_active',
      'archived_at', 'first_name', 'public_last_name', 'specialties', 'buffer_minutes'
    ]) as editable(column_name)
    where has_column_privilege('anon', 'public.collaborators', editable.column_name, 'update')
  ),
  'anonymous users cannot update collaborator presentation'
);

-- Preserve the public and owner row filters, and ensure team creation remains
-- possible only through the existing owner-authorized SECURITY DEFINER RPC.
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'collaborators'
    and policyname = 'active collaborators public read' and cmd = 'SELECT'
), 'public collaborator row policy remains present');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'collaborators'
    and policyname = 'business owners manage collaborators' and cmd = 'ALL'
), 'business owner row policy remains present');
select ok(
  to_regprocedure('public.save_team_member(uuid,uuid,jsonb,uuid[])') is not null,
  'owner team-member RPC remains present'
);
select ok(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.save_team_member(uuid,uuid,jsonb,uuid[])'),
    'execute'
  ),
  'authenticated users can call the owner-checked team-member RPC'
);
select ok(
  (select p.prosecdef from pg_proc p
    where p.oid = to_regprocedure('public.save_team_member(uuid,uuid,jsonb,uuid[])')),
  'team-member RPC remains SECURITY DEFINER'
);

select * from finish();
rollback;
