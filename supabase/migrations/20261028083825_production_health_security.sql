begin;

-- New privileged functions must be opt-in. PostgreSQL otherwise grants
-- EXECUTE to PUBLIC, which exposes SECURITY DEFINER functions through RPC.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- These helpers are authenticated-only application internals. Public feed
-- and availability RPCs intentionally remain callable by anon.
revoke execute on function public.get_admin_context() from public, anon;
grant execute on function public.get_admin_context() to authenticated, service_role;

revoke execute on function public.has_business_commercial_permission(uuid,text) from public, anon;
grant execute on function public.has_business_commercial_permission(uuid,text) to authenticated, service_role;

revoke execute on function public.has_conversation_access(uuid) from public, anon;
grant execute on function public.has_conversation_access(uuid) to authenticated, service_role;

-- Index the predicates used by the highest-frequency messaging RLS checks.
create index if not exists conversation_members_profile_conversation_idx
  on public.conversation_members(profile_id,conversation_id);
create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id,created_at desc,id desc);
create index if not exists notifications_profile_unread_idx
  on public.notifications(profile_id,created_at desc)
  where read_at is null;

notify pgrst,'reload schema';
commit;
