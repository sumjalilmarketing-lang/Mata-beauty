-- Fondation sociale vidéo Mata Beauty. Les documents KYC restent dans leur bucket privé séparé.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  caption text not null default '' check(char_length(caption)<=2200),
  status text not null default 'draft' check(status in ('draft','scheduled','published','hidden','deleted')),
  visibility text not null default 'public' check(visibility in ('public','followers')),
  video_url text not null check(video_url~'^https://'),
  thumbnail_url text,
  duration_seconds numeric(6,2) not null check(duration_seconds between 1 and 90),
  aspect_ratio numeric(5,3) not null default 0.562 check(aspect_ratio between 0.4 and 1.8),
  allow_comments boolean not null default true,
  is_sponsored boolean not null default false,
  client_consent_confirmed boolean not null default false,
  view_count bigint not null default 0 check(view_count>=0),
  like_count bigint not null default 0 check(like_count>=0),
  comment_count bigint not null default 0 check(comment_count>=0),
  save_count bigint not null default 0 check(save_count>=0),
  share_count bigint not null default 0 check(share_count>=0),
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status<>'published' or (published_at is not null and client_consent_confirmed))
);

create table if not exists public.post_services (
  post_id uuid not null references public.posts(id) on delete cascade,
  provider_service_id uuid not null references public.provider_services(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(post_id,provider_service_id)
);
create unique index if not exists post_services_one_primary_idx on public.post_services(post_id) where is_primary;

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,profile_id)
);
create table if not exists public.post_saves (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,profile_id)
);
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,followed_provider_id),
  check(follower_id<>followed_provider_id)
);
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.post_comments(id) on delete cascade,
  body text not null check(char_length(trim(body)) between 1 and 1000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(name~'^[a-z0-9_]{2,50}$'),
  post_count bigint not null default 0 check(post_count>=0),
  created_at timestamptz not null default now()
);
create table if not exists public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  primary key(post_id,hashtag_id)
);
create table if not exists public.video_views (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  session_hash text not null,
  watched_ms integer not null check(watched_ms>=0),
  completed boolean not null default false,
  view_day date not null default (timezone('UTC',now())::date),
  created_at timestamptz not null default now()
);
create unique index if not exists video_views_session_post_day_idx on public.video_views(post_id,session_hash,view_day);
alter table public.reports add column if not exists post_id uuid references public.posts(id) on delete set null;

create index if not exists posts_public_feed_idx on public.posts(status,published_at desc);
create index if not exists posts_author_idx on public.posts(author_id,created_at desc);
create index if not exists post_comments_post_idx on public.post_comments(post_id,created_at desc);
create index if not exists follows_provider_idx on public.follows(followed_provider_id,created_at desc);

create or replace view public.social_feed with(security_invoker=true) as
select p.id,p.author_id,p.caption,p.video_url,p.thumbnail_url,p.duration_seconds,p.aspect_ratio,p.allow_comments,p.is_sponsored,
  p.view_count,p.like_count,p.comment_count,p.save_count,p.share_count,p.published_at,
  pp.business_name,pp.slug,pp.city,pp.average_rating,pp.review_count,pp.verified_at,pp.cover_url,pr.avatar_url,
  ps.provider_service_id,svc.title as service_title,svc.duration_minutes,svc.price_amount,svc.currency,
  greatest(0,extract(epoch from (now()-p.published_at))/3600) as age_hours
from public.posts p
join public.provider_profiles pp on pp.profile_id=p.author_id and pp.status='approved'
join public.profiles pr on pr.id=p.author_id and not pr.is_suspended
left join public.post_services ps on ps.post_id=p.id and ps.is_primary
left join public.provider_services svc on svc.id=ps.provider_service_id and svc.is_active
where p.status='published' and p.visibility='public';

create or replace function public.toggle_post_like(target_post_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare active boolean; result_count bigint;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  perform 1 from public.posts where id=target_post_id and status='published' for update;
  if not found then raise exception 'Publication introuvable'; end if;
  if exists(select 1 from public.post_likes where post_id=target_post_id and profile_id=auth.uid()) then
    delete from public.post_likes where post_id=target_post_id and profile_id=auth.uid(); active:=false;
  else insert into public.post_likes(post_id,profile_id) values(target_post_id,auth.uid()); active:=true; end if;
  select count(*) into result_count from public.post_likes where post_id=target_post_id;
  perform set_config('mata.counter_update','on',true);
  update public.posts set like_count=result_count where id=target_post_id;
  return jsonb_build_object('active',active,'count',result_count);
end; $$;

create or replace function public.toggle_post_save(target_post_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare active boolean; result_count bigint;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  perform 1 from public.posts where id=target_post_id and status='published' for update;
  if not found then raise exception 'Publication introuvable'; end if;
  if exists(select 1 from public.post_saves where post_id=target_post_id and profile_id=auth.uid()) then
    delete from public.post_saves where post_id=target_post_id and profile_id=auth.uid(); active:=false;
  else insert into public.post_saves(post_id,profile_id) values(target_post_id,auth.uid()); active:=true; end if;
  select count(*) into result_count from public.post_saves where post_id=target_post_id;
  perform set_config('mata.counter_update','on',true);
  update public.posts set save_count=result_count where id=target_post_id;
  return jsonb_build_object('active',active,'count',result_count);
end; $$;

create or replace function public.toggle_follow_provider(target_provider_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not exists(select 1 from public.provider_profiles where profile_id=target_provider_id and status='approved') then raise exception 'Professionnel introuvable'; end if;
  if exists(select 1 from public.follows where follower_id=auth.uid() and followed_provider_id=target_provider_id) then
    delete from public.follows where follower_id=auth.uid() and followed_provider_id=target_provider_id; return false;
  end if;
  insert into public.follows(follower_id,followed_provider_id) values(auth.uid(),target_provider_id); return true;
end; $$;

create or replace function public.record_video_view(target_post_id uuid,target_session_hash text,target_watched_ms integer,target_completed boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if char_length(target_session_hash)<>64 or target_watched_ms<0 then raise exception 'Vue invalide'; end if;
  insert into public.video_views(post_id,viewer_id,session_hash,watched_ms,completed)
  select target_post_id,auth.uid(),target_session_hash,target_watched_ms,target_completed
  from public.posts where id=target_post_id and status='published'
  on conflict do nothing;
  if found then perform set_config('mata.counter_update','on',true); update public.posts set view_count=view_count+1 where id=target_post_id; end if;
end; $$;

create or replace function public.protect_social_counters()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(current_setting('mata.counter_update',true),'')<>'on' and not public.is_admin() and
    (new.view_count is distinct from old.view_count or new.like_count is distinct from old.like_count or
     new.comment_count is distinct from old.comment_count or new.save_count is distinct from old.save_count or new.share_count is distinct from old.share_count)
  then raise exception 'Les compteurs sociaux sont gérés côté serveur'; end if;
  return new;
end; $$;
drop trigger if exists posts_protect_counters on public.posts;
create trigger posts_protect_counters before update on public.posts for each row execute function public.protect_social_counters();

create or replace function public.refresh_post_comment_count()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid:=coalesce(new.post_id,old.post_id);
begin
  perform set_config('mata.counter_update','on',true);
  update public.posts set comment_count=(select count(*) from public.post_comments where post_id=target_id and not is_hidden) where id=target_id;
  return coalesce(new,old);
end; $$;
drop trigger if exists post_comments_refresh_count on public.post_comments;
create trigger post_comments_refresh_count after insert or update or delete on public.post_comments for each row execute function public.refresh_post_comment_count();

revoke all on function public.toggle_post_like(uuid) from public,anon;
revoke all on function public.toggle_post_save(uuid) from public,anon;
revoke all on function public.toggle_follow_provider(uuid) from public,anon;
revoke all on function public.record_video_view(uuid,text,integer,boolean) from public;
grant execute on function public.toggle_post_like(uuid),public.toggle_post_save(uuid),public.toggle_follow_provider(uuid) to authenticated;
grant execute on function public.record_video_view(uuid,text,integer,boolean) to anon,authenticated;
grant select on public.social_feed to anon,authenticated;

alter table public.posts enable row level security;
alter table public.post_services enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;
alter table public.follows enable row level security;
alter table public.post_comments enable row level security;
alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;
alter table public.video_views enable row level security;
create policy "published posts public read" on public.posts for select using((status='published' and visibility='public') or author_id=auth.uid() or public.is_admin());
create policy "authors manage own posts" on public.posts for all using(author_id=auth.uid() or public.is_admin()) with check(author_id=auth.uid() or public.is_admin());
create policy "published post services read" on public.post_services for select using(exists(select 1 from public.posts p where p.id=post_id and (p.status='published' or p.author_id=auth.uid())));
create policy "authors manage post services" on public.post_services for all using(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid())) with check(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()));
create policy "likes own read" on public.post_likes for select using(profile_id=auth.uid());
create policy "saves own read" on public.post_saves for select using(profile_id=auth.uid());
create policy "follows own read" on public.follows for select using(follower_id=auth.uid());
create policy "visible comments public read" on public.post_comments for select using(not is_hidden and exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
create policy "comments own create" on public.post_comments for insert with check(author_id=auth.uid() and exists(select 1 from public.posts p where p.id=post_id and p.status='published' and p.allow_comments));
create policy "comments own update" on public.post_comments for update using(author_id=auth.uid() or public.is_admin()) with check(author_id=auth.uid() or public.is_admin());
create policy "comments own delete" on public.post_comments for delete using(author_id=auth.uid() or public.is_admin());
create policy "hashtags public read" on public.hashtags for select using(true);
create policy "post hashtags public read" on public.post_hashtags for select using(exists(select 1 from public.posts p where p.id=post_id and p.status='published'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('social-videos','social-videos',true,104857600,array['video/mp4','video/webm','video/quicktime']),
      ('social-thumbnails','social-thumbnails',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "public social media reads" on storage.objects for select using(bucket_id in ('social-videos','social-thumbnails'));
create policy "providers upload own social videos" on storage.objects for insert with check(bucket_id='social-videos' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.provider_profiles where profile_id=auth.uid()));
create policy "providers update own social videos" on storage.objects for update using(bucket_id='social-videos' and owner_id=auth.uid()::text) with check(bucket_id='social-videos' and owner_id=auth.uid()::text);
create policy "providers delete own social videos" on storage.objects for delete using(bucket_id='social-videos' and owner_id=auth.uid()::text);
create policy "providers manage own social thumbnails" on storage.objects for all using(bucket_id='social-thumbnails' and owner_id=auth.uid()::text) with check(bucket_id='social-thumbnails' and (storage.foldername(name))[1]=auth.uid()::text);

comment on table public.posts is 'Publications sociales vidéo. Aucun document KYC ne doit être stocké dans les buckets sociaux.';
