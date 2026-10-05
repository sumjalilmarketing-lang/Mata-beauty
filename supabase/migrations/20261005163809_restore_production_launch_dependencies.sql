-- Restore only the two API dependencies observed missing in production.
-- No new tables, triggers, cron jobs or changes to existing category data.
begin;
alter table public.categories add column if not exists image_position text;

create or replace function public.compute_provider_launch_completeness(target_provider_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select least(100,
    case when nullif(trim(coalesce(profile.cover_url,'')),'') is not null or exists(select 1 from public.profiles p where p.id=profile.profile_id and p.avatar_url is not null) then 10 else 0 end +
    case when char_length(trim(coalesce(profile.bio,''))) >= 40 then 10 else 0 end +
    case when profile.verified_at is not null then 20 else 0 end +
    case when (select count(*) from public.provider_services service where service.provider_id=profile.profile_id and service.is_active) >= 3 then 20 else 0 end +
    case when (select count(*) from public.portfolio_items item where item.provider_id=profile.profile_id) >= 3 then 10 else 0 end +
    case when exists(select 1 from public.availability_rules availability where availability.provider_id=profile.profile_id) then 15 else 0 end +
    case when exists(select 1 from public.posts post where post.author_id=profile.profile_id and post.post_type='video' and post.status='published') then 15 else 0 end
  )::integer from public.provider_profiles profile where profile.profile_id=target_provider_id;
$$;

create or replace function public.get_provider_launch_checklist(target_provider_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if target_provider_id <> auth.uid() and not public.has_admin_permission('providers.read') then raise exception 'Accès interdit'; end if;
  select jsonb_build_object(
    'score',public.compute_provider_launch_completeness(profile.profile_id),
    'photo',profile.cover_url is not null or owner.avatar_url is not null,
    'description',char_length(trim(coalesce(profile.bio,''))) >= 40,
    'services',(select count(*) from public.provider_services service where service.provider_id=profile.profile_id and service.is_active),
    'prices',(select count(*) from public.provider_services service where service.provider_id=profile.profile_id and service.is_active and service.price_amount > 0),
    'availability',exists(select 1 from public.availability_rules availability where availability.provider_id=profile.profile_id),
    'portfolio',(select count(*) from public.portfolio_items item where item.provider_id=profile.profile_id),
    'video',exists(select 1 from public.posts post where post.author_id=profile.profile_id and post.post_type='video' and post.status='published'),
    'verified',profile.verified_at is not null,
    'ready',public.compute_provider_launch_completeness(profile.profile_id) >= 80 and profile.status='approved'
  ) into result
  from public.provider_profiles profile join public.profiles owner on owner.id=profile.profile_id where profile.profile_id=target_provider_id;
  return coalesce(result,'{}'::jsonb);
end;
$$;


revoke all on function public.compute_provider_launch_completeness(uuid) from public,anon;
grant execute on function public.compute_provider_launch_completeness(uuid) to authenticated;
revoke all on function public.get_provider_launch_checklist(uuid) from public,anon;
grant execute on function public.get_provider_launch_checklist(uuid) to authenticated;
commit;
