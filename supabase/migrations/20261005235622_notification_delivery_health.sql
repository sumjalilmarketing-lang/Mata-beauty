-- Aggregate operations data without exposing anybody else's private inbox.
create function public.notification_delivery_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  return jsonb_build_object(
    'notifications24h',(select count(*) from public.notifications where created_at>=now()-interval '24 hours'),
    'pending',(select count(*) from public.notification_deliveries where notification_id is not null and status in ('pending','sending')),
    'sent',(select count(*) from public.notification_deliveries where notification_id is not null and status='sent'),
    'failed',(select count(*) from public.notification_deliveries where notification_id is not null and status='failed'),
    'needsReview',(select count(*) from public.notification_deliveries where notification_id is not null and status='needs_review'));
end; $$;
revoke all on function public.notification_delivery_health() from public,anon;
grant execute on function public.notification_delivery_health() to authenticated;

-- Hosted pg_net is owned by supabase_admin: postgres cannot revoke its PUBLIC
-- queue grants. Never put the reusable Vault credential in the HTTP queue.
-- A short-lived HMAC authenticates this fixed, idempotent worker operation.
create or replace function public.dispatch_transactional_notifications() returns bigint language plpgsql security definer set search_path='' as $$
declare dispatch_secret text; request_time text; signature text;
begin
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='mata_notification_dispatch';
  if dispatch_secret is null then return null; end if;
  if not exists(select 1 from public.notification_deliveries where notification_id is not null and status in ('pending','sending','failed') and (last_attempt_at is null or last_attempt_at<now()-interval '2 minutes')) then return null; end if;
  request_time:=floor(extract(epoch from now()))::bigint::text;
  signature:=encode(extensions.hmac('mata-notifications:'||request_time,dispatch_secret,'sha256'),'hex');
  return net.http_get(url:='https://mata-beauty.com/api/cron/notifications',headers:=jsonb_build_object('x-mata-dispatch-time',request_time,'x-mata-dispatch-signature',signature),timeout_milliseconds:=55000);
end; $$;
revoke all on function public.dispatch_transactional_notifications() from public,anon,authenticated;
grant execute on function public.dispatch_transactional_notifications() to service_role;
