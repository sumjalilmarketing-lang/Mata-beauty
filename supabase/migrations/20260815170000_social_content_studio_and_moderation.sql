-- Studio social multiformat et modération administrative auditée.

alter table public.posts add column if not exists post_type text not null default 'video';
alter table public.posts add column if not exists title text;
alter table public.posts add column if not exists location_label text;
alter table public.posts add column if not exists available_at timestamptz;
alter table public.posts add column if not exists promotion_discount_percent numeric(5,2);
alter table public.posts add column if not exists promotion_ends_at timestamptz;
alter table public.posts add column if not exists promotion_slots integer;
alter table public.posts add column if not exists deleted_at timestamptz;

alter table public.posts drop constraint if exists posts_post_type_check;
alter table public.posts add constraint posts_post_type_check
  check (post_type in ('video','photo','before_after','promotion','availability'));
alter table public.posts drop constraint if exists posts_promotion_discount_check;
alter table public.posts add constraint posts_promotion_discount_check
  check (promotion_discount_percent is null or promotion_discount_percent between 1 and 90);
alter table public.posts drop constraint if exists posts_promotion_slots_check;
alter table public.posts add constraint posts_promotion_slots_check
  check (promotion_slots is null or promotion_slots between 1 and 10000);

create table if not exists public.social_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_type text not null check (media_type in ('video','image','before','after')),
  bucket_id text not null check (bucket_id in ('social-videos','social-thumbnails','provider-social-media')),
  storage_path text not null,
  public_url text not null check (public_url ~ '^https://'),
  thumbnail_path text,
  width integer check (width is null or width between 1 and 12000),
  height integer check (height is null or height between 1 and 12000),
  duration_seconds numeric(6,2) check (duration_seconds is null or duration_seconds between 1 and 90),
  sort_order integer not null default 0 check (sort_order between 0 and 20),
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

create table if not exists public.social_post_features (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  feature_type text not null check (feature_type in ('trending','recommended','sponsored','mata_selection')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  position integer check (position is null or position between 1 and 1000),
  audience jsonb not null default '{"type":"all"}'::jsonb,
  geographic_zone text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists social_post_media_post_idx on public.social_post_media(post_id, sort_order);
create index if not exists social_post_features_active_idx on public.social_post_features(starts_at, ends_at, feature_type);
create index if not exists posts_type_feed_idx on public.posts(post_type, status, published_at desc);

insert into public.social_post_media(post_id,media_type,bucket_id,storage_path,public_url,thumbnail_path,duration_seconds,sort_order)
select p.id,'video','social-videos',p.video_url,p.video_url,p.thumbnail_url,p.duration_seconds,0
from public.posts p
where not exists (select 1 from public.social_post_media media where media.post_id=p.id);

alter table public.social_post_media enable row level security;
alter table public.social_post_features enable row level security;

create policy "social media published or owner read" on public.social_post_media for select using (
  exists(select 1 from public.posts p where p.id=post_id and (p.author_id=auth.uid() or p.status='published' or public.is_admin()))
);
create policy "social media owner manage" on public.social_post_media for all using (
  exists(select 1 from public.posts p where p.id=post_id and (p.author_id=auth.uid() or public.is_admin()))
) with check (
  exists(select 1 from public.posts p where p.id=post_id and (p.author_id=auth.uid() or public.is_admin()))
);
create policy "active social features public read" on public.social_post_features for select using (
  (starts_at<=now() and ends_at>now()) or public.has_admin_permission('content.manage')
);
create policy "social features admin manage" on public.social_post_features for all using (
  public.has_admin_permission('content.manage')
) with check (public.has_admin_permission('content.manage'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('provider-social-media','provider-social-media',true,104857600,
  array['video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp'])
on conflict(id) do update set
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "public provider social media reads" on storage.objects for select
  using(bucket_id='provider-social-media');
create policy "providers upload own social media" on storage.objects for insert
  with check(bucket_id='provider-social-media' and (storage.foldername(name))[1]=auth.uid()::text
    and exists(select 1 from public.provider_profiles where profile_id=auth.uid()));
create policy "providers update own social media" on storage.objects for update
  using(bucket_id='provider-social-media' and owner_id=auth.uid()::text)
  with check(bucket_id='provider-social-media' and owner_id=auth.uid()::text);
create policy "providers delete own social media" on storage.objects for delete
  using(bucket_id='provider-social-media' and owner_id=auth.uid()::text);

create or replace function public.report_social_post(target_post_id uuid, target_reason text, target_details text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_reason not in ('contenu_inapproprie','spam','fausse_prestation','escroquerie','contenu_vole','harcelement','faux_resultat','autre')
    then raise exception 'Motif de signalement invalide'; end if;
  if not exists(select 1 from public.posts where id=target_post_id and status='published') then raise exception 'Publication introuvable'; end if;
  select id into result_id from public.reports where reporter_id=auth.uid() and post_id=target_post_id and status in ('open','reviewing') limit 1;
  if result_id is null then
    insert into public.reports(reporter_id,post_id,reported_profile_id,reason,details)
    select auth.uid(),p.id,p.author_id,target_reason,nullif(trim(target_details),'') from public.posts p where p.id=target_post_id
    returning id into result_id;
  end if;
  return result_id;
end; $$;

create or replace function public.create_social_media_post(
  target_post_type text,
  target_title text,
  target_caption text,
  target_media_urls text[],
  target_provider_service_id uuid,
  target_status text,
  target_allow_comments boolean,
  target_client_consent boolean,
  target_scheduled_for timestamptz default null,
  target_visibility text default 'public',
  target_hashtags text[] default '{}',
  target_location text default null,
  target_available_at timestamptz default null,
  target_discount numeric default null,
  target_promotion_ends_at timestamptz default null,
  target_promotion_slots integer default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid; provider_status text; media_url text; media_index integer:=0; tag text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_post_type not in ('photo','before_after','promotion','availability') then raise exception 'Format invalide'; end if;
  if target_status not in ('draft','scheduled','published') or target_visibility not in ('public','followers') then raise exception 'Publication invalide'; end if;
  if coalesce(array_length(target_media_urls,1),0) not between 1 and 10 then raise exception 'Un à dix médias sont requis'; end if;
  if target_post_type='before_after' and array_length(target_media_urls,1)<>2 then raise exception 'Deux images sont requises pour un avant/après'; end if;
  select status into provider_status from public.provider_profiles where profile_id=auth.uid();
  if provider_status is null then raise exception 'Compte professionnel requis'; end if;
  if target_status in ('published','scheduled') and provider_status<>'approved' then raise exception 'Profil professionnel non approuvé'; end if;
  if target_status in ('published','scheduled') and target_provider_service_id is null then raise exception 'Une prestation est obligatoire'; end if;
  if target_status='published' and not target_client_consent then raise exception 'Le consentement client est obligatoire'; end if;
  if target_status='scheduled' and (target_scheduled_for is null or target_scheduled_for<=now()) then raise exception 'Date invalide'; end if;
  if target_provider_service_id is not null and not exists(select 1 from public.provider_services where id=target_provider_service_id and provider_id=auth.uid() and is_active) then raise exception 'Prestation invalide'; end if;
  foreach media_url in array target_media_urls loop
    if position('/storage/v1/object/public/provider-social-media/'||auth.uid()::text||'/' in media_url)=0 then raise exception 'URL média invalide'; end if;
  end loop;
  insert into public.posts(author_id,post_type,title,caption,status,visibility,video_url,thumbnail_url,duration_seconds,aspect_ratio,allow_comments,client_consent_confirmed,scheduled_for,published_at,location_label,available_at,promotion_discount_percent,promotion_ends_at,promotion_slots)
  values(auth.uid(),target_post_type,nullif(trim(target_title),''),trim(target_caption),target_status,target_visibility,target_media_urls[1],target_media_urls[1],1,0.8,target_allow_comments,target_client_consent,target_scheduled_for,case when target_status='published' then now() end,nullif(trim(target_location),''),target_available_at,target_discount,target_promotion_ends_at,target_promotion_slots)
  returning id into result_id;
  foreach media_url in array target_media_urls loop
    insert into public.social_post_media(post_id,media_type,bucket_id,storage_path,public_url,sort_order)
    values(result_id,case when target_post_type='before_after' and media_index=0 then 'before' when target_post_type='before_after' then 'after' else 'image' end,
      'provider-social-media',split_part(media_url,'/provider-social-media/',2),media_url,media_index);
    media_index:=media_index+1;
  end loop;
  if target_provider_service_id is not null then insert into public.post_services(post_id,provider_service_id,is_primary) values(result_id,target_provider_service_id,true); end if;
  foreach tag in array target_hashtags loop
    tag:=lower(regexp_replace(trim(tag),'^#|[^a-zA-Z0-9_]','','g'));
    if char_length(tag) between 2 and 50 then
      insert into public.hashtags(name) values(tag) on conflict(name) do nothing;
      insert into public.post_hashtags(post_id,hashtag_id) select result_id,id from public.hashtags where name=tag on conflict do nothing;
    end if;
  end loop;
  return result_id;
end; $$;

create or replace view public.social_feed with(security_invoker=true) as
select p.id,p.author_id,p.caption,p.video_url,p.thumbnail_url,p.duration_seconds,p.aspect_ratio,p.allow_comments,p.is_sponsored,
  p.view_count,p.like_count,p.comment_count,p.save_count,p.share_count,p.published_at,
  pp.business_name,pp.slug,pp.city,pp.average_rating,pp.review_count,pp.verified_at,pp.cover_url,pr.avatar_url,
  ps.provider_service_id,svc.title as service_title,svc.duration_minutes,svc.price_amount,svc.currency,
  greatest(0,extract(epoch from (now()-p.published_at))/3600) as age_hours,
  coalesce((select array_agg(h.name order by h.name) from public.post_hashtags ph join public.hashtags h on h.id=ph.hashtag_id where ph.post_id=p.id),'{}') as hashtags,
  p.post_type,p.title,p.location_label,p.available_at,p.promotion_discount_percent,p.promotion_ends_at,p.promotion_slots,
  coalesce((select array_agg(media.public_url order by media.sort_order) from public.social_post_media media where media.post_id=p.id),array[p.video_url]) as media_urls,
  (select feature.feature_type from public.social_post_features feature where feature.post_id=p.id and feature.starts_at<=now() and feature.ends_at>now() order by feature.position nulls last,feature.created_at desc limit 1) as feature_type
from public.posts p
join public.provider_profiles pp on pp.profile_id=p.author_id and pp.status='approved'
join public.profiles pr on pr.id=p.author_id and not pr.is_suspended
join public.post_services ps on ps.post_id=p.id and ps.is_primary
join public.provider_services svc on svc.id=ps.provider_service_id and svc.is_active
where p.status='published' and p.visibility='public' and public.social_post_not_strongly_reported(p.id);

create or replace function public.admin_moderate_social_post(target_post_id uuid, decision text, reason text)
returns text language plpgsql security definer set search_path='' as $$
declare previous public.posts; next_status text;
begin
  if not (public.has_admin_permission('content.manage') or public.has_admin_permission('reports.manage')) then
    raise exception 'Permission de modération requise';
  end if;
  if char_length(trim(coalesce(reason,'')))<2 then raise exception 'Une justification est requise'; end if;
  if decision not in ('approve','hide','remove','restore','warn') then raise exception 'Décision invalide'; end if;
  select * into previous from public.posts where id=target_post_id for update;
  if previous.id is null then raise exception 'Publication introuvable'; end if;
  next_status := case decision
    when 'approve' then 'published'
    when 'hide' then 'hidden'
    when 'remove' then 'deleted'
    when 'restore' then case when previous.client_consent_confirmed and exists(select 1 from public.post_services ps where ps.post_id=previous.id and ps.is_primary) then 'published' else 'draft' end
    else previous.status end;
  update public.posts set status=next_status,
    published_at=case when next_status='published' then coalesce(published_at,now()) else published_at end,
    deleted_at=case when next_status='deleted' then now() else null end,
    updated_at=now()
  where id=target_post_id;
  insert into public.moderation_actions(actor_id,target_type,target_id,action,reason,previous_state,new_state)
  values(auth.uid(),'social_post',target_post_id,decision,trim(reason),
    jsonb_build_object('status',previous.status),jsonb_build_object('status',next_status));
  update public.reports set status='resolved',resolved_at=now(),assigned_to=auth.uid()
    where post_id=target_post_id and status in ('open','reviewing');
  insert into public.notifications(profile_id,kind,title,body,data)
  values(previous.author_id,'social_moderation','Décision de modération',
    case decision when 'warn' then 'Votre publication a reçu un avertissement.' else 'Le statut de votre publication a été mis à jour.' end,
    jsonb_build_object('post_id',target_post_id,'decision',decision));
  perform public.write_admin_audit('social.post.'||decision,'posts',target_post_id,
    jsonb_build_object('status',previous.status),jsonb_build_object('status',next_status),reason);
  return next_status;
end; $$;

create or replace function public.admin_feature_social_post(
  target_post_id uuid, target_feature_type text, target_starts_at timestamptz,
  target_ends_at timestamptz, target_position integer, target_audience jsonb,
  target_geographic_zone text, reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
  if not public.has_admin_permission('content.manage') then raise exception 'Permission content.manage requise'; end if;
  if target_feature_type not in ('trending','recommended','sponsored','mata_selection') then raise exception 'Mise en avant invalide'; end if;
  if target_starts_at is null or target_ends_at<=target_starts_at then raise exception 'Période invalide'; end if;
  if char_length(trim(coalesce(reason,'')))<2 then raise exception 'Une justification est requise'; end if;
  if not exists(select 1 from public.posts where id=target_post_id and status='published') then raise exception 'Publication publiée requise'; end if;
  insert into public.social_post_features(post_id,feature_type,starts_at,ends_at,position,audience,geographic_zone,created_by)
  values(target_post_id,target_feature_type,target_starts_at,target_ends_at,target_position,coalesce(target_audience,'{"type":"all"}'::jsonb),nullif(trim(target_geographic_zone),''),auth.uid())
  returning id into result_id;
  if target_feature_type='sponsored' then
    perform set_config('mata.counter_update','on',true);
    update public.posts set is_sponsored=true,updated_at=now() where id=target_post_id;
  end if;
  perform public.write_admin_audit('social.post.featured','posts',target_post_id,'{}'::jsonb,
    jsonb_build_object('feature_id',result_id,'feature_type',target_feature_type,'starts_at',target_starts_at,'ends_at',target_ends_at),reason);
  return result_id;
end; $$;

create or replace function public.get_social_admin_dashboard()
returns jsonb language sql stable security definer set search_path='' as $$
  select case when public.has_admin_permission('content.manage') or public.has_admin_permission('reports.manage') then jsonb_build_object(
    'posts_today',(select count(*) from public.posts where created_at>=current_date),
    'published',(select count(*) from public.posts where status='published'),
    'pending',(select count(*) from public.posts where status in ('draft','scheduled')),
    'reported',(select count(distinct post_id) from public.reports where post_id is not null and status in ('open','reviewing')),
    'views',(select coalesce(sum(view_count),0) from public.posts),
    'likes',(select coalesce(sum(like_count),0) from public.posts),
    'comments',(select coalesce(sum(comment_count),0) from public.posts),
    'shares',(select coalesce(sum(share_count),0) from public.posts),
    'booking_clicks',(select count(*) from public.post_booking_clicks),
    'bookings',(select count(*) from public.bookings where source_post_id is not null),
    'gross_amount',(select coalesce(sum(total_amount),0) from public.bookings where source_post_id is not null and status not in ('declined','cancelled_by_client','cancelled_by_provider'))
  ) else '{}'::jsonb end;
$$;

revoke all on function public.admin_moderate_social_post(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_feature_social_post(uuid,text,timestamptz,timestamptz,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.get_social_admin_dashboard() from public,anon,authenticated;
grant execute on function public.admin_moderate_social_post(uuid,text,text) to authenticated;
grant execute on function public.admin_feature_social_post(uuid,text,timestamptz,timestamptz,integer,jsonb,text,text) to authenticated;
grant execute on function public.get_social_admin_dashboard() to authenticated;
revoke all on function public.create_social_media_post(text,text,text,text[],uuid,text,boolean,boolean,timestamptz,text,text[],text,timestamptz,numeric,timestamptz,integer) from public,anon;
grant execute on function public.create_social_media_post(text,text,text,text[],uuid,text,boolean,boolean,timestamptz,text,text[],text,timestamptz,numeric,timestamptz,integer) to authenticated;
grant select on public.social_post_media,public.social_post_features to anon,authenticated;
