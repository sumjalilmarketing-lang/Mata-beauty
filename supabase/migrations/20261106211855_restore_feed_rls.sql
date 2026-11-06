-- Feed reads must obey the caller's table policies, including service
-- publication state. Keep this explicit when the view is replaced in future.
alter view public.social_feed set (security_invoker = true);
revoke insert, update, delete, truncate, references, trigger
  on public.social_feed from anon, authenticated;
grant select on public.social_feed to anon, authenticated;
