begin;
-- Metrics use verified UID quotas; anonymous telemetry goes through trusted ingress.
create schema if not exists analytics_private;
revoke all on schema analytics_private from public,anon,authenticated;
create function analytics_private.allow_social_metric() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  return public.consume_financial_rate_limit('social_metric_uid',md5(auth.uid()::text),300,3600);
 end if;
 if current_setting('role',true)='service_role' then return true; end if;
 raise exception 'Authentication required' using errcode='42501';
end $$;
revoke all on function analytics_private.allow_social_metric() from public,anon,authenticated;
create or replace function public.record_post_share(target_post_id uuid, target_session_hash text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare result_count bigint;
begin
  if target_session_hash is null or target_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
  if not analytics_private.allow_social_metric() then return null; end if;
  if char_length(target_session_hash) <> 64 then
    raise exception 'Partage invalide';
  end if;

  insert into public.post_shares(post_id, profile_id, session_hash)
  select target_post_id, auth.uid(), target_session_hash
  from public.posts
  where id = target_post_id and status = 'published' and visibility = 'public'
  on conflict do nothing;

  if found then
    perform set_config('mata.counter_update', 'on', true);
    update public.posts set share_count = share_count + 1 where id = target_post_id;
  end if;

  select share_count into result_count from public.posts where id = target_post_id and status='published' and visibility='public';

  return result_count;
end;
$$;
revoke all on function public.record_post_share(uuid,text) from public,anon,authenticated;
grant execute on function public.record_post_share(uuid,text) to authenticated,service_role;
create or replace function public.record_video_view(target_post_id uuid, target_session_hash text, target_watched_ms integer, target_completed boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_session_hash is null or target_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
  if not analytics_private.allow_social_metric() then return; end if;
  if char_length(target_session_hash) <> 64 or target_watched_ms < 0 then raise exception 'Vue invalide'; end if;
  insert into public.video_views(post_id, viewer_id, session_hash, watched_ms, completed)
  select target_post_id, auth.uid(), target_session_hash, target_watched_ms, target_completed
  from public.posts where id = target_post_id and status = 'published' and visibility = 'public'
  on conflict (post_id, session_hash, view_day) do update
    set watched_ms = greatest(public.video_views.watched_ms, excluded.watched_ms),
        completed = public.video_views.completed or excluded.completed;
end; $$;
revoke all on function public.record_video_view(uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_video_view(uuid,text,integer,boolean) to authenticated,service_role;
create or replace function public.record_post_booking_click(target_post_id uuid, target_session_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_session_hash is null or target_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
  if not analytics_private.allow_social_metric() then return; end if;
  if char_length(target_session_hash) <> 64 then raise exception 'Clic invalide'; end if;
  insert into public.post_booking_clicks(post_id, profile_id, session_hash)
  select target_post_id, auth.uid(), target_session_hash from public.posts
  where id = target_post_id and status = 'published' and visibility = 'public'
  on conflict do nothing;
end; $$;
revoke all on function public.record_post_booking_click(uuid,text) from public,anon,authenticated;
grant execute on function public.record_post_booking_click(uuid,text) to authenticated,service_role;
create or replace function public.record_social_profile_visit(target_provider_id uuid, target_post_id uuid, target_session_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_session_hash is null or target_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
  if not analytics_private.allow_social_metric() then return; end if;
  if char_length(target_session_hash) <> 64 then raise exception 'Visite invalide'; end if;
  insert into public.social_profile_visits(provider_id,source_post_id,visitor_id,session_hash)
  select target_provider_id,target_post_id,auth.uid(),target_session_hash
  from public.posts p
  where p.id=target_post_id and p.author_id=target_provider_id and p.status='published' and p.visibility='public'
  on conflict do nothing;
end; $$;
revoke all on function public.record_social_profile_visit(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_social_profile_visit(uuid,uuid,text) to authenticated,service_role;

create function public.record_anonymous_social_metric(target_kind text,target_ip_hash text,target_session_hash text,target_post_id uuid,target_provider_id uuid default null,target_watched_ms integer default 0,target_completed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result_data bigint;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service required' using errcode='42501'; end if;
 if target_kind not in ('record_video_view','record_post_share','record_post_booking_click','record_social_profile_visit') or target_kind is null
 or target_ip_hash is null or target_ip_hash !~ '^[a-f0-9]{64}$' or target_session_hash is null or target_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid metric'; end if;
 if not public.consume_financial_rate_limit('social_metric_anon_global','global',10000,3600) then return jsonb_build_object('accepted',false); end if;
 if not public.consume_financial_rate_limit('social_metric_anon_ip',target_ip_hash,300,3600) then return jsonb_build_object('accepted',false); end if;
 case target_kind
 when 'record_video_view' then perform public.record_video_view(target_post_id,target_session_hash,target_watched_ms,target_completed);
 when 'record_post_share' then result_data:=public.record_post_share(target_post_id,target_session_hash);
 when 'record_post_booking_click' then perform public.record_post_booking_click(target_post_id,target_session_hash);
 when 'record_social_profile_visit' then perform public.record_social_profile_visit(target_provider_id,target_post_id,target_session_hash);
 end case;
 return jsonb_build_object('accepted',true,'data',result_data);
end $$;
revoke all on function public.record_anonymous_social_metric(text,text,text,uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_anonymous_social_metric(text,text,text,uuid,uuid,integer,boolean) to service_role;

-- A referenced document is evidence; corrections always use a new object and review.
create function media_security.freeze_provider_document() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' and old.bucket_id='provider-documents' and exists(select 1 from public.provider_documents where storage_path=old.name) then
  raise exception 'Referenced document is immutable' using errcode='42501';
 end if;
 if tg_op<>'DELETE' and new.bucket_id='provider-documents' and exists(select 1 from public.provider_documents where storage_path=new.name) then
  raise exception 'Referenced document is immutable' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function media_security.freeze_provider_document() from public,anon,authenticated;
create trigger freeze_referenced_document before insert or update or delete on storage.objects for each row execute function media_security.freeze_provider_document();
create function media_security.lock_provider_document_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.storage_path is distinct from old.storage_path or new.provider_id is distinct from old.provider_id) then
  raise exception 'Submit a new document for review' using errcode='42501';
 end if;
 -- Serializes registration with Storage UPDATE/DELETE; no lock for status-only reviews.
 if tg_op='INSERT' then
  perform 1 from storage.objects where bucket_id='provider-documents' and name=new.storage_path for share;
  if not found then raise exception 'Document object missing' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function media_security.lock_provider_document_source() from public,anon,authenticated;
create trigger lock_document_source before insert or update on public.provider_documents for each row execute function media_security.lock_provider_document_source();
drop policy if exists "provider documents owner delete" on public.provider_documents;
create policy "retain document review evidence" on public.provider_documents as restrictive for delete to authenticated using(false);

-- Only the submission flag is shared with an authorized colleague; sealed content stays sealed.
create function public.booking_review_submission_state(target_booking_id uuid,target_type text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or target_type not in ('client_to_provider','provider_to_client') or target_type is null
 or not booking_private.can_review_booking(target_booking_id,target_type) then raise exception 'Booking access denied' using errcode='42501'; end if;
 return exists(select 1 from public.booking_reviews where booking_id=target_booking_id and type=target_type);
end $$;
revoke all on function public.booking_review_submission_state(uuid,text) from public,anon;
grant execute on function public.booking_review_submission_state(uuid,text) to authenticated;
commit;
