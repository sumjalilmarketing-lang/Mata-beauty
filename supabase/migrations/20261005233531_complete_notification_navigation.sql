-- Only enrich existing in-app destinations; no historical e-mails are queued.
update public.notifications n set data=n.data||jsonb_build_object('href',(case when b.provider_id=n.profile_id then '/pro' else '/app' end)||'/bookings#booking-'||b.id::text)
from public.bookings b where n.data->>'booking_id'=b.id::text and not(n.data ? 'href');
update public.notifications n set data=n.data||jsonb_build_object('href',(case when b.provider_id=n.profile_id then '/pro' else '/app' end)||'/messages?booking='||b.id::text)
from public.conversations c join public.bookings b on b.id=c.booking_id
where n.kind='message_created' and n.data->>'conversation_id'=c.id::text and not(n.data ? 'href');
update public.notifications set data=data||jsonb_build_object('href','/pro/videos') where kind='social_moderation';
create function public.prepare_moderation_notification_destination() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.kind='social_moderation' then new.data:=new.data||jsonb_build_object('href','/pro/videos'); end if;
  return new;
end; $$;
create trigger notification_destination_moderation before insert on public.notifications for each row execute function public.prepare_moderation_notification_destination();
revoke all on function public.prepare_moderation_notification_destination() from public,anon,authenticated;
