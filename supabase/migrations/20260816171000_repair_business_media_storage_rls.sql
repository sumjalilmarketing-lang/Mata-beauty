begin;

create or replace function public.owns_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists(
    select 1 from public.businesses business
    where business.id = target_business_id
      and business.owner_id = auth.uid()
      and business.archived_at is null
  );
$$;

revoke all on function public.owns_business(uuid) from public, anon;
grant execute on function public.owns_business(uuid) to authenticated, service_role;

drop policy if exists "owners upload business media" on storage.objects;
drop policy if exists "owners update business media" on storage.objects;
drop policy if exists "owners delete business media" on storage.objects;

create policy "owners upload business media" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'business-media'
  and public.owns_business((storage.foldername(name))[1]::uuid)
);

create policy "owners update business media" on storage.objects
for update to authenticated
using (
  bucket_id = 'business-media'
  and public.owns_business((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'business-media'
  and public.owns_business((storage.foldername(name))[1]::uuid)
);

create policy "owners delete business media" on storage.objects
for delete to authenticated
using (
  bucket_id = 'business-media'
  and public.owns_business((storage.foldername(name))[1]::uuid)
);

commit;
