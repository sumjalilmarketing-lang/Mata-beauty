-- Deployment order: ship all normalized image endpoints and migrated callers
-- before applying this policy. Existing public reads and old URLs stay intact.
begin;
create policy "validated public image inserts only"
on storage.objects as restrictive for insert to anon, authenticated
with check (bucket_id not in ('avatars','business-media'));
create policy "validated public image updates only"
on storage.objects as restrictive for update to anon, authenticated
using (bucket_id not in ('avatars','business-media'))
with check (bucket_id not in ('avatars','business-media'));
-- service_role bypasses RLS; only the bounded, authenticated server pipeline
-- receives that credential. No files, rows, pointers or read policies are changed.
commit;
