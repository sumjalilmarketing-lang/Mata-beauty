-- Optional analytics: trusted server ingress for anonymous events, atomic UID quota otherwise.
begin;
create or replace function public.record_product_event(target_event_name text,target_properties jsonb default '{}'::jsonb,target_session_hash text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare created_id bigint; actor uuid := auth.uid();
begin
  if target_event_name not in ('signup_started','signup_completed','provider_onboarding_started','provider_onboarding_completed','search','category_viewed','provider_viewed','social_post_viewed','booking_started','booking_completed','booking_cancelled','favorite_added','message_sent','social_post_published','video_to_booking_click','review_created') then raise exception 'Événement invalide'; end if;
  if target_session_hash is not null and char_length(trim(target_session_hash)) not between 16 and 128 then raise exception 'Session invalide'; end if;
  if pg_column_size(coalesce(target_properties,'{}'::jsonb)) > 8192 then raise exception 'Propriétés trop volumineuses'; end if;
  if actor is null then raise exception 'Authentification requise' using errcode='42501'; end if;
  -- The shared counter uses INSERT ON CONFLICT: concurrent calls serialize per UID.
  -- Return NULL on denial, so the counter transaction is committed (RAISE rolls it back).
  if not public.consume_financial_rate_limit('product_event_uid',md5(actor::text),300,3600) then return null; end if;
  insert into public.product_events(profile_id,session_hash,event_name,properties)
  values(actor,nullif(trim(target_session_hash),''),target_event_name,coalesce(target_properties,'{}'::jsonb)) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.record_product_event(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_product_event(text,jsonb,text) to authenticated;
create or replace function public.record_anonymous_product_event(target_ip_hash text,target_event_name text,target_properties jsonb default '{}'::jsonb,target_session_hash text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare created_id bigint;
begin
  if target_event_name not in ('signup_started','signup_completed','provider_onboarding_started','provider_onboarding_completed','search','category_viewed','provider_viewed','social_post_viewed','booking_started','booking_completed','booking_cancelled','favorite_added','message_sent','social_post_published','video_to_booking_click','review_created') then raise exception 'Événement invalide'; end if;
  if pg_column_size(coalesce(target_properties,'{}'::jsonb)) > 8192 then raise exception 'Propriétés trop volumineuses'; end if;
  if target_session_hash is null or char_length(trim(target_session_hash)) not between 16 and 128 then raise exception 'Session anonyme invalide'; end if;
  if target_ip_hash is null or target_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'Origine anonyme invalide'; end if;
  -- A global ceiling bounds both stored events and the number of attacker-created IP keys.
  if not public.consume_financial_rate_limit('product_event_anon_global','global',10000,3600) then return null; end if;
  if not public.consume_financial_rate_limit('product_event_anon_ip',target_ip_hash,300,3600) then return null; end if;
  insert into public.product_events(profile_id,session_hash,event_name,properties)
  values(null,nullif(trim(target_session_hash),''),target_event_name,coalesce(target_properties,'{}'::jsonb)) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.record_anonymous_product_event(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_anonymous_product_event(text,text,jsonb,text) to service_role;
commit;
