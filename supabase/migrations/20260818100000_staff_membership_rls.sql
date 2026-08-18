begin;

-- An authenticated salon employee must be able to resolve their own active
-- membership before the server can authorize the /staff workspace. This
-- policy exposes only the row bound to the current profile; owners and public
-- approved-salon reads remain governed by the existing policies.
drop policy if exists "collaborators read own membership" on public.collaborators;
create policy "collaborators read own membership"
on public.collaborators
for select
to authenticated
using (profile_id = auth.uid());

commit;
