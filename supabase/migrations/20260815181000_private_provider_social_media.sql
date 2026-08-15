-- Le bucket Studio devient privé. Les URLs signées sont autorisées uniquement par les RLS Storage.

update storage.buckets set public=false where id='provider-social-media';

drop policy if exists "public provider social media reads" on storage.objects;
drop policy if exists "authorized provider social media reads" on storage.objects;
create policy "authorized provider social media reads" on storage.objects for select using(
  bucket_id='provider-social-media' and (
    owner_id=auth.uid()::text
    or exists(
      select 1 from public.social_post_media media
      join public.posts post on post.id=media.post_id
      where media.bucket_id='provider-social-media'
        and (media.storage_path=name or media.thumbnail_path=name)
        and post.status='published' and post.visibility='public'
    )
    or public.is_admin()
  )
);

create or replace view public.social_feed with(security_invoker=true) as
select p.id,p.author_id,p.caption,p.video_url,p.thumbnail_url,p.duration_seconds,p.aspect_ratio,p.allow_comments,p.is_sponsored,
  p.view_count,p.like_count,p.comment_count,p.save_count,p.share_count,p.published_at,
  pp.business_name,pp.slug,pp.city,pp.average_rating,pp.review_count,pp.verified_at,pp.cover_url,pr.avatar_url,
  ps.provider_service_id,svc.title as service_title,svc.duration_minutes,svc.price_amount,svc.currency,
  greatest(0,extract(epoch from (now()-p.published_at))/3600) as age_hours,
  coalesce((select array_agg(h.name order by h.name) from public.post_hashtags ph join public.hashtags h on h.id=ph.hashtag_id where ph.post_id=p.id),'{}') as hashtags,
  p.post_type,p.title,p.location_label,p.available_at,p.promotion_discount_percent,p.promotion_ends_at,p.promotion_slots,
  coalesce((select array_agg(media.public_url order by media.sort_order) from public.social_post_media media where media.post_id=p.id),array[p.video_url]) as media_urls,
  (select feature.feature_type from public.social_post_features feature where feature.post_id=p.id and feature.starts_at<=now() and feature.ends_at>now() order by feature.position nulls last,feature.created_at desc limit 1) as feature_type,
  coalesce((select jsonb_agg(jsonb_build_object('media_type',media.media_type,'bucket_id',media.bucket_id,'storage_path',media.storage_path,'thumbnail_path',media.thumbnail_path) order by media.sort_order) from public.social_post_media media where media.post_id=p.id),'[]'::jsonb) as media_items
from public.posts p
join public.provider_profiles pp on pp.profile_id=p.author_id and pp.status='approved'
join public.profiles pr on pr.id=p.author_id and not pr.is_suspended
join public.post_services ps on ps.post_id=p.id and ps.is_primary
join public.provider_services svc on svc.id=ps.provider_service_id and svc.is_active
where p.status='published' and p.visibility='public' and public.social_post_not_strongly_reported(p.id);

grant select on public.social_feed to anon,authenticated;
