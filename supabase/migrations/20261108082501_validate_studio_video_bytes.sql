-- New video references require a server attestation of the actual Storage bytes.
-- Existing publications are not rewritten. Service-only APIs never trust client metadata.
begin;
set local lock_timeout = '5s';
-- Close the snapshot-to-trigger gap against concurrent publication and moves.
lock table public.posts,public.social_post_media,storage.objects in share row exclusive mode;
create schema if not exists media_security;
create table media_security.validated_uploads (
  object_id uuid primary key,
  bucket_id text not null,
  storage_path text not null,
  owner_id uuid not null,
  object_updated_at timestamptz not null,
  byte_size bigint not null check(byte_size > 0 and byte_size <= 104857600),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  media_type text not null check(media_type in ('video','thumbnail')),
  duration_seconds numeric,
  aspect_ratio numeric,
  validated_at timestamptz not null default now(),
  unique(bucket_id,storage_path),
  check(media_type <> 'video' or (duration_seconds is not null and aspect_ratio is not null and duration_seconds > 0 and duration_seconds < 'Infinity'::numeric and aspect_ratio > 0 and aspect_ratio < 'Infinity'::numeric))
);
alter table media_security.validated_uploads enable row level security;
revoke all on media_security.validated_uploads from public,anon,authenticated;

-- Existing video paths are reserved too: deleting/recreating an older upload
-- must not bypass validation while its publication continues to reference it.
create table media_security.legacy_video_paths(bucket_id text not null,storage_path text not null,primary key(bucket_id,storage_path));
alter table media_security.legacy_video_paths enable row level security;
revoke all on media_security.legacy_video_paths from public,anon,authenticated;
insert into media_security.legacy_video_paths(bucket_id,storage_path)
select distinct bucket_id,storage_path from (
 select media.bucket_id,media_security.object_path(media.bucket_id,media.storage_path) as storage_path
 from public.social_post_media media where media.media_type='video'
 union all
 select case when media.bucket_id='social-videos' then 'social-thumbnails' else media.bucket_id end,
 media_security.object_path(case when media.bucket_id='social-videos' then 'social-thumbnails' else media.bucket_id end,media.thumbnail_path)
 from public.social_post_media media where media.media_type='video'
 union all
 select bucket.id,media_security.object_path(bucket.id,post.video_url)
 from public.posts post cross join (values('provider-social-media'),('social-videos')) bucket(id) where post.post_type='video'
 union all
 select bucket.id,media_security.object_path(bucket.id,post.thumbnail_url)
 from public.posts post cross join (values('provider-social-media'),('social-thumbnails')) bucket(id) where post.post_type='video'
) paths where bucket_id in ('provider-social-media','social-videos','social-thumbnails') and storage_path is not null
on conflict do nothing;

create function public.get_studio_upload_snapshot(target_owner uuid,target_path text)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'updated_at',o.updated_at,'size',o.metadata->>'size')
 from storage.objects o where o.bucket_id='provider-social-media' and o.name=target_path
 and o.owner_id=target_owner::text and split_part(o.name,'/',1)=target_owner::text;
$$;

create function public.attest_studio_upload(target_owner uuid,target_path text,target_object_id uuid,
 target_updated_at timestamptz,target_size bigint,target_sha256 text,target_media_type text,
 target_duration numeric default null,target_aspect_ratio numeric default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare obj storage.objects;
begin
 select * into obj from storage.objects where id=target_object_id and bucket_id='provider-social-media'
 and name=target_path and owner_id=target_owner::text for update;
 if obj.id is null or split_part(target_path,'/',1)<>target_owner::text
 or obj.updated_at is distinct from target_updated_at or (obj.metadata->>'size')::bigint is distinct from target_size then
   raise exception 'Upload changed during validation' using errcode='42501';
 end if;
 insert into media_security.validated_uploads(object_id,bucket_id,storage_path,owner_id,object_updated_at,byte_size,sha256,media_type,duration_seconds,aspect_ratio)
 values(obj.id,obj.bucket_id,obj.name,target_owner,obj.updated_at,target_size,target_sha256,target_media_type,target_duration,target_aspect_ratio)
 on conflict(bucket_id,storage_path) do update set object_id=excluded.object_id,owner_id=excluded.owner_id,
 object_updated_at=excluded.object_updated_at,byte_size=excluded.byte_size,sha256=excluded.sha256,
 media_type=excluded.media_type,duration_seconds=excluded.duration_seconds,aspect_ratio=excluded.aspect_ratio,validated_at=now();
 return true;
end; $$;
revoke all on function public.get_studio_upload_snapshot(uuid,text),public.attest_studio_upload(uuid,text,uuid,timestamptz,bigint,text,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.get_studio_upload_snapshot(uuid,text),public.attest_studio_upload(uuid,text,uuid,timestamptz,bigint,text,text,numeric,numeric) to service_role;

create function media_security.require_validated_upload(target_bucket text,target_path text,target_owner uuid,target_kind text)
returns media_security.validated_uploads language plpgsql security definer set search_path='' as $$
declare proof media_security.validated_uploads;
begin
 select v.* into proof from media_security.validated_uploads v join storage.objects o on o.id=v.object_id
 and o.bucket_id=v.bucket_id and o.name=v.storage_path and o.updated_at=v.object_updated_at
 and o.owner_id=v.owner_id::text and (o.metadata->>'size')::bigint=v.byte_size
 where v.bucket_id=target_bucket and v.storage_path=target_path and v.owner_id=target_owner and v.media_type=target_kind
 for share of o;
 if proof.object_id is null then raise exception 'Server media validation required' using errcode='42501'; end if;
 return proof;
end; $$;

create function media_security.guard_validated_post_video()
returns trigger language plpgsql security definer set search_path='' as $$
declare proof media_security.validated_uploads; bucket text;
begin
 if new.post_type <> 'video' then return new; end if;
 -- Existing references keep their history; changing the reference needs new proof.
 if tg_op='UPDATE' then
   if old.post_type='video' and new.video_url is not distinct from old.video_url and new.thumbnail_url is not distinct from old.thumbnail_url then return new; end if;
 end if;
 bucket:=case when position('/social-videos/' in new.video_url)>0 then 'social-videos' else 'provider-social-media' end;
 proof:=media_security.require_validated_upload(bucket,media_security.object_path(bucket,new.video_url),new.author_id,'video');
 perform media_security.require_validated_upload(case when bucket='social-videos' then 'social-thumbnails' else bucket end,
 media_security.object_path(case when bucket='social-videos' then 'social-thumbnails' else bucket end,new.thumbnail_url),new.author_id,'thumbnail');
 new.duration_seconds:=proof.duration_seconds;
 new.aspect_ratio:=proof.aspect_ratio;
 return new;
end; $$;
create trigger social_post_validated_video before insert or update of post_type,video_url,thumbnail_url on public.posts
for each row execute function media_security.guard_validated_post_video();

create function media_security.guard_validated_video_media()
returns trigger language plpgsql security definer set search_path='' as $$
declare author uuid; proof media_security.validated_uploads;
begin
 if new.media_type <> 'video' then return new; end if;
 if tg_op='UPDATE' then
   if old.media_type='video' and new.storage_path is not distinct from old.storage_path and new.bucket_id is not distinct from old.bucket_id
   and new.thumbnail_path is not distinct from old.thumbnail_path then return new; end if;
 end if;
 select author_id into author from public.posts where id=new.post_id;
 proof:=media_security.require_validated_upload(new.bucket_id,new.storage_path,author,'video');
 perform media_security.require_validated_upload(case when new.bucket_id='social-videos' then 'social-thumbnails' else new.bucket_id end,new.thumbnail_path,author,'thumbnail');
 new.duration_seconds:=proof.duration_seconds;
 return new;
end; $$;
create trigger social_media_validated_video before insert or update on public.social_post_media
for each row execute function media_security.guard_validated_video_media();

create function media_security.freeze_validated_upload()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from media_security.validated_uploads where object_id in (old.id,new.id) or (bucket_id=new.bucket_id and storage_path=new.name))
 or exists(select 1 from media_security.legacy_video_paths where (bucket_id=old.bucket_id and storage_path=old.name) or (bucket_id=new.bucket_id and storage_path=new.name)) then
 raise exception 'Validated media cannot be overwritten; upload a new object' using errcode='42501'; end if;
 return new;
end; $$;
create function media_security.block_validated_path_reuse()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from media_security.validated_uploads where bucket_id=new.bucket_id and storage_path=new.name)
 or exists(select 1 from media_security.legacy_video_paths where bucket_id=new.bucket_id and storage_path=new.name) then
 raise exception 'Validated media paths cannot be reused' using errcode='42501'; end if;
 return new;
end; $$;
create trigger no_validated_path_reuse before insert on storage.objects for each row execute function media_security.block_validated_path_reuse();
create trigger immutable_validated_media before update on storage.objects for each row execute function media_security.freeze_validated_upload();
revoke all on function media_security.require_validated_upload(text,text,uuid,text),media_security.guard_validated_post_video(),media_security.guard_validated_video_media(),media_security.freeze_validated_upload(),media_security.block_validated_path_reuse() from public,anon,authenticated;
commit;
