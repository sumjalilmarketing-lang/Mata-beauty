-- Narrow API privileges on public collaborator records without changing RLS,
-- rows, booking relations, or the private access model.
-- Apply only after reviewing the exact QA schema and dependencies.
begin;

revoke all privileges on table public.collaborators from public, anon, authenticated;

-- Column grants survive table-level REVOKE, so clear them explicitly first.
do $migration$
declare
  column_record record;
begin
  for column_record in
    select attname
    from pg_attribute
    where attrelid = 'public.collaborators'::regclass
      and attnum > 0
      and not attisdropped
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table public.collaborators from public, anon, authenticated',
      column_record.attname
    );
  end loop;
end
$migration$;

-- Public presentation fields consumed by profiles, team cards and booking UI.
grant select (
  id, business_id, display_name, title, avatar_url, is_bookable, is_active,
  created_at, updated_at, archived_at, first_name, public_last_name,
  specialties, buffer_minutes
) on table public.collaborators to anon, authenticated;

-- Authenticated owner flows may edit presentation/availability fields. Existing
-- RLS policies continue to decide which rows a caller may change.
grant update (
  display_name, title, avatar_url, is_bookable, is_active, archived_at,
  first_name, public_last_name, specialties, buffer_minutes
) on table public.collaborators to authenticated;

commit;
