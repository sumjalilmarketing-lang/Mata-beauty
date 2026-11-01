-- A report on a comment must not suppress its parent video.
create or replace function public.social_post_not_strongly_reported(target_post_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) < 3 from public.reports
  where post_id=target_post_id and comment_id is null and status in ('open','reviewing');
$$;
