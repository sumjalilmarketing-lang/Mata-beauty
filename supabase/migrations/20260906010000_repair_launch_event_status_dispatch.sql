-- Shared trigger conditions must not resolve fields absent from the triggering table.
-- PostgreSQL resolves record fields before boolean short-circuit evaluation.
begin;

create or replace function public.capture_launch_product_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  tracked_event text;
  event_properties jsonb := '{}'::jsonb;
  normalized_phone text;
begin
  if tg_table_name = 'profiles' and tg_op = 'INSERT' then
    actor := new.id;
    tracked_event := 'signup_completed';
  elsif tg_table_name = 'professional_onboarding' and tg_op = 'INSERT' then
    actor := new.provider_id;
    tracked_event := 'provider_onboarding_started';
  elsif tg_table_name = 'professional_onboarding' and tg_op = 'UPDATE' and (to_jsonb(new)->>'status') = 'verified' and (to_jsonb(old)->>'status') is distinct from (to_jsonb(new)->>'status') then
    actor := new.provider_id;
    tracked_event := 'provider_onboarding_completed';
  elsif tg_table_name = 'favorites' and tg_op = 'INSERT' then
    actor := new.client_id;
    tracked_event := 'favorite_added';
    event_properties := jsonb_build_object('provider_id', new.provider_id);
  elsif tg_table_name = 'messages' and tg_op = 'INSERT' then
    actor := new.sender_id;
    tracked_event := 'message_sent';
    event_properties := jsonb_build_object('conversation_id', new.conversation_id);
  elsif tg_table_name = 'reviews' and tg_op = 'INSERT' then
    actor := new.client_id;
    tracked_event := 'review_created';
    event_properties := jsonb_build_object('booking_id', new.booking_id, 'provider_id', new.provider_id);
  elsif tg_table_name = 'posts' and (to_jsonb(new)->>'status') = 'published' and (tg_op = 'INSERT' or (to_jsonb(old)->>'status') is distinct from (to_jsonb(new)->>'status')) then
    actor := new.author_id;
    tracked_event := 'social_post_published';
    event_properties := jsonb_build_object('post_id', new.id, 'post_type', new.post_type);
  elsif tg_table_name = 'bookings' and tg_op = 'UPDATE' and (to_jsonb(new)->>'status') in ('cancelled_by_client', 'cancelled_by_provider') and (to_jsonb(old)->>'status') is distinct from (to_jsonb(new)->>'status') then
    actor := coalesce(new.client_id, new.provider_id);
    tracked_event := 'booking_cancelled';
    event_properties := jsonb_build_object('booking_id', new.id);
  else
    return new;
  end if;

  insert into public.product_events(profile_id, event_name, properties)
  values(actor, tracked_event, event_properties);

  if tg_table_name = 'profiles' then
    normalized_phone := nullif(regexp_replace(coalesce(to_jsonb(new)->>'phone', ''), '\D', '', 'g'), '');
    if normalized_phone is not null and (
      select count(*)
      from public.profiles profile
      where regexp_replace(coalesce(profile.phone, ''), '\D', '', 'g') = normalized_phone
    ) > 1 then
      insert into public.fraud_alerts(alert_type, severity, profile_id, entity_type, entity_id, evidence)
      values('multiple_signup', 'high', new.id, 'profiles', new.id, jsonb_build_object('signal', 'duplicate_normalized_phone'));
    end if;
  end if;
  return new;
end;
$$;

commit;

