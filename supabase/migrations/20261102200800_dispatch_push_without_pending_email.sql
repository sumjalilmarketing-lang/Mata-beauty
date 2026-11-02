begin;
-- A push-only booking event must wake the worker even without queued email.
create or replace function public.dispatch_transactional_notifications() returns bigint language plpgsql security definer set search_path='' as $$
declare dispatch_secret text; request_time text; signature text;
begin
 select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='mata_notification_dispatch';
 if dispatch_secret is null then return null; end if;
 if not exists(select 1 from public.notification_deliveries where notification_id is not null and status in ('pending','sending','failed') and (last_attempt_at is null or last_attempt_at<now()-interval '2 minutes'))
 and not exists(select 1 from public.web_push_deliveries where status in ('pending','sending') and available_at<=now() and attempts<5) then return null; end if;
 request_time:=floor(extract(epoch from now()))::bigint::text;
 signature:=encode(extensions.hmac('mata-notifications:'||request_time,dispatch_secret,'sha256'),'hex');
 return net.http_get(url:='https://mata-beauty.com/api/cron/notifications',headers:=jsonb_build_object('x-mata-dispatch-time',request_time,'x-mata-dispatch-signature',signature),timeout_milliseconds:=55000);
end $$;
revoke all on function public.dispatch_transactional_notifications() from public,anon,authenticated;
grant execute on function public.dispatch_transactional_notifications() to service_role;
commit;
