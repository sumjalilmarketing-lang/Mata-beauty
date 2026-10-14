-- Public collaborator presentation must not depend on the caller being able to
-- read the underlying business row through businesses RLS. This helper returns
-- only the public publication state for one business id.
create or replace function public.is_public_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
      and b.status = 'approved'
      and b.is_active
      and b.archived_at is null
  );
$$;

revoke all on function public.is_public_business(uuid) from public, anon, authenticated;
grant execute on function public.is_public_business(uuid) to anon, authenticated;

drop policy if exists "active collaborators public read" on public.collaborators;
create policy "active collaborators public read"
on public.collaborators
for select
to public
using (
  (is_active and public.is_public_business(business_id))
  or exists (
    select 1
    from public.businesses b
    where b.id = collaborators.business_id
      and b.owner_id = auth.uid()
  )
  or public.has_admin_permission('providers.read')
);

comment on function public.is_public_business(uuid) is
  'Returns only whether a salon is publicly approved, active, and not archived; used by collaborator presentation RLS.';
