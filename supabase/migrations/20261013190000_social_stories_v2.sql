begin;

-- Ephemeral professional stories reuse the existing conversation model for replies.
-- Media stays private; only signed, short-lived URLs are returned by the server API.
create table public.professional_stories (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  provider_service_id uuid references public.provider_services(id) on delete set null,
  caption text not null default '' check (char_length(caption) <= 280),
  storage_path text not null unique,
  upload_path text,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','video/mp4')),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  duration_seconds numeric,
  status text not null default 'pending' check (status in ('pending','published','removed')),
  published_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  constraint professional_stories_video_duration check (
    (content_type <> 'video/mp4' and duration_seconds is null)
    or (content_type = 'video/mp4' and duration_seconds > 0 and duration_seconds <= 15)
  ),
  constraint professional_stories_expiration check (status <> 'published' or expires_at = published_at + interval '24 hours')
);
create index professional_stories_feed_idx on public.professional_stories (published_at desc, id)
  where status = 'published';
create index professional_stories_provider_idx on public.professional_stories (provider_id, published_at desc);

alter table public.professional_stories enable row level security;
revoke all on public.professional_stories from public, anon, authenticated;
grant select (id, provider_id, provider_service_id, caption, content_type, size_bytes, duration_seconds, published_at, expires_at)
  on public.professional_stories to anon, authenticated;
grant all on public.professional_stories to service_role;
create policy "published stories from approved providers are public" on public.professional_stories
  for select to anon, authenticated using (
    status = 'published' and expires_at > now()
    and exists (select 1 from public.provider_profiles p where p.profile_id = provider_id and p.status = 'approved')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('professional-stories', 'professional-stories', false, 20971520,
        array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;
-- No anon/authenticated object policies are created. The server issues expiring signed URLs.

create or replace function public.list_active_professional_stories(target_limit integer default 30)
returns table (
  story_id uuid, provider_id uuid, provider_name text, avatar_url text,
  provider_service_id uuid, service_title text, caption text, storage_path text,
  content_type text, published_at timestamptz, expires_at timestamptz
) language sql stable security definer set search_path = '' as $function$
  select s.id, s.provider_id,
    coalesce(nullif(pp.business_name, ''), nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),''), 'Professionnel'),
    p.avatar_url, s.provider_service_id, ps.title, s.caption, s.storage_path, s.content_type, s.published_at, s.expires_at
  from public.professional_stories s
  join public.provider_profiles pp on pp.profile_id = s.provider_id and pp.status = 'approved'
  join public.profiles p on p.id = s.provider_id and p.account_status = 'active' and not p.is_suspended
  left join public.provider_services ps on ps.id = s.provider_service_id and ps.provider_id = s.provider_id and ps.is_active
  where s.status = 'published' and s.published_at <= now() and s.expires_at > now()
  order by s.published_at desc, s.id desc
  limit greatest(1, least(coalesce(target_limit,30),50));
$function$;
revoke all on function public.list_active_professional_stories(integer) from public, anon, authenticated;
grant execute on function public.list_active_professional_stories(integer) to service_role;

notify pgrst, 'reload schema';
commit;
