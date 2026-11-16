-- MATA Beauty: short-lived professional photo/video statuses.
-- Staged migration: do not apply to Production before the full feature is tested.
create table if not exists public.professional_statuses (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  media_kind text not null check (media_kind in ('image', 'video')),
  media_format text not null check (media_format in ('jpg','mp4','mov','webm')),
  media_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 180),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  hidden_at timestamptz,
  constraint professional_status_path_valid check (
    media_path = provider_id::text || '/' || id::text ||
    '.' || media_format
  ),
  constraint professional_status_media_match check (
    (media_kind='image' and media_format='jpg') or
    (media_kind='video' and media_format in ('mp4','mov','webm'))
  ),
  constraint professional_status_lifetime check (
    expires_at > created_at and expires_at <= created_at + interval '24 hours'
  )
);

create index if not exists professional_statuses_public_idx
  on public.professional_statuses(expires_at desc,provider_id)
  where hidden_at is null;
create index if not exists professional_statuses_owner_idx
  on public.professional_statuses(provider_id,created_at desc);

-- Always use server timestamps; prevent clients from extending the lifetime.
create or replace function public.prepare_professional_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.provider_id is distinct from auth.uid() then
    raise exception 'Statut professionnel non autorisé' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.provider_profiles p
    join public.profiles account on account.id=p.profile_id
    where p.profile_id=auth.uid() and p.status='approved' and not account.is_suspended
  ) then
    raise exception 'Seuls les professionnels approuvés peuvent publier' using errcode='42501';
  end if;
  if (select count(*) from public.professional_statuses s
      where s.provider_id=auth.uid() and s.created_at > now()-interval '1 hour') >= 6 then
    raise exception 'Limite de six statuts par heure atteinte' using errcode='23514';
  end if;
  new.created_at := now();
  new.expires_at := new.created_at + interval '24 hours';
  new.hidden_at := null;
  return new;
end $$;
revoke all on function public.prepare_professional_status() from public,anon,authenticated;
drop trigger if exists professional_status_before_insert on public.professional_statuses;
create trigger professional_status_before_insert before insert on public.professional_statuses
for each row execute function public.prepare_professional_status();

alter table public.professional_statuses enable row level security;
drop policy if exists "professional statuses active or owner read" on public.professional_statuses;
create policy "professional statuses active or owner read" on public.professional_statuses
for select using (
  provider_id=auth.uid()
  or (
    hidden_at is null and created_at <= now() and expires_at > now()
    and exists (
      select 1 from public.provider_profiles pp
      join public.profiles account on account.id=pp.profile_id
      where pp.profile_id=professional_statuses.provider_id
        and pp.status='approved' and not account.is_suspended
    )
  )
);
drop policy if exists "professional statuses approved provider insert" on public.professional_statuses;
create policy "professional statuses approved provider insert" on public.professional_statuses
for insert to authenticated with check (
  provider_id=auth.uid()
  and exists (
    select 1 from public.provider_profiles pp
    join public.profiles account on account.id=pp.profile_id
    where pp.profile_id=auth.uid() and pp.status='approved' and not account.is_suspended
  )
  and exists (
    select 1 from storage.objects o where
      o.bucket_id='professional-status-media' and o.name=media_path and
      (storage.foldername(o.name))[1]=auth.uid()::text
  )
);
drop policy if exists "professional statuses owner delete" on public.professional_statuses;
create policy "professional statuses owner delete" on public.professional_statuses
for delete to authenticated using (provider_id=auth.uid());
-- No client UPDATE policy: status contents and expiry cannot be edited.
revoke all on public.professional_statuses from anon,authenticated;
grant select on public.professional_statuses to anon,authenticated;
grant insert,delete on public.professional_statuses to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'professional-status-media','professional-status-media',false,20971520,
  array['image/jpeg','video/mp4','video/quicktime','video/webm']
) on conflict (id) do nothing;

drop policy if exists "professional status authorized read" on storage.objects;
create policy "professional status authorized read" on storage.objects
for select using (
  bucket_id='professional-status-media' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or exists (
      select 1 from public.professional_statuses s
      join public.provider_profiles pp on pp.profile_id=s.provider_id
      join public.profiles account on account.id=s.provider_id
      where s.media_path=storage.objects.name and s.hidden_at is null
        and s.created_at<=now() and s.expires_at>now()
        and pp.status='approved' and not account.is_suspended
    )
  )
);
drop policy if exists "professional status approved uploader" on storage.objects;
create policy "professional status approved uploader" on storage.objects
for insert to authenticated with check (
  bucket_id='professional-status-media' and
  (storage.foldername(name))[1]=auth.uid()::text
  and exists(
    select 1 from public.provider_profiles pp
    join public.profiles account on account.id=pp.profile_id
    where pp.profile_id=auth.uid() and pp.status='approved' and not account.is_suspended
  )
);
drop policy if exists "professional status owner remove" on storage.objects;
create policy "professional status owner remove" on storage.objects
for delete to authenticated using (
  bucket_id='professional-status-media' and
  (storage.foldername(name))[1]=auth.uid()::text
);

-- A slim public feed, independent of social video posts.
create or replace view public.active_professional_statuses
with (security_invoker=true) as
select s.id,s.provider_id,s.media_kind,s.media_format,s.media_path,s.caption,s.created_at,s.expires_at,
       pp.business_name,pp.slug,pp.city,account.avatar_url
from public.professional_statuses s
join public.provider_profiles pp on pp.profile_id=s.provider_id and pp.status='approved'
join public.profiles account on account.id=s.provider_id and not account.is_suspended
where s.hidden_at is null and s.created_at<=now() and s.expires_at>now();
grant select on public.active_professional_statuses to anon,authenticated;

-- Expired entries are hidden by SQL immediately. Physical storage cleanup
-- requires a separately deployed service-role job (not a SQL metadata delete).
