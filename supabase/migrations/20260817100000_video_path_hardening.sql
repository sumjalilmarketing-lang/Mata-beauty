begin;

-- Les anciens buckets restent compatibles, mais ne doivent plus exposer les
-- brouillons ou médias masqués par une URL publique permanente.
update storage.buckets
set public = false
where id in ('social-videos', 'social-thumbnails');

drop policy if exists "public social media reads" on storage.objects;
drop policy if exists "authorized legacy social media reads" on storage.objects;
create policy "authorized legacy social media reads"
on storage.objects for select
using (
  bucket_id in ('social-videos', 'social-thumbnails')
  and (
    owner_id = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1
      from public.posts post
      where post.status = 'published'
        and post.visibility = 'public'
        and (
          (bucket_id = 'social-videos' and split_part(post.video_url, '/social-videos/', 2) = name)
          or (bucket_id = 'social-thumbnails' and split_part(coalesce(post.thumbnail_url, ''), '/social-thumbnails/', 2) = name)
        )
    )
  )
);

-- Le nombre d'abonnés est public uniquement pour les professionnels publiables.
-- La fonction ne révèle ni l'identité des abonnés ni leurs profils.
create or replace function public.get_provider_follower_counts(target_provider_ids uuid[])
returns table(provider_id uuid, follower_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_provider_ids is null or cardinality(target_provider_ids) = 0 then
    return;
  end if;
  if cardinality(target_provider_ids) > 100 then
    raise exception 'Trop de professionnels demandés';
  end if;

  return query
  select provider.profile_id, count(follow.follower_id)::bigint
  from public.provider_profiles provider
  join public.profiles profile on profile.id = provider.profile_id and not profile.is_suspended
  left join public.follows follow on follow.followed_provider_id = provider.profile_id
  where provider.status = 'approved'
    and provider.profile_id = any(target_provider_ids)
  group by provider.profile_id;
end;
$$;

revoke all on function public.get_provider_follower_counts(uuid[]) from public;
grant execute on function public.get_provider_follower_counts(uuid[]) to anon, authenticated;

commit;
