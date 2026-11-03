-- Compatibility prerequisite for delegated teams on installations where the
-- historical visibility helper was not deployed. Existing definitions and
-- Storage policies remain unchanged. Apply before delegated_department_teams
-- on that installation; on Test/fresh installs this is a no-op.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $compat$
begin
 if to_regprocedure('public.is_public_social_post(uuid)') is null then
  execute $definition$
create function public.is_public_social_post(target_post_id uuid)
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
$definition$;
  revoke all on function public.is_public_social_post(uuid) from public,anon;
  grant execute on function public.is_public_social_post(uuid) to authenticated,service_role;
 end if;
end;
$compat$;
commit;
