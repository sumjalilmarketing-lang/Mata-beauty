-- Bind every media reference to its publication's author, including thumbnails.
-- No object is moved, removed or made public. Historical unowned uploads retain
-- access only through their author namespace, never through a third-party link.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create schema if not exists media_security;
revoke all on schema media_security from public;
grant usage on schema media_security to anon, authenticated;

create function media_security.object_path(target_bucket text, stored_path text)
returns text language sql immutable set search_path = '' as $$
  select case
    when stored_path like 'https://%' then case
      when stored_path ~ ('^https://[^/]+/storage/v1/object/(public|sign|authenticated)/' || target_bucket || '/')
      then split_part(split_part(regexp_replace(stored_path, '^https://[^/]+/storage/v1/object/(public|sign|authenticated)/' || target_bucket || '/', ''), '?', 1), '#', 1)
      else null end
    when stored_path not like '%://%' then nullif(stored_path, '')
    else null end;
$$;

create function media_security.object_belongs_to_author(target_bucket text, stored_path text, target_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_bucket in ('provider-social-media','social-videos','social-thumbnails') and exists (
    select 1 from storage.objects object
    where object.bucket_id = target_bucket
      and object.name = media_security.object_path(target_bucket, stored_path)
      and case
        when coalesce(nullif(to_jsonb(object)->>'owner_id',''), nullif(to_jsonb(object)->>'owner','')) is not null
        then coalesce(nullif(to_jsonb(object)->>'owner_id',''), nullif(to_jsonb(object)->>'owner','')) = target_author::text
        else split_part(object.name,'/',1) = target_author::text
      end
  );
$$;

create function media_security.thumbnail_bucket(video_bucket text, stored_path text)
returns text language sql immutable set search_path = '' as $$
  select case when video_bucket = 'social-videos' then 'social-thumbnails' else video_bucket end;
$$;

create function media_security.guard_owned_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare author uuid;
begin
  if tg_op = 'UPDATE' and new.post_id is distinct from old.post_id then
    raise exception 'Media publication cannot be reassigned' using errcode = '42501';
  end if;
  select post.author_id into author from public.posts post where post.id = new.post_id for share;
  if author is null or not media_security.object_belongs_to_author(new.bucket_id, new.storage_path, author)
    or (new.thumbnail_path is not null and not media_security.object_belongs_to_author(media_security.thumbnail_bucket(new.bucket_id,new.thumbnail_path), new.thumbnail_path, author)) then
    raise exception 'Media must belong to the publication author' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger social_media_owned_objects before insert or update on public.social_post_media
for each row execute function media_security.guard_owned_media();

create function media_security.guard_post_author()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'Publication author cannot be reassigned' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger social_post_immutable_author before update of author_id on public.posts
for each row execute function media_security.guard_post_author();

create function media_security.is_public_social_object(target_bucket text, target_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.social_post_media media join public.posts post on post.id = media.post_id
    where public.is_public_social_post(post.id)
      and media_security.object_belongs_to_author(target_bucket, target_name, post.author_id)
      and (
        (media.bucket_id = target_bucket and media_security.object_path(target_bucket, media.storage_path) = target_name)
        or (media_security.thumbnail_bucket(media.bucket_id,media.thumbnail_path) = target_bucket and media_security.object_path(target_bucket,media.thumbnail_path) = target_name)
      )
  ) or exists (
    -- Legacy publications may have URLs directly on posts, without media rows.
    select 1 from public.posts post
    where public.is_public_social_post(post.id)
      and media_security.object_belongs_to_author(target_bucket, target_name, post.author_id)
      and (media_security.object_path(target_bucket, post.video_url) = target_name
        or media_security.object_path(target_bucket, post.thumbnail_url) = target_name)
  );
$$;

-- Restrictive policy closes older permissive/ALL policies as well as the known
-- published-media policy. Owner and authorized moderation access stay intact.
create policy "Social media object ownership boundary" on storage.objects
as restrictive for select to anon, authenticated using (
  bucket_id not in ('provider-social-media','social-videos','social-thumbnails')
  or media_security.object_belongs_to_author(bucket_id, name, auth.uid())
  or public.has_admin_permission('content.manage')
  or public.has_admin_permission('reports.manage')
  or media_security.is_public_social_object(bucket_id, name)
);
drop policy if exists "authorized provider social media reads" on storage.objects;
drop policy if exists "public social media reads" on storage.objects;
create policy "authorized provider social media reads" on storage.objects for select to anon, authenticated using (
  bucket_id in ('provider-social-media','social-videos','social-thumbnails') and (
    media_security.object_belongs_to_author(bucket_id, name, auth.uid())
    or public.has_admin_permission('content.manage')
    or public.has_admin_permission('reports.manage')
    or media_security.is_public_social_object(bucket_id, name)
  )
);
revoke all on all functions in schema media_security from public;
grant execute on function media_security.object_belongs_to_author(text,text,uuid), media_security.is_public_social_object(text,text) to anon, authenticated;
commit;
