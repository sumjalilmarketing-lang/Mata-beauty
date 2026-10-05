-- Restore the RPC used by current client instrumentation, without launch triggers or cron.
begin;
create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  session_hash text check (session_hash is null or char_length(session_hash) between 16 and 128),
  event_name text not null check (event_name in (
    'signup_started','signup_completed','provider_onboarding_started','provider_onboarding_completed','search',
    'category_viewed','provider_viewed','social_post_viewed','booking_started','booking_completed','booking_cancelled',
    'favorite_added','message_sent','social_post_published','video_to_booking_click','review_created'
  )),
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (pg_column_size(properties) <= 8192)
);

create index if not exists product_events_name_time_idx on public.product_events(event_name,occurred_at desc);
create index if not exists product_events_profile_time_idx on public.product_events(profile_id,occurred_at desc) where profile_id is not null;


alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;
grant select on public.product_events to authenticated;
grant all on public.product_events to service_role;
drop policy if exists "product events admin read" on public.product_events;
create policy "product events admin read" on public.product_events for select to authenticated using(public.is_super_admin());
create or replace function public.record_product_event(target_event_name text,target_properties jsonb default '{}'::jsonb,target_session_hash text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare created_id bigint;
begin
  if target_event_name not in ('signup_started','signup_completed','provider_onboarding_started','provider_onboarding_completed','search','category_viewed','provider_viewed','social_post_viewed','booking_started','booking_completed','booking_cancelled','favorite_added','message_sent','social_post_published','video_to_booking_click','review_created') then raise exception 'Événement invalide'; end if;
  if pg_column_size(coalesce(target_properties,'{}'::jsonb)) > 8192 then raise exception 'Propriétés trop volumineuses'; end if;
  if auth.uid() is null and (target_session_hash is null or char_length(target_session_hash) < 16) then raise exception 'Session anonyme invalide'; end if;
  if target_session_hash is not null and (select count(*) from public.product_events event where event.session_hash=target_session_hash and event.occurred_at>=now()-interval '1 hour') >= 300 then raise exception 'Limite analytique atteinte'; end if;
  insert into public.product_events(profile_id,session_hash,event_name,properties)
  values(auth.uid(),nullif(trim(target_session_hash),''),target_event_name,coalesce(target_properties,'{}'::jsonb)) returning id into created_id;
  return created_id;
end;
$$;


revoke all on function public.record_product_event(text,jsonb,text) from public;
grant execute on function public.record_product_event(text,jsonb,text) to anon,authenticated;
commit;
