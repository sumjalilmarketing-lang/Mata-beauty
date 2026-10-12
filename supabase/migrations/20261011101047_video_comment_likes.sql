-- Likes are separate from verified booking reviews. Individual liker identities
-- are private; public aggregates are returned only for currently visible comments.
create table public.post_comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);
create index post_comment_likes_profile_idx on public.post_comment_likes(profile_id);
alter table public.post_comment_likes enable row level security;
revoke all on public.post_comment_likes from anon, authenticated;
grant select on public.post_comment_likes to authenticated;
grant all on public.post_comment_likes to service_role;
create policy "comment likes own read" on public.post_comment_likes for select to authenticated
using (profile_id = (select auth.uid()) and exists (
  select 1 from public.post_comments c join public.social_feed f on f.id=c.post_id
  where c.id=comment_id and not c.is_hidden
));

create function public.get_post_comment_likes(target_comment_ids uuid[])
returns table(comment_id uuid, like_count bigint, liked boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(cardinality(target_comment_ids),0)>100 then
    raise exception 'Trop de commentaires demandés' using errcode='22023';
  end if;
  return query
  select c.id, count(l.profile_id), coalesce(bool_or(l.profile_id=auth.uid()),false)
  from public.post_comments c
  join public.social_feed f on f.id=c.post_id
  left join public.post_comment_likes l on l.comment_id=c.id
  where c.id=any(target_comment_ids) and not c.is_hidden
  group by c.id;
end;
$$;
revoke all on function public.get_post_comment_likes(uuid[]) from public;
grant execute on function public.get_post_comment_likes(uuid[]) to anon, authenticated;

-- Desired state, rather than a toggle: a retried request cannot undo a like.
create function public.set_post_comment_like(target_comment_id uuid, target_liked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result_count bigint;
begin
  if target_liked is null then raise exception 'État requis' using errcode='22023'; end if;
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active'
  ) then raise exception 'Compte actif requis' using errcode='42501'; end if;
  perform 1 from public.post_comments c
  where c.id=target_comment_id and not c.is_hidden
    and exists(select 1 from public.social_feed f where f.id=c.post_id)
  for update;
  if not found then raise exception 'Commentaire indisponible' using errcode='42501'; end if;
  if not public.consume_financial_rate_limit('comment_like_minute',md5(auth.uid()::text),60,60) then
    raise exception 'Patientez avant de réessayer' using errcode='P0001';
  end if;
  if target_liked then
    insert into public.post_comment_likes(comment_id,profile_id) values(target_comment_id,auth.uid())
    on conflict (comment_id,profile_id) do nothing;
  else
    delete from public.post_comment_likes where comment_id=target_comment_id and profile_id=auth.uid();
  end if;
  select count(*) into result_count from public.post_comment_likes where comment_id=target_comment_id;
  return jsonb_build_object('active',target_liked,'count',result_count);
end;
$$;
revoke all on function public.set_post_comment_like(uuid,boolean) from public, anon;
grant execute on function public.set_post_comment_like(uuid,boolean) to authenticated;
