-- Regression coverage for PostgREST-safe public collaborator presentation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(has_table_privilege('anon', 'public.collaborators_public', 'select'), 'anon can query the safe presentation view');
select ok(has_table_privilege('authenticated', 'public.collaborators_public', 'select'), 'authenticated can query the safe presentation view');
select ok(not has_table_privilege('anon', 'public.collaborators', 'select'), 'anon has no table-level access to collaborators');
select ok(not has_table_privilege('authenticated', 'public.collaborators', 'select'), 'authenticated has no table-level access to collaborators');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='collaborators_public' and column_name='profile_id'), 'profile_id is absent from the presentation view');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='collaborators_public' and column_name='internal_role'), 'internal_role is absent from the presentation view');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='collaborators_public' and column_name in ('staff_permissions','commercial_permissions')), 'permission fields are absent from the presentation view');
select ok(coalesce((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.collaborators_public'::regclass), false), 'view runs with invoker privileges and underlying RLS');

select * from finish();
rollback;
