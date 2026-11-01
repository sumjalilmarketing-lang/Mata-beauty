-- Actions sociales atomiques et publication vidéo contrôlée côté serveur.

create table public.post_shares (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  session_hash text not null check (char_length(session_hash) = 64),
  share_day date not null default (timezone('UTC', now())::date),
  created_at timestamptz not null default now(),
  unique (post_id, session_hash, share_day)
);

alter table public.post_shares enable row level security;

create unique index reports_one_open_post_reporter_idx
  on public.reports(reporter_id, post_id)
  where post_id is not null and status in ('open', 'reviewing');

create or replace function public.record_post_share(target_post_id uuid, target_session_hash text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare result_count bigint;
begin
  if char_length(target_session_hash) <> 64 then
    raise exception 'Partage invalide';
  end if;

  insert into public.post_shares(post_id, profile_id, session_hash)
  select target_post_id, auth.uid(), target_session_hash
  from public.posts
  where id = target_post_id and status = 'published' and visibility = 'public'
  on conflict do nothing;

  if found then
    perform set_config('mata.counter_update', 'on', true);
    update public.posts set share_count = share_count + 1 where id = target_post_id;
  end if;

  select share_count into result_count from public.posts where id = target_post_id;
  if result_count is null then raise exception 'Publication introuvable'; end if;
  return result_count;
end;
$$;

create or replace function public.report_social_post(target_post_id uuid, target_reason text, target_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_reason not in ('contenu_inapproprie', 'spam', 'usurpation', 'danger', 'autre') then
    raise exception 'Motif de signalement invalide';
  end if;
  if not exists(select 1 from public.posts where id = target_post_id and status = 'published') then
    raise exception 'Publication introuvable';
  end if;

  select id into result_id
  from public.reports
  where reporter_id = auth.uid() and post_id = target_post_id and status in ('open', 'reviewing')
  limit 1;

  if result_id is null then
    insert into public.reports(reporter_id, post_id, reported_profile_id, reason, details)
    select auth.uid(), p.id, p.author_id, target_reason, nullif(trim(target_details), '')
    from public.posts p where p.id = target_post_id
    returning id into result_id;
  end if;
  return result_id;
end;
$$;

create or replace function public.create_video_post(
  target_caption text,
  target_video_url text,
  target_thumbnail_url text,
  target_duration_seconds numeric,
  target_aspect_ratio numeric,
  target_provider_service_id uuid,
  target_status text,
  target_allow_comments boolean,
  target_client_consent boolean,
  target_scheduled_for timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
  provider_status text;
  final_published_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select status into provider_status from public.provider_profiles where profile_id = auth.uid();
  if provider_status is null then raise exception 'Compte professionnel requis'; end if;
  if target_status not in ('draft', 'scheduled', 'published') then raise exception 'Statut invalide'; end if;
  if target_status in ('published', 'scheduled') and provider_status <> 'approved' then raise exception 'Profil professionnel non approuvé'; end if;
  if target_status = 'published' and not target_client_consent then raise exception 'Le consentement client est obligatoire'; end if;
  if target_status = 'scheduled' and (target_scheduled_for is null or target_scheduled_for <= now()) then raise exception 'Date de programmation invalide'; end if;
  if target_duration_seconds not between 1 and 90 then raise exception 'La vidéo doit durer entre 1 et 90 secondes'; end if;
  if target_aspect_ratio not between 0.4 and 1.8 then raise exception 'Format vidéo invalide'; end if;
  if position('/storage/v1/object/public/social-videos/' in target_video_url) = 0 then raise exception 'URL vidéo invalide'; end if;
  if target_thumbnail_url is not null and position('/storage/v1/object/public/social-thumbnails/' in target_thumbnail_url) = 0 then raise exception 'URL miniature invalide'; end if;
  if target_provider_service_id is not null and not exists(
    select 1 from public.provider_services
    where id = target_provider_service_id and provider_id = auth.uid() and is_active
  ) then raise exception 'Prestation invalide'; end if;

  final_published_at := case when target_status = 'published' then now() else null end;
  insert into public.posts(
    author_id, caption, status, visibility, video_url, thumbnail_url,
    duration_seconds, aspect_ratio, allow_comments, client_consent_confirmed,
    scheduled_for, published_at
  ) values (
    auth.uid(), trim(target_caption), target_status, 'public', target_video_url, target_thumbnail_url,
    target_duration_seconds, target_aspect_ratio, target_allow_comments, target_client_consent,
    target_scheduled_for, final_published_at
  ) returning id into result_id;

  if target_provider_service_id is not null then
    insert into public.post_services(post_id, provider_service_id, is_primary)
    values(result_id, target_provider_service_id, true);
  end if;
  return result_id;
end;
$$;

revoke all on function public.record_post_share(uuid, text) from public;
revoke all on function public.report_social_post(uuid, text, text) from public, anon;
revoke all on function public.create_video_post(text, text, text, numeric, numeric, uuid, text, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.record_post_share(uuid, text) to anon, authenticated;
grant execute on function public.report_social_post(uuid, text, text) to authenticated;
grant execute on function public.create_video_post(text, text, text, numeric, numeric, uuid, text, boolean, boolean, timestamptz) to authenticated;

comment on function public.create_video_post is 'Valide et publie les métadonnées sociales; les fichiers restent protégés par les politiques Storage.';
