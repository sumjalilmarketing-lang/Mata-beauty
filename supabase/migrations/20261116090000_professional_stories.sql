begin;
set local lock_timeout = '5s';

-- Private assets: viewing them always requires a short-lived signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('professional-stories', 'professional-stories', false, 20971520,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

create table if not exists public.professional_stories (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  media_path text not null unique,
  media_type text not null check (media_type in ('photo','video')),
  caption text not null default '' check (char_length(caption) <= 160),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint professional_stories_lifetime check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  constraint professional_stories_path check (media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov)$')
);
create index if not exists professional_stories_expires_idx on public.professional_stories(expires_at);
create index if not exists professional_stories_provider_idx on public.professional_stories(provider_id,created_at desc);

alter table public.professional_stories enable row level security;
revoke all on public.professional_stories from public, anon, authenticated;
grant select on public.professional_stories to anon, authenticated;
grant insert, delete on public.professional_stories to authenticated;

create policy "Public can view active approved professional stories"
on public.professional_stories for select to anon, authenticated
using (expires_at > now() and exists (
  select 1 from public.provider_profiles p where p.profile_id = provider_id and p.status = 'approved'
));
create policy "Professionals create their own stories"
on public.professional_stories for insert to authenticated
with check (provider_id = auth.uid() and split_part(media_path,'/',1) = auth.uid()::text
  and created_at >= now() - interval '1 minute' and expires_at <= now() + interval '24 hours'
  and exists (select 1 from public.provider_profiles p where p.profile_id = auth.uid() and p.status = 'approved')
);
create policy "Professionals delete their own stories"
on public.professional_stories for delete to authenticated
using (provider_id = auth.uid());

create policy "Approved professionals upload their story media"
on storage.objects for insert to authenticated
with check (bucket_id = 'professional-stories'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.provider_profiles p where p.profile_id = auth.uid() and p.status = 'approved')
);
create policy "Professional story owners read their private media"
on storage.objects for select to authenticated
using (bucket_id = 'professional-stories' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Professional story owners remove their media"
on storage.objects for delete to authenticated
using (bucket_id = 'professional-stories' and (storage.foldername(name))[1] = auth.uid()::text);
commit;
