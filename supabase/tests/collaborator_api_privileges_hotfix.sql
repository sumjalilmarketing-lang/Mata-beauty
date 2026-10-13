-- Run only against an isolated disposable database after the ACL hotfix.
-- This checks the narrow independent privilege migration, not migration history.
do $test$
declare
  expected_select_columns text[] := array[
    'id', 'business_id', 'display_name', 'title', 'avatar_url', 'is_bookable',
    'is_active', 'created_at', 'updated_at', 'archived_at', 'first_name',
    'public_last_name', 'specialties', 'buffer_minutes'
  ];
  public_column text;
begin
  if has_table_privilege('anon', 'public.collaborators', 'select')
    or has_table_privilege('authenticated', 'public.collaborators', 'select')
    or has_table_privilege('anon', 'public.collaborators', 'update')
    or has_table_privilege('authenticated', 'public.collaborators', 'update') then
    raise exception 'API role retains table-wide SELECT or UPDATE';
  end if;

  foreach public_column in array expected_select_columns loop
    if not has_column_privilege('anon', 'public.collaborators', public_column, 'select')
      or not has_column_privilege('authenticated', 'public.collaborators', public_column, 'select') then
      raise exception 'Public presentation column % is not readable', public_column;
    end if;
  end loop;

  foreach public_column in array array['profile_id', 'internal_role', 'staff_permissions'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'collaborators' and column_name = public_column
    ) and (
      has_column_privilege('anon', 'public.collaborators', public_column, 'select')
      or has_column_privilege('authenticated', 'public.collaborators', public_column, 'select')
      or has_column_privilege('anon', 'public.collaborators', public_column, 'update')
      or has_column_privilege('authenticated', 'public.collaborators', public_column, 'update')
      or has_column_privilege('anon', 'public.collaborators', public_column, 'insert')
      or has_column_privilege('authenticated', 'public.collaborators', public_column, 'insert')
    ) then
      raise exception 'Internal collaborator column % is exposed to API roles', public_column;
    end if;
  end loop;

  foreach public_column in array array[
    'display_name', 'title', 'avatar_url', 'is_bookable', 'is_active',
    'archived_at', 'first_name', 'public_last_name', 'specialties', 'buffer_minutes'
  ] loop
    if not has_column_privilege('authenticated', 'public.collaborators', public_column, 'update') then
      raise exception 'Authenticated owner workflows lost update on %', public_column;
    end if;
    if has_column_privilege('anon', 'public.collaborators', public_column, 'update') then
      raise exception 'anon can update public collaborator column %', public_column;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.collaborators', 'insert')
    or has_table_privilege('anon', 'public.collaborators', 'delete')
    or has_table_privilege('authenticated', 'public.collaborators', 'insert')
    or has_table_privilege('authenticated', 'public.collaborators', 'delete') then
    raise exception 'API role retains table-wide mutation privileges';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collaborators'
      and policyname = 'active collaborators public read' and cmd = 'SELECT'
  ) then
    raise exception 'Existing public row filter was removed';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collaborators'
      and policyname = 'business owners manage collaborators' and cmd = 'ALL'
  ) then
    raise exception 'Existing owner row policy was removed';
  end if;
end
$test$;
