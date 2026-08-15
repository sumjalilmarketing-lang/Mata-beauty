-- Workflow Studio vidéo : médias structurés, validation Storage et actions propriétaire.

alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check(status in ('draft','processing','scheduled','published','hidden','rejected','archived','deleted'));

drop policy if exists "authors manage own posts" on public.posts;
create policy "authors manage own posts" on public.posts for all
using(author_id=auth.uid() or public.is_admin())
with check(
  public.is_admin() or (
    author_id=auth.uid()
    and (
      position('/storage/v1/object/public/social-videos/' in video_url)>0
      or position('/storage/v1/object/public/provider-social-media/' in video_url)>0
    )
    and (status not in ('published','scheduled') or exists(
      select 1 from public.provider_profiles provider where provider.profile_id=auth.uid() and provider.status='approved'
    ))
    and (status<>'published' or client_consent_confirmed)
    and (status<>'scheduled' or scheduled_for>now())
  )
);

create or replace function public.guard_social_post_publication()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status in ('published','scheduled') and not exists(
    select 1 from public.provider_profiles where profile_id=new.author_id and status='approved'
  ) then raise exception 'Profil professionnel non approuvé'; end if;
  if new.status='published' and not new.client_consent_confirmed then raise exception 'Le consentement client est obligatoire'; end if;
  if position('/storage/v1/object/public/social-videos/' in new.video_url)=0
    and position('/storage/v1/object/public/provider-social-media/' in new.video_url)=0
  then raise exception 'URL vidéo invalide'; end if;
  return new;
end; $$;

create or replace function public.create_provider_video_post(
  target_post_id uuid,
  target_title text,
  target_caption text,
  target_video_path text,
  target_video_url text,
  target_thumbnail_path text,
  target_thumbnail_url text,
  target_duration_seconds numeric,
  target_aspect_ratio numeric,
  target_provider_service_id uuid,
  target_status text,
  target_allow_comments boolean,
  target_client_consent boolean,
  target_scheduled_for timestamptz default null,
  target_visibility text default 'public',
  target_hashtags text[] default '{}',
  target_location text default null,
  target_available_at timestamptz default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare provider_status text; video_metadata jsonb; thumbnail_metadata jsonb; tag text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_post_id is null or target_video_path !~ ('^'||auth.uid()::text||'/'||target_post_id::text||'/video[.](mp4|mov|webm)$') then raise exception 'Chemin vidéo invalide'; end if;
  if target_thumbnail_path !~ ('^'||auth.uid()::text||'/'||target_post_id::text||'/thumbnail[.](jpg|jpeg|png|webp)$') then raise exception 'Chemin miniature invalide'; end if;
  if position('/storage/v1/object/public/provider-social-media/'||target_video_path in target_video_url)=0
    or position('/storage/v1/object/public/provider-social-media/'||target_thumbnail_path in target_thumbnail_url)=0 then raise exception 'URL média invalide'; end if;
  select status into provider_status from public.provider_profiles where profile_id=auth.uid();
  if provider_status is null then raise exception 'Compte professionnel requis'; end if;
  if target_status not in ('draft','scheduled','published') or target_visibility not in ('public','followers') then raise exception 'Publication invalide'; end if;
  if target_status in ('published','scheduled') and provider_status<>'approved' then raise exception 'Profil professionnel non approuvé'; end if;
  if target_status in ('published','scheduled') and target_provider_service_id is null then raise exception 'Une prestation est obligatoire'; end if;
  if target_status='published' and not target_client_consent then raise exception 'Le consentement client est obligatoire'; end if;
  if target_status='scheduled' and (target_scheduled_for is null or target_scheduled_for<=now()) then raise exception 'Date de programmation invalide'; end if;
  if target_duration_seconds not between 1 and 90 or target_aspect_ratio not between 0.4 and 1.8 then raise exception 'Métadonnées vidéo invalides'; end if;
  if target_provider_service_id is not null and not exists(select 1 from public.provider_services where id=target_provider_service_id and provider_id=auth.uid() and is_active) then raise exception 'Prestation invalide'; end if;

  select metadata into video_metadata from storage.objects where bucket_id='provider-social-media' and name=target_video_path and owner_id=auth.uid()::text;
  select metadata into thumbnail_metadata from storage.objects where bucket_id='provider-social-media' and name=target_thumbnail_path and owner_id=auth.uid()::text;
  if video_metadata is null or coalesce(video_metadata->>'mimetype','') not in ('video/mp4','video/webm','video/quicktime')
    or coalesce((video_metadata->>'size')::bigint,0)>104857600 then raise exception 'Fichier vidéo Storage invalide'; end if;
  if thumbnail_metadata is null or coalesce(thumbnail_metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp')
    or coalesce((thumbnail_metadata->>'size')::bigint,0)>5242880 then raise exception 'Miniature Storage invalide'; end if;

  insert into public.posts(id,author_id,post_type,title,caption,status,visibility,video_url,thumbnail_url,duration_seconds,aspect_ratio,allow_comments,client_consent_confirmed,scheduled_for,published_at,location_label,available_at)
  values(target_post_id,auth.uid(),'video',nullif(trim(target_title),''),trim(target_caption),target_status,target_visibility,target_video_url,target_thumbnail_url,target_duration_seconds,target_aspect_ratio,target_allow_comments,target_client_consent,target_scheduled_for,case when target_status='published' then now() end,nullif(trim(target_location),''),target_available_at);
  insert into public.social_post_media(post_id,media_type,bucket_id,storage_path,public_url,thumbnail_path,duration_seconds,sort_order)
  values(target_post_id,'video','provider-social-media',target_video_path,target_video_url,target_thumbnail_path,target_duration_seconds,0);
  if target_provider_service_id is not null then insert into public.post_services(post_id,provider_service_id,is_primary) values(target_post_id,target_provider_service_id,true); end if;
  foreach tag in array target_hashtags loop
    tag:=lower(regexp_replace(trim(tag),'^#|[^a-zA-Z0-9_]','','g'));
    if char_length(tag) between 2 and 50 then
      insert into public.hashtags(name) values(tag) on conflict(name) do nothing;
      insert into public.post_hashtags(post_id,hashtag_id) select target_post_id,id from public.hashtags where name=tag on conflict do nothing;
    end if;
  end loop;
  return target_post_id;
end; $$;

create or replace function public.manage_own_social_post(target_post_id uuid,target_action text)
returns text language plpgsql security definer set search_path='' as $$
declare previous public.posts; next_status text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into previous from public.posts where id=target_post_id and author_id=auth.uid() for update;
  if previous.id is null then raise exception 'Publication introuvable'; end if;
  if target_action not in ('hide','archive','delete','republish') then raise exception 'Action invalide'; end if;
  next_status:=case target_action when 'hide' then 'hidden' when 'archive' then 'archived' when 'delete' then 'deleted'
    when 'republish' then case when previous.client_consent_confirmed and exists(select 1 from public.post_services where post_id=previous.id and is_primary) then 'published' else 'draft' end end;
  update public.posts set status=next_status,deleted_at=case when next_status='deleted' then now() else null end,
    published_at=case when next_status='published' then coalesce(published_at,now()) else published_at end,updated_at=now() where id=target_post_id;
  return next_status;
end; $$;

revoke all on function public.create_provider_video_post(uuid,text,text,text,text,text,text,numeric,numeric,uuid,text,boolean,boolean,timestamptz,text,text[],text,timestamptz) from public,anon;
revoke all on function public.manage_own_social_post(uuid,text) from public,anon;
grant execute on function public.create_provider_video_post(uuid,text,text,text,text,text,text,numeric,numeric,uuid,text,boolean,boolean,timestamptz,text,text[],text,timestamptz) to authenticated;
grant execute on function public.manage_own_social_post(uuid,text) to authenticated;
