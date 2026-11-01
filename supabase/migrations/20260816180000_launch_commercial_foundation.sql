begin;

alter table public.categories add column if not exists seo_title text;
alter table public.categories add column if not exists seo_description text;
alter table public.categories add column if not exists launch_group text;
alter table public.categories add column if not exists image_position text;

alter table public.provider_profiles add column if not exists founder_badge_enabled boolean not null default false;

alter table public.support_tickets add column if not exists is_launch_priority boolean not null default false;
alter table public.support_tickets add column if not exists launch_category text;
alter table public.support_tickets drop constraint if exists support_tickets_launch_category_check;
alter table public.support_tickets add constraint support_tickets_launch_category_check check (
  launch_category is null or launch_category in ('signup','profile','publication','booking','payment','bug','other')
);

alter table public.promotions add column if not exists campaign_kind text;
alter table public.promotions add column if not exists auto_apply boolean not null default false;
alter table public.promotions add column if not exists launch_configuration jsonb not null default '{}'::jsonb;
alter table public.promotions drop constraint if exists promotions_campaign_kind_check;
alter table public.promotions add constraint promotions_campaign_kind_check check (
  campaign_kind is null or campaign_kind in ('first_booking','new_client','new_provider','category','local')
);

create table if not exists public.launch_settings (
  singleton boolean primary key default true check (singleton),
  target_users integer not null default 100 check (target_users between 1 and 1000000),
  target_providers integer not null default 20 check (target_providers between 1 and 100000),
  founder_program_enabled boolean not null default true,
  founder_capacity integer not null default 20 check (founder_capacity between 1 and 1000),
  referral_rewards_enabled boolean not null default false,
  referral_reward_configuration jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.launch_settings(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.launch_provider_cohort (
  provider_id uuid primary key references public.provider_profiles(profile_id) on delete cascade,
  is_founder boolean not null default false,
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  mata_contact_id uuid references public.profiles(id) on delete set null,
  added_by uuid not null references public.profiles(id) on delete restrict,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.launch_feed_selection (
  post_id uuid primary key references public.posts(id) on delete cascade,
  label text not null default 'Sélection lancement' check (char_length(label) between 2 and 80),
  content_origin text not null default 'provider' check (content_origin in ('provider','editorial','demo')),
  disclosure text,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_active boolean not null default true,
  selected_by uuid not null references public.profiles(id) on delete restrict,
  selected_at timestamptz not null default now(),
  check (content_origin = 'provider' or char_length(trim(coalesce(disclosure,''))) >= 8)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null check (referral_code ~ '^[A-Z0-9]{6,24}$'),
  referrer_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('client','provider')),
  status text not null default 'created' check (status in ('created','opened','signed_up','qualified','cancelled')),
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  unique(referral_code, referred_user_id)
);

create or replace view public.launch_social_feed with(security_invoker=true) as
select feed.*,selection.sort_order as launch_sort,selection.label as launch_label,selection.content_origin,selection.disclosure
from public.social_feed feed
left join public.launch_feed_selection selection on selection.post_id=feed.id and selection.is_active;

grant select on public.launch_social_feed to anon,authenticated;

create unique index if not exists referrals_active_owner_type_idx on public.referrals(referrer_id,type) where referred_user_id is null and status in ('created','opened');

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

create or replace function public.capture_launch_product_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid; tracked_event text; event_properties jsonb := '{}'::jsonb;
begin
  if tg_table_name='profiles' and tg_op='INSERT' then actor:=new.id; tracked_event:='signup_completed';
  elsif tg_table_name='professional_onboarding' and tg_op='INSERT' then actor:=new.provider_id; tracked_event:='provider_onboarding_started';
  elsif tg_table_name='professional_onboarding' and tg_op='UPDATE' and new.status='verified' and old.status is distinct from new.status then actor:=new.provider_id; tracked_event:='provider_onboarding_completed';
  elsif tg_table_name='favorites' and tg_op='INSERT' then actor:=new.client_id; tracked_event:='favorite_added'; event_properties:=jsonb_build_object('provider_id',new.provider_id);
  elsif tg_table_name='messages' and tg_op='INSERT' then actor:=new.sender_id; tracked_event:='message_sent'; event_properties:=jsonb_build_object('conversation_id',new.conversation_id);
  elsif tg_table_name='reviews' and tg_op='INSERT' then actor:=new.client_id; tracked_event:='review_created'; event_properties:=jsonb_build_object('booking_id',new.booking_id,'provider_id',new.provider_id);
  elsif tg_table_name='posts' and new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status) then actor:=new.author_id; tracked_event:='social_post_published'; event_properties:=jsonb_build_object('post_id',new.id,'post_type',new.post_type);
  elsif tg_table_name='bookings' and tg_op='UPDATE' and new.status in ('cancelled_by_client','cancelled_by_provider') and old.status is distinct from new.status then actor:=coalesce(new.client_id,new.provider_id); tracked_event:='booking_cancelled'; event_properties:=jsonb_build_object('booking_id',new.id);
  else return new; end if;
  insert into public.product_events(profile_id,event_name,properties) values(actor,tracked_event,event_properties);
  if tg_table_name='profiles' and nullif(regexp_replace(coalesce(new.phone,''),'\\D','','g'),'') is not null
    and (select count(*) from public.profiles profile where regexp_replace(coalesce(profile.phone,''),'\\D','','g')=regexp_replace(new.phone,'\\D','','g')) > 1 then
    insert into public.fraud_alerts(alert_type,severity,profile_id,entity_type,entity_id,evidence)
    values('multiple_signup','high',new.id,'profiles',new.id,jsonb_build_object('signal','duplicate_normalized_phone'));
  end if;
  return new;
end;
$$;

create trigger launch_profile_created_event after insert on public.profiles for each row execute function public.capture_launch_product_event();
create trigger launch_onboarding_event after insert or update of status on public.professional_onboarding for each row execute function public.capture_launch_product_event();
create trigger launch_favorite_event after insert on public.favorites for each row execute function public.capture_launch_product_event();
create trigger launch_message_event after insert on public.messages for each row execute function public.capture_launch_product_event();
create trigger launch_review_event after insert on public.reviews for each row execute function public.capture_launch_product_event();
create trigger launch_post_published_event after insert or update of status on public.posts for each row execute function public.capture_launch_product_event();
create trigger launch_booking_cancelled_event after update of status on public.bookings for each row execute function public.capture_launch_product_event();

create table if not exists public.micro_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  context text not null check (context in ('booking','first_publication','first_appointment')),
  response text not null check (response in ('yes','no','positive','negative')),
  booking_id uuid references public.bookings(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique(profile_id,context,booking_id,post_id)
);
create unique index if not exists micro_feedback_booking_once_idx on public.micro_feedback(profile_id,context,booking_id) where booking_id is not null;
create unique index if not exists micro_feedback_first_publication_once_idx on public.micro_feedback(profile_id,context) where context='first_publication';

create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null check (alert_type in ('multiple_signup','spam','fake_provider','fake_booking','fake_review','abusive_upload','forbidden_content','like_manipulation')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  profile_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.legal_documents (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  status text not null default 'legal_review_required' check (status in ('legal_review_required','approved','published','archived')),
  summary text,
  content_markdown text,
  requires_legal_review boolean not null default true,
  published_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (requires_legal_review = false and content_markdown is not null and published_at is not null))
);

create or replace function public.detect_launch_abuse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid; alert_kind text; event_count integer; threshold integer; window_start timestamptz; target_entity uuid;
begin
  if tg_table_name='post_likes' then actor:=new.profile_id; target_entity:=new.post_id; alert_kind:='like_manipulation'; threshold:=60; window_start:=now()-interval '10 minutes'; select count(*) into event_count from public.post_likes where profile_id=actor and created_at>=window_start;
  elsif tg_table_name='posts' then actor:=new.author_id; target_entity:=new.id; alert_kind:='abusive_upload'; threshold:=20; window_start:=now()-interval '1 hour'; select count(*) into event_count from public.posts where author_id=actor and created_at>=window_start;
  elsif tg_table_name='bookings' then actor:=new.client_id; target_entity:=new.id; alert_kind:='fake_booking'; threshold:=10; window_start:=now()-interval '1 hour'; select count(*) into event_count from public.bookings where client_id=actor and created_at>=window_start;
  elsif tg_table_name='reviews' then actor:=new.client_id; target_entity:=new.id; alert_kind:='fake_review'; threshold:=5; window_start:=now()-interval '1 hour'; select count(*) into event_count from public.reviews where client_id=actor and created_at>=window_start;
  else return new; end if;
  if event_count>=threshold and not exists(select 1 from public.fraud_alerts alert where alert.profile_id=actor and alert.alert_type=alert_kind and alert.status in ('open','reviewing') and alert.created_at>=window_start) then
    insert into public.fraud_alerts(alert_type,severity,profile_id,entity_type,entity_id,evidence) values(alert_kind,case when event_count>=threshold*2 then 'critical' else 'high' end,actor,tg_table_name,target_entity,jsonb_build_object('count',event_count,'window_started_at',window_start));
  end if;
  return new;
end;
$$;

drop trigger if exists launch_post_abuse_alert on public.posts;
create trigger launch_post_abuse_alert after insert on public.posts for each row execute function public.detect_launch_abuse();
drop trigger if exists launch_like_abuse_alert on public.post_likes;
create trigger launch_like_abuse_alert after insert on public.post_likes for each row execute function public.detect_launch_abuse();
drop trigger if exists launch_booking_abuse_alert on public.bookings;
create trigger launch_booking_abuse_alert after insert on public.bookings for each row execute function public.detect_launch_abuse();
drop trigger if exists launch_review_abuse_alert on public.reviews;
create trigger launch_review_abuse_alert after insert on public.reviews for each row execute function public.detect_launch_abuse();

insert into public.legal_documents(slug,title,summary)
values
  ('conditions-generales','Conditions générales','Document à faire valider juridiquement avant publication.'),
  ('confidentialite','Politique de confidentialité','Document à faire valider juridiquement avant publication.'),
  ('cookies','Politique cookies','Document à faire valider juridiquement si les traceurs utilisés l’exigent.'),
  ('conditions-prestataires','Conditions prestataires','Document à faire valider juridiquement avant publication.'),
  ('annulation','Politique d’annulation','Document à faire valider juridiquement avant publication.'),
  ('regles-communautaires','Règles communautaires','Document à faire valider juridiquement avant publication.'),
  ('politique-contenus','Politique contenus','Document à faire valider juridiquement avant publication.'),
  ('signalement-moderation','Signalement et modération','Document à faire valider juridiquement avant publication.')
on conflict(slug) do nothing;

create table if not exists public.appointment_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  offset_hours smallint not null check (offset_hours in (24,2)),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(booking_id,offset_hours)
);

create or replace function public.compute_provider_launch_completeness(target_provider_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select least(100,
    case when nullif(trim(coalesce(profile.cover_url,'')),'') is not null or exists(select 1 from public.profiles p where p.id=profile.profile_id and p.avatar_url is not null) then 10 else 0 end +
    case when char_length(trim(coalesce(profile.bio,''))) >= 40 then 10 else 0 end +
    case when profile.verified_at is not null then 20 else 0 end +
    case when (select count(*) from public.provider_services service where service.provider_id=profile.profile_id and service.is_active) >= 3 then 20 else 0 end +
    case when (select count(*) from public.portfolio_items item where item.provider_id=profile.profile_id) >= 3 then 10 else 0 end +
    case when exists(select 1 from public.availability_rules availability where availability.provider_id=profile.profile_id) then 15 else 0 end +
    case when exists(select 1 from public.posts post where post.author_id=profile.profile_id and post.post_type='video' and post.status='published') then 15 else 0 end
  )::integer from public.provider_profiles profile where profile.profile_id=target_provider_id;
$$;

create or replace function public.get_provider_launch_checklist(target_provider_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if target_provider_id <> auth.uid() and not public.has_admin_permission('providers.read') then raise exception 'Accès interdit'; end if;
  select jsonb_build_object(
    'score',public.compute_provider_launch_completeness(profile.profile_id),
    'photo',profile.cover_url is not null or owner.avatar_url is not null,
    'description',char_length(trim(coalesce(profile.bio,''))) >= 40,
    'services',(select count(*) from public.provider_services service where service.provider_id=profile.profile_id and service.is_active),
    'prices',(select count(*) from public.provider_services service where service.provider_id=profile.profile_id and service.is_active and service.price_amount > 0),
    'availability',exists(select 1 from public.availability_rules availability where availability.provider_id=profile.profile_id),
    'portfolio',(select count(*) from public.portfolio_items item where item.provider_id=profile.profile_id),
    'video',exists(select 1 from public.posts post where post.author_id=profile.profile_id and post.post_type='video' and post.status='published'),
    'verified',profile.verified_at is not null,
    'ready',public.compute_provider_launch_completeness(profile.profile_id) >= 80 and profile.status='approved'
  ) into result
  from public.provider_profiles profile join public.profiles owner on owner.id=profile.profile_id where profile.profile_id=target_provider_id;
  return coalesce(result,'{}'::jsonb);
end;
$$;

create or replace function public.get_or_create_referral_code(target_type text)
returns text language plpgsql security definer set search_path = '' as $$
declare existing text; generated text;
begin
  if target_type not in ('client','provider') then raise exception 'Type invalide'; end if;
  select referral.referral_code into existing from public.referrals referral where referral.referrer_id=auth.uid() and referral.type=target_type and referral.referred_user_id is null and referral.status in ('created','opened') limit 1;
  if existing is not null then return existing; end if;
  generated := upper(substr(replace(auth.uid()::text,'-',''),1,8) || case when target_type='provider' then 'PRO' else 'AMI' end);
  insert into public.referrals(referral_code,referrer_id,type) values(generated,auth.uid(),target_type);
  return generated;
end;
$$;

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

create or replace function public.get_launch_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  select jsonb_build_object(
    'target_users',settings.target_users,'target_providers',settings.target_providers,
    'users',(select count(*) from public.profiles where account_status <> 'deleted'),
    'active_clients',(select count(distinct event.profile_id) from public.product_events event where event.occurred_at >= now()-interval '30 days' and event.profile_id is not null),
    'providers',(select count(*) from public.provider_profiles),
    'providers_approved',(select count(*) from public.provider_profiles where status='approved'),
    'complete_profiles',(select count(*) from public.provider_profiles profile where public.compute_provider_launch_completeness(profile.profile_id)>=80),
    'videos',(select count(*) from public.posts where post_type='video' and status='published'),
    'bookings',(select count(*) from public.bookings),
    'booking_conversion',coalesce(round(100.0*(select count(*) from public.product_events where event_name='booking_completed')/nullif((select count(*) from public.product_events where event_name='booking_started'),0),1),0),
    'onboarding_abandons',(select count(*) from public.professional_onboarding where status in ('draft','profile_incomplete') and updated_at < now()-interval '24 hours'),
    'reports',(select count(*) from public.reports where status='open'),
    'critical_alerts',(select count(*) from public.fraud_alerts where status in ('open','reviewing') and severity='critical'),
    'reminder_jobs_pending',(select count(*) from public.appointment_reminder_jobs where status='pending'),
    'top_categories',coalesce((select jsonb_agg(item) from (select event.properties->>'category' as label,count(*) as value from public.product_events event where event.event_name='category_viewed' and event.occurred_at>=now()-interval '30 days' and event.properties->>'category' is not null group by 1 order by 2 desc limit 5) item),'[]'::jsonb),
    'top_searches',coalesce((select jsonb_agg(item) from (select event.properties->>'query' as label,count(*) as value from public.product_events event where event.event_name='search' and event.occurred_at>=now()-interval '30 days' and nullif(event.properties->>'query','') is not null group by 1 order by 2 desc limit 5) item),'[]'::jsonb),
    'top_cities',coalesce((select jsonb_agg(item) from (select event.properties->>'area' as label,count(*) as value from public.product_events event where event.occurred_at>=now()-interval '30 days' and nullif(event.properties->>'area','') is not null group by 1 order by 2 desc limit 5) item),'[]'::jsonb)
  ) into result from public.launch_settings settings where settings.singleton;
  return result;
end;
$$;

create or replace function public.sync_founder_badge(target_provider_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare enabled boolean; eligible boolean;
begin
  if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
  select settings.founder_program_enabled and cohort.is_founder and profile.status='approved' and profile.verified_at is not null
    and public.compute_provider_launch_completeness(profile.profile_id)>=80
  into eligible from public.provider_profiles profile
  join public.launch_provider_cohort cohort on cohort.provider_id=profile.profile_id
  cross join public.launch_settings settings
  where profile.profile_id=target_provider_id and settings.singleton;
  enabled := coalesce(eligible,false);
  update public.provider_profiles set founder_badge_enabled=enabled where profile_id=target_provider_id;
  return enabled;
end;
$$;

create or replace function public.schedule_internal_booking_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('pending','confirmed') then
    insert into public.appointment_reminder_jobs(booking_id,offset_hours,due_at,status)
    select new.id,reminder.offset_hours,new.starts_at-(reminder.offset_hours || ' hours')::interval,'pending'
    from (values(24),(2)) as reminder(offset_hours)
    where new.starts_at-(reminder.offset_hours || ' hours')::interval > now()
    on conflict(booking_id,offset_hours) do update set due_at=excluded.due_at,status='pending',sent_at=null;
    update public.appointment_reminder_jobs set status='cancelled'
      where booking_id=new.id and status='pending' and due_at<=now();
  elsif new.status in ('declined','cancelled_by_client','cancelled_by_provider') then
    update public.appointment_reminder_jobs set status='cancelled' where booking_id=new.id and status='pending';
  end if;
  return new;
end;
$$;

create or replace function public.prioritize_launch_support_ticket()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.launch_provider_cohort cohort where cohort.provider_id=new.requester_id) then
    new.is_launch_priority := true;
    new.priority := case when new.priority='urgent' then 'urgent' else 'high' end;
  end if;
  return new;
end;
$$;

create or replace function public.process_internal_booking_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare job record; processed integer := 0; reminder_title text; reminder_body text;
begin
  for job in
    select reminder.id,reminder.booking_id,reminder.offset_hours,booking.client_id,booking.provider_id,booking.starts_at
    from public.appointment_reminder_jobs reminder join public.bookings booking on booking.id=reminder.booking_id
    where reminder.status='pending' and reminder.due_at<=now() and booking.starts_at>now() and booking.status in ('pending','confirmed')
    order by reminder.due_at for update of reminder skip locked limit 200
  loop
    reminder_title := case when job.offset_hours=24 then 'Rendez-vous demain' else 'Rendez-vous dans 2 heures' end;
    reminder_body := 'Votre rendez-vous Mata Beauty est prévu le ' || to_char(job.starts_at at time zone 'Africa/Dakar','DD/MM/YYYY à HH24:MI') || '.';
    insert into public.notifications(profile_id,kind,title,body,data) values
      (job.client_id,'appointment_reminder',reminder_title,reminder_body,jsonb_build_object('booking_id',job.booking_id,'offset_hours',job.offset_hours)),
      (job.provider_id,'appointment_reminder',reminder_title,reminder_body,jsonb_build_object('booking_id',job.booking_id,'offset_hours',job.offset_hours));
    update public.appointment_reminder_jobs set status='sent',sent_at=now() where id=job.id;
    processed := processed+1;
  end loop;
  return processed;
end;
$$;

drop trigger if exists support_launch_priority on public.support_tickets;
create trigger support_launch_priority before insert or update of requester_id on public.support_tickets for each row execute function public.prioritize_launch_support_ticket();

drop trigger if exists booking_internal_reminders on public.bookings;
create trigger booking_internal_reminders after insert or update of starts_at,status on public.bookings for each row execute function public.schedule_internal_booking_reminders();

create or replace view public.launch_provider_cohort_overview with(security_invoker=true) as
select cohort.provider_id,cohort.is_founder,cohort.internal_note,cohort.mata_contact_id,cohort.added_at,
  provider.business_name,provider.status,provider.verified_at,onboarding.status as onboarding_status,
  public.compute_provider_launch_completeness(provider.profile_id) as completeness,
  (select count(*) from public.provider_services service where service.provider_id=provider.profile_id and service.is_active) as services_count,
  (select count(*) from public.posts post where post.author_id=provider.profile_id and post.status='published') as published_content,
  (select min(booking.created_at) from public.bookings booking where booking.provider_id=provider.profile_id) as first_booking_at,
  (select max(event.occurred_at) from public.product_events event where event.profile_id=provider.profile_id) as last_activity_at
from public.launch_provider_cohort cohort
join public.provider_profiles provider on provider.profile_id=cohort.provider_id
left join public.professional_onboarding onboarding on onboarding.provider_id=cohort.provider_id;

grant select on public.launch_provider_cohort_overview to authenticated;

create extension if not exists pg_cron with schema extensions;
select cron.schedule('mata-process-internal-booking-reminders','*/5 * * * *','select public.process_internal_booking_reminders()');

update public.categories set
  image_url='/images/categories/mata-category-atlas.webp',
  seo_title=name || ' à Dakar | Mata Beauty',
  seo_description=coalesce(description,'Découvrez les prestations et professionnels disponibles sur Mata Beauty.'),
  launch_group=case
    when slug in ('coiffure-femme','tresses-africaines','perruques-lace-wigs','maquillage','onglerie','cils-sourcils','barbier','coiffure-homme','soins-visage','beaute-domicile') then 'launch'
    else coalesce(launch_group,'extended') end,
  image_position=case slug
    when 'coiffure-femme' then '0% 0%' when 'tresses-africaines' then '25% 0%' when 'perruques-lace-wigs' then '50% 0%'
    when 'maquillage' then '75% 0%' when 'onglerie' then '100% 0%' when 'cils-sourcils' then '0% 100%'
    when 'barbier' then '25% 100%' when 'coiffure-homme' then '50% 100%' when 'soins-visage' then '75% 100%'
    when 'beaute-domicile' then '100% 100%' else coalesce(image_position,'center') end
where is_active;

update public.categories set name='Tresses',description='Tresses, braids, vanilles et styles protecteurs.',seo_title='Tresses à Dakar | Mata Beauty' where slug='tresses-africaines';
update public.categories set name='Make-up',seo_title='Make-up à Dakar | Mata Beauty' where slug='maquillage';
update public.categories set name='Cils & sourcils',seo_title='Cils et sourcils à Dakar | Mata Beauty' where slug='cils-sourcils';
update public.categories set name='Soins visage',seo_title='Soins visage à Dakar | Mata Beauty' where slug='soins-visage';

alter table public.launch_settings enable row level security;
alter table public.launch_provider_cohort enable row level security;
alter table public.launch_feed_selection enable row level security;
alter table public.referrals enable row level security;
alter table public.product_events enable row level security;
alter table public.micro_feedback enable row level security;
alter table public.fraud_alerts enable row level security;
alter table public.legal_documents enable row level security;
alter table public.appointment_reminder_jobs enable row level security;

create policy "launch settings super admin read" on public.launch_settings for select using(public.is_super_admin());
create policy "launch settings super admin write" on public.launch_settings for all using(public.is_super_admin()) with check(public.is_super_admin());
create policy "launch cohort super admin manage" on public.launch_provider_cohort for all using(public.is_super_admin()) with check(public.is_super_admin());
create policy "launch cohort provider read own" on public.launch_provider_cohort for select using(provider_id=auth.uid());
create policy "launch feed public read" on public.launch_feed_selection for select using(is_active and exists(select 1 from public.posts post where post.id=post_id and post.status='published'));
create policy "launch feed content manage" on public.launch_feed_selection for all using(public.has_admin_permission('content.manage')) with check(public.has_admin_permission('content.manage'));
create policy "referrals owner read" on public.referrals for select using(referrer_id=auth.uid() or referred_user_id=auth.uid());
create policy "product events own insert" on public.product_events for insert with check(profile_id=auth.uid() or (profile_id is null and auth.uid() is null));
create policy "product events admin read" on public.product_events for select using(public.is_super_admin());
create policy "micro feedback owner manage" on public.micro_feedback for all using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create policy "micro feedback admin read" on public.micro_feedback for select using(public.is_super_admin());
create policy "fraud alerts admin manage" on public.fraud_alerts for all using(public.has_admin_permission('reports.manage')) with check(public.has_admin_permission('reports.manage'));
create policy "legal published read" on public.legal_documents for select using(status='published' or public.has_admin_permission('content.manage'));
create policy "legal content manage" on public.legal_documents for all using(public.has_admin_permission('content.manage')) with check(public.has_admin_permission('content.manage'));
create policy "reminders members read" on public.appointment_reminder_jobs for select using(exists(select 1 from public.bookings booking where booking.id=booking_id and (booking.client_id=auth.uid() or booking.provider_id=auth.uid() or public.has_admin_permission('bookings.read'))));

revoke all on function public.compute_provider_launch_completeness(uuid) from public,anon;
grant execute on function public.compute_provider_launch_completeness(uuid) to authenticated;
revoke all on function public.get_provider_launch_checklist(uuid) from public,anon;
grant execute on function public.get_provider_launch_checklist(uuid) to authenticated;
revoke all on function public.get_or_create_referral_code(text) from public,anon;
grant execute on function public.get_or_create_referral_code(text) to authenticated;
revoke all on function public.record_product_event(text,jsonb,text) from public;
grant execute on function public.record_product_event(text,jsonb,text) to anon,authenticated;
revoke all on function public.get_launch_dashboard() from public,anon,authenticated;
grant execute on function public.get_launch_dashboard() to authenticated;
revoke all on function public.sync_founder_badge(uuid) from public,anon,authenticated;
grant execute on function public.sync_founder_badge(uuid) to authenticated;
revoke all on function public.process_internal_booking_reminders() from public,anon,authenticated;
revoke all on function public.detect_launch_abuse() from public,anon,authenticated;
revoke all on function public.capture_launch_product_event() from public,anon,authenticated;

commit;
