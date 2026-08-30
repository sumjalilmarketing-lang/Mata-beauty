begin;

create or replace function public.is_public_social_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.posts post
    join public.provider_profiles provider on provider.profile_id = post.author_id and provider.status = 'approved'
    join public.profiles profile on profile.id = post.author_id and not profile.is_suspended
    join public.post_services link on link.post_id = post.id and link.is_primary
    join public.provider_services service on service.id = link.provider_service_id and service.is_active
    where post.id = target_post_id
      and post.status = 'published'
      and post.visibility = 'public'
      and post.published_at is not null
      and post.published_at <= now()
      and public.social_post_not_strongly_reported(post.id)
  );
$$;

revoke all on function public.is_public_social_post(uuid) from public;
grant execute on function public.is_public_social_post(uuid) to anon, authenticated, service_role;

drop policy if exists "published posts public read" on public.posts;
create policy "published posts public read" on public.posts for select
using (public.is_public_social_post(id) or author_id = auth.uid() or public.is_admin());

drop policy if exists "social media published or owner read" on public.social_post_media;
create policy "social media published or owner read" on public.social_post_media for select
using (
  public.is_public_social_post(post_id)
  or exists(select 1 from public.posts post where post.id = post_id and post.author_id = auth.uid())
  or public.is_admin()
);

drop policy if exists "authorized provider social media reads" on storage.objects;
create policy "authorized provider social media reads" on storage.objects for select
using (
  bucket_id = 'provider-social-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists(
      select 1 from public.social_post_media media
      where media.bucket_id = 'provider-social-media'
        and (media.storage_path = name or media.thumbnail_path = name)
        and public.is_public_social_post(media.post_id)
    )
    or public.is_admin()
  )
);

create index if not exists posts_feed_cursor_idx on public.posts(published_at desc, id desc)
where status = 'published' and visibility = 'public';

commit;
