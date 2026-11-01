-- Feed Inspiration immersif : attribution sociale, visites profil et modèles de lecture normalisés.
-- Les tables historiques restent la source de vérité afin de ne pas dupliquer les interactions.

alter table public.follows
  add column if not exists source_post_id uuid references public.posts(id) on delete set null;

create index if not exists follows_source_post_idx
  on public.follows(source_post_id, created_at desc)
  where source_post_id is not null;

create table if not exists public.social_profile_visits (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  source_post_id uuid references public.posts(id) on delete set null,
  visitor_id uuid references public.profiles(id) on delete set null,
  session_hash text not null check (char_length(session_hash) = 64),
  visit_day date not null default (timezone('UTC', now())::date),
  created_at timestamptz not null default now(),
  unique(provider_id, source_post_id, session_hash, visit_day)
);

create index if not exists social_profile_visits_provider_idx
  on public.social_profile_visits(provider_id, created_at desc);

alter table public.social_profile_visits enable row level security;

drop policy if exists "creator reads attributed profile visits" on public.social_profile_visits;
create policy "creator reads attributed profile visits" on public.social_profile_visits
  for select using(provider_id = auth.uid() or public.is_admin());

create or replace function public.toggle_follow_provider_from_post(target_provider_id uuid, target_source_post_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare now_active boolean;
begin
  if auth.uid() is null or auth.uid() = target_provider_id then raise exception 'Abonnement invalide'; end if;
  if not exists(select 1 from public.provider_profiles where profile_id=target_provider_id and status='approved') then raise exception 'Prestataire introuvable'; end if;
  if target_source_post_id is not null and not exists(
    select 1 from public.posts where id=target_source_post_id and author_id=target_provider_id and status='published'
  ) then raise exception 'Publication invalide'; end if;
  delete from public.follows where follower_id=auth.uid() and followed_provider_id=target_provider_id;
  if found then now_active:=false;
  else
    insert into public.follows(follower_id,followed_provider_id,source_post_id)
    values(auth.uid(),target_provider_id,target_source_post_id);
    now_active:=true;
  end if;
  return now_active;
end; $$;

create or replace function public.record_social_profile_visit(target_provider_id uuid, target_post_id uuid, target_session_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if char_length(target_session_hash) <> 64 then raise exception 'Visite invalide'; end if;
  insert into public.social_profile_visits(provider_id,source_post_id,visitor_id,session_hash)
  select target_provider_id,target_post_id,auth.uid(),target_session_hash
  from public.posts p
  where p.id=target_post_id and p.author_id=target_provider_id and p.status='published' and p.visibility='public'
  on conflict do nothing;
end; $$;

-- Noms métier demandés par le produit. Ce sont des vues RLS sur les tables canoniques,
-- ce qui conserve une seule écriture atomique par interaction.
create or replace view public.social_post_views with(security_invoker=true) as select * from public.video_views;
create or replace view public.social_post_likes with(security_invoker=true) as select * from public.post_likes;
create or replace view public.social_post_comments with(security_invoker=true) as select * from public.post_comments;
create or replace view public.social_post_saves with(security_invoker=true) as select * from public.post_saves;
create or replace view public.social_post_shares with(security_invoker=true) as select * from public.post_shares;
create or replace view public.social_post_reports with(security_invoker=true) as select * from public.reports where post_id is not null;
create or replace view public.provider_follows with(security_invoker=true) as select * from public.follows;

drop function if exists public.provider_creator_statistics(timestamptz,timestamptz);
create function public.provider_creator_statistics(target_from timestamptz default now()-interval '30 days', target_to timestamptz default now())
returns table(
  post_id uuid, views bigint, average_watch_ms bigint, completion_rate numeric,
  likes bigint, comments bigint, saves bigint, shares bigint, new_followers bigint,
  profile_visits bigint, booking_clicks bigint, bookings bigint, gross_amount bigint
) language sql stable security definer set search_path = '' as $$
  select p.id,p.view_count,
    coalesce((select avg(v.watched_ms)::bigint from public.video_views v where v.post_id=p.id and v.created_at>=target_from and v.created_at<target_to),0),
    coalesce((select avg(case when v.completed then 100 else 0 end)::numeric(5,2) from public.video_views v where v.post_id=p.id and v.created_at>=target_from and v.created_at<target_to),0),
    p.like_count,p.comment_count,p.save_count,p.share_count,
    (select count(*) from public.follows f where f.source_post_id=p.id and f.created_at>=target_from and f.created_at<target_to),
    (select count(*) from public.social_profile_visits pv where pv.source_post_id=p.id and pv.created_at>=target_from and pv.created_at<target_to),
    (select count(*) from public.post_booking_clicks bc where bc.post_id=p.id and bc.created_at>=target_from and bc.created_at<target_to),
    (select count(*) from public.bookings b where b.source_post_id=p.id and b.created_at>=target_from and b.created_at<target_to),
    coalesce((select sum(b.total_amount)::bigint from public.bookings b where b.source_post_id=p.id and b.created_at>=target_from and b.created_at<target_to and b.status not in ('declined','cancelled_by_client','cancelled_by_provider')),0)
  from public.posts p where p.author_id=auth.uid() order by p.published_at desc nulls last;
$$;

revoke all on function public.toggle_follow_provider_from_post(uuid,uuid),public.record_social_profile_visit(uuid,uuid,text),public.provider_creator_statistics(timestamptz,timestamptz) from public,anon;
grant execute on function public.toggle_follow_provider_from_post(uuid,uuid) to authenticated;
grant execute on function public.record_social_profile_visit(uuid,uuid,text) to anon,authenticated;
grant execute on function public.provider_creator_statistics(timestamptz,timestamptz) to authenticated;
grant select on public.social_post_views,public.social_post_likes,public.social_post_comments,public.social_post_saves,public.social_post_shares,public.social_post_reports,public.provider_follows to authenticated;

comment on table public.social_profile_visits is 'Visites uniques de profils attribuées à une publication du feed Inspiration.';
