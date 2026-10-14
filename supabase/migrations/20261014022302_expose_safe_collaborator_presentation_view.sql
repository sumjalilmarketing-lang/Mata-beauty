-- PostgREST requires a relation-level grant to expose a resource. Keep the
-- base table column-scoped and expose only presentation fields through a
-- security-invoker view so base-table RLS and grants still apply.
create or replace view public.collaborators_public
with (security_invoker = true)
as
select
  id,
  business_id,
  display_name,
  title,
  avatar_url,
  is_bookable,
  is_active,
  created_at,
  updated_at,
  archived_at,
  first_name,
  public_last_name,
  specialties,
  buffer_minutes
from public.collaborators;

revoke all on public.collaborators_public from public, anon, authenticated;
grant select on public.collaborators_public to anon, authenticated;
grant update (
  display_name,
  title,
  avatar_url,
  is_bookable,
  is_active,
  archived_at,
  first_name,
  public_last_name,
  specialties,
  buffer_minutes
) on public.collaborators_public to authenticated;

comment on view public.collaborators_public is
  'Public collaborator presentation fields; internal account links and permissions remain private.';
