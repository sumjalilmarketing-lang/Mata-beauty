-- Complète le feed social: service obligatoire, vues fiables, réponses, collections et statistiques.

alter table public.reports
  add column if not exists comment_id uuid references public.post_comments(id) on delete set null;

create table if not exists public.inspiration_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.inspiration_collection_posts (
  collection_id uuid not null references public.inspiration_collections(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, post_id)
);

create table if not exists public.post_booking_clicks (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  session_hash text not null check (char_length(session_hash) = 64),
  click_day date not null default (timezone('UTC', now())::date),
  created_at timestamptz not null default now(),
  unique (post_id, session_hash, click_day)
);

alter table public.inspiration_collections enable row level security;
alter table public.inspiration_collection_posts enable row level security;
alter table public.post_booking_clicks enable row level security;

create policy "collections owner access" on public.inspiration_collections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "collection posts owner access" on public.inspiration_collection_posts
  for all using (exists (select 1 from public.inspiration_collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.inspiration_collections c where c.id = collection_id and c.owner_id = auth.uid()));

create unique index if not exists reports_one_open_comment_reporter_idx
  on public.reports(reporter_id, comment_id)
  where comment_id is not null and status in ('open', 'reviewing');

-- Le compteur est incrémenté uniquement lors de la première vue quotidienne.
create or replace function public.increment_video_view_once()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('mata.counter_update', 'on', true);
  update public.posts set view_count = view_count + 1 where id = new.post_id;
  return new;
end; $$;
drop trigger if exists video_views_increment_post on public.video_views;
create trigger video_views_increment_post after insert on public.video_views
for each row execute function public.increment_video_view_once();

-- Le trigger gère désormais le compteur; la RPC ne doit faire que l'upsert.
create or replace function public.record_video_view(target_post_id uuid, target_session_hash text, target_watched_ms integer, target_completed boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(target_session_hash) <> 64 or target_watched_ms < 0 then raise exception 'Vue invalide'; end if;
  insert into public.video_views(post_id, viewer_id, session_hash, watched_ms, completed)
  select target_post_id, auth.uid(), target_session_hash, target_watched_ms, target_completed
  from public.posts where id = target_post_id and status = 'published' and visibility = 'public'
  on conflict (post_id, session_hash, view_day) do update
    set watched_ms = greatest(public.video_views.watched_ms, excluded.watched_ms),
        completed = public.video_views.completed or excluded.completed;
end; $$;

create or replace function public.record_post_booking_click(target_post_id uuid, target_session_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(target_session_hash) <> 64 then raise exception 'Clic invalide'; end if;
  insert into public.post_booking_clicks(post_id, profile_id, session_hash)
  select target_post_id, auth.uid(), target_session_hash from public.posts
  where id = target_post_id and status = 'published' and visibility = 'public'
  on conflict do nothing;
end; $$;

create or replace function public.report_post_comment(target_comment_id uuid, target_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_reason not in ('contenu_inapproprie', 'spam', 'harcelement', 'autre') then raise exception 'Motif invalide'; end if;
  select id into result_id from public.reports
    where reporter_id = auth.uid() and comment_id = target_comment_id and status in ('open', 'reviewing') limit 1;
  if result_id is null then
    insert into public.reports(reporter_id, reported_profile_id, post_id, comment_id, reason)
    select auth.uid(), c.author_id, c.post_id, c.id, target_reason from public.post_comments c
    join public.posts p on p.id = c.post_id and p.status = 'published'
    where c.id = target_comment_id and not c.is_hidden returning id into result_id;
  end if;
  if result_id is null then raise exception 'Commentaire introuvable'; end if;
  return result_id;
end; $$;

create or replace function public.guard_published_post_service()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('published', 'scheduled') and not exists (
    select 1 from public.post_services ps join public.provider_services s on s.id = ps.provider_service_id
    where ps.post_id = new.id and ps.is_primary and s.provider_id = new.author_id and s.is_active
  ) then raise exception 'Une prestation active est obligatoire pour publier'; end if;
  return new;
end; $$;
drop trigger if exists posts_require_primary_service on public.posts;
create constraint trigger posts_require_primary_service after insert or update on public.posts
deferrable initially deferred for each row execute function public.guard_published_post_service();

drop function if exists public.create_video_post(text,text,text,numeric,numeric,uuid,text,boolean,boolean,timestamptz);
create function public.create_video_post(
  target_caption text, target_video_url text, target_thumbnail_url text, target_duration_seconds numeric,
  target_aspect_ratio numeric, target_provider_service_id uuid, target_status text, target_allow_comments boolean,
  target_client_consent boolean, target_scheduled_for timestamptz default null,
  target_visibility text default 'public', target_hashtags text[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid; provider_status text; tag text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select status into provider_status from public.provider_profiles where profile_id = auth.uid();
  if provider_status is null then raise exception 'Compte professionnel requis'; end if;
  if target_status not in ('draft','scheduled','published') or target_visibility not in ('public','followers') then raise exception 'Publication invalide'; end if;
  if target_status in ('published','scheduled') and provider_status <> 'approved' then raise exception 'Profil professionnel non approuvé'; end if;
  if target_status in ('published','scheduled') and target_provider_service_id is null then raise exception 'Une prestation est obligatoire'; end if;
  if target_status = 'published' and not target_client_consent then raise exception 'Le consentement client est obligatoire'; end if;
  if target_status = 'scheduled' and (target_scheduled_for is null or target_scheduled_for <= now()) then raise exception 'Date invalide'; end if;
  if target_duration_seconds not between 1 and 90 or target_aspect_ratio not between 0.4 and 1.8 then raise exception 'Vidéo invalide'; end if;
  if position('/storage/v1/object/public/social-videos/' in target_video_url) = 0 then raise exception 'URL vidéo invalide'; end if;
  if target_provider_service_id is not null and not exists (select 1 from public.provider_services where id = target_provider_service_id and provider_id = auth.uid() and is_active) then raise exception 'Prestation invalide'; end if;
  insert into public.posts(author_id,caption,status,visibility,video_url,thumbnail_url,duration_seconds,aspect_ratio,allow_comments,client_consent_confirmed,scheduled_for,published_at)
  values(auth.uid(),trim(target_caption),target_status,target_visibility,target_video_url,target_thumbnail_url,target_duration_seconds,target_aspect_ratio,target_allow_comments,target_client_consent,target_scheduled_for,case when target_status='published' then now() end)
  returning id into result_id;
  if target_provider_service_id is not null then insert into public.post_services(post_id,provider_service_id,is_primary) values(result_id,target_provider_service_id,true); end if;
  foreach tag in array target_hashtags loop
    tag := lower(regexp_replace(trim(tag), '^#|[^a-zA-Z0-9_]', '', 'g'));
    if char_length(tag) between 2 and 50 then
      insert into public.hashtags(name) values(tag) on conflict(name) do nothing;
      insert into public.post_hashtags(post_id,hashtag_id) select result_id,id from public.hashtags where name=tag on conflict do nothing;
    end if;
  end loop;
  return result_id;
end; $$;

create or replace function public.social_post_not_strongly_reported(target_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) < 3 from public.reports where post_id=target_post_id and status in ('open','reviewing');
$$;

create or replace view public.social_feed with(security_invoker=true) as
select p.id,p.author_id,p.caption,p.video_url,p.thumbnail_url,p.duration_seconds,p.aspect_ratio,p.allow_comments,p.is_sponsored,
  p.view_count,p.like_count,p.comment_count,p.save_count,p.share_count,p.published_at,
  pp.business_name,pp.slug,pp.city,pp.average_rating,pp.review_count,pp.verified_at,pp.cover_url,pr.avatar_url,
  ps.provider_service_id,svc.title as service_title,svc.duration_minutes,svc.price_amount,svc.currency,
  greatest(0,extract(epoch from (now()-p.published_at))/3600) as age_hours,
  coalesce((select array_agg(h.name order by h.name) from public.post_hashtags ph join public.hashtags h on h.id=ph.hashtag_id where ph.post_id=p.id),'{}') as hashtags
from public.posts p
join public.provider_profiles pp on pp.profile_id=p.author_id and pp.status='approved'
join public.profiles pr on pr.id=p.author_id and not pr.is_suspended
join public.post_services ps on ps.post_id=p.id and ps.is_primary
join public.provider_services svc on svc.id=ps.provider_service_id and svc.is_active
where p.status='published' and p.visibility='public'
and public.social_post_not_strongly_reported(p.id);

create or replace function public.provider_creator_statistics(target_from timestamptz default now()-interval '30 days', target_to timestamptz default now())
returns table(post_id uuid, views bigint, average_watch_ms bigint, completion_rate numeric, likes bigint, comments bigint, saves bigint, booking_clicks bigint, bookings bigint, gross_amount bigint)
language sql security definer set search_path = '' as $$
  select p.id,p.view_count,coalesce(avg(v.watched_ms),0)::bigint,
    coalesce(avg(case when v.completed then 100 else 0 end),0)::numeric(5,2),p.like_count,p.comment_count,p.save_count,
    count(distinct bc.id),count(distinct b.id),coalesce(max(x.gross_amount),0)::bigint
  from public.posts p
  left join public.video_views v on v.post_id=p.id and v.created_at>=target_from and v.created_at<target_to
  left join public.post_booking_clicks bc on bc.post_id=p.id and bc.created_at>=target_from and bc.created_at<target_to
  left join public.bookings b on b.source_post_id=p.id and b.created_at>=target_from and b.created_at<target_to
  left join lateral (select sum(total_amount) gross_amount from public.bookings bx where bx.source_post_id=p.id and bx.created_at>=target_from and bx.created_at<target_to and bx.status not in ('declined','cancelled_by_client','cancelled_by_provider')) x on true
  where p.author_id=auth.uid() group by p.id,p.view_count,p.like_count,p.comment_count,p.save_count order by p.published_at desc;
$$;

revoke all on function public.record_post_booking_click(uuid,text), public.report_post_comment(uuid,text), public.provider_creator_statistics(timestamptz,timestamptz) from public;
grant execute on function public.record_post_booking_click(uuid,text) to anon,authenticated;
grant execute on function public.report_post_comment(uuid,text), public.provider_creator_statistics(timestamptz,timestamptz) to authenticated;
grant execute on function public.social_post_not_strongly_reported(uuid) to anon,authenticated;
grant execute on function public.create_video_post(text,text,text,numeric,numeric,uuid,text,boolean,boolean,timestamptz,text,text[]) to authenticated;
grant select on public.social_feed to anon,authenticated;
