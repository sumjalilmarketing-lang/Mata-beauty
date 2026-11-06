-- Read-only security regression against the deployed schema. No fixtures or
-- account changes are needed; failures abort and the transaction is rolled back.
begin;
do $$
begin
  if not exists (select 1 from pg_class where oid='public.social_feed'::regclass and reloptions @> array['security_invoker=true']) then
    raise exception 'Feed must obey caller RLS';
  end if;
  if has_table_privilege('anon','public.social_feed','INSERT') or has_table_privilege('authenticated','public.social_feed','UPDATE') then
    raise exception 'Feed is a read-only public projection';
  end if;
  if has_function_privilege('anon','public.current_collaborator_access()','EXECUTE') then
    raise exception 'Staff membership RPC must remain private';
  end if;
end $$;
set local role anon;
do $$
begin
  if exists (select 1 from public.social_feed feed join public.provider_services svc on svc.id=feed.provider_service_id where svc.status<>'published' or not svc.is_active or svc.archived_at is not null) then
    raise exception 'Feed exposed an unpublished or archived service';
  end if;
end $$;
select 'PASS: invoker RLS, read-only feed, private staff access' as result, count(*) as visible_public_posts from public.social_feed;
rollback;
