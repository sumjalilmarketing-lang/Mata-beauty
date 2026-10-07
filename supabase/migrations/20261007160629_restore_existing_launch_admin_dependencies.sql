-- Restore dependencies already used by LaunchAdmin; preserve newer security guards.
alter table public.provider_profiles add column if not exists founder_badge_enabled boolean not null default false;
alter table public.promotions add column if not exists campaign_kind text;
alter table public.promotions add column if not exists auto_apply boolean not null default false;
alter table public.promotions add column if not exists launch_configuration jsonb not null default '{}'::jsonb;

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

create table if not exists public.launch_provider_cohort (
  provider_id uuid primary key references public.provider_profiles(profile_id) on delete cascade,
  is_founder boolean not null default false,
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  mata_contact_id uuid references public.profiles(id) on delete set null,
  added_by uuid not null references public.profiles(id) on delete restrict,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

insert into public.launch_settings(singleton) values(true) on conflict(singleton) do nothing;

create or replace function public.get_launch_provider_cohort()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_super_admin() then raise exception 'Accès Super Admin requis'; end if;
 return coalesce((select jsonb_agg(to_jsonb(row) order by row.added_at) from (
  select cohort.provider_id,cohort.is_founder,cohort.internal_note,cohort.mata_contact_id,cohort.added_at,
   provider.business_name,provider.status,provider.verified_at,onboarding.status as onboarding_status,
   public.compute_provider_launch_completeness(provider.profile_id) as completeness,
   (select count(*) from public.provider_services service where service.provider_id=provider.profile_id and service.is_active) as services_count,
   (select count(*) from public.posts post where post.author_id=provider.profile_id and post.status='published') as published_content,
   (select min(booking.created_at) from public.bookings booking where booking.provider_id=provider.profile_id) as first_booking_at,
   (select max(event.occurred_at) from public.product_events event where event.profile_id=provider.profile_id) as last_activity_at
  from public.launch_provider_cohort cohort join public.provider_profiles provider on provider.profile_id=cohort.provider_id
  left join public.professional_onboarding onboarding on onboarding.provider_id=cohort.provider_id
 ) row),'[]'::jsonb);
end;
$$;

create or replace function public.protect_founder_badge()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if coalesce(auth.jwt()->>'role','')='service_role' then return new; end if;
 if ((tg_op='INSERT' and new.founder_badge_enabled) or (tg_op='UPDATE' and new.founder_badge_enabled is distinct from old.founder_badge_enabled)) and not public.is_super_admin() then raise exception 'Badge fondateur réservé au Super Admin'; end if;
 return new;
end;
$$;
drop trigger if exists protect_founder_badge on public.provider_profiles;
create trigger protect_founder_badge before insert or update on public.provider_profiles for each row execute function public.protect_founder_badge();

create or replace function public.schedule_internal_booking_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status in ('pending','confirmed') then
  insert into public.appointment_reminder_jobs(booking_id,offset_hours,due_at,status)
  select new.id,reminder.offset_hours,new.starts_at-(reminder.offset_hours || ' hours')::interval,'pending'
  from (values(24),(2)) as reminder(offset_hours)
  where new.starts_at-(reminder.offset_hours || ' hours')::interval > now()
  on conflict(booking_id,offset_hours) do update set due_at=excluded.due_at,status='pending',sent_at=null
  where public.appointment_reminder_jobs.due_at is distinct from excluded.due_at or public.appointment_reminder_jobs.status='cancelled';
  update public.appointment_reminder_jobs set status='cancelled' where booking_id=new.id and status='pending' and due_at<=now();
 elsif new.status in ('declined','cancelled_by_client','cancelled_by_provider','completed','no_show') then
  update public.appointment_reminder_jobs set status='cancelled' where booking_id=new.id and status='pending';
 end if;
 return new;
end;
$$;
drop trigger if exists booking_internal_reminders on public.bookings;
create trigger booking_internal_reminders after insert or update of starts_at,status on public.bookings for each row execute function public.schedule_internal_booking_reminders();

alter table public.launch_settings enable row level security;
alter table public.launch_provider_cohort enable row level security;
alter table public.appointment_reminder_jobs enable row level security;
revoke all on public.launch_settings,public.launch_provider_cohort,public.appointment_reminder_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.launch_settings,public.launch_provider_cohort to authenticated;
grant select on public.appointment_reminder_jobs to authenticated;
grant all on public.launch_settings,public.launch_provider_cohort,public.appointment_reminder_jobs to service_role;
drop policy if exists "launch settings super admin read" on public.launch_settings;
drop policy if exists "launch settings super admin write" on public.launch_settings;
drop policy if exists "launch settings super admin manage" on public.launch_settings;
drop policy if exists "launch cohort super admin manage" on public.launch_provider_cohort;
drop policy if exists "launch cohort provider read own" on public.launch_provider_cohort;
drop policy if exists "reminders members read" on public.appointment_reminder_jobs;
create policy "launch settings super admin manage" on public.launch_settings for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
create policy "launch cohort super admin manage" on public.launch_provider_cohort for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
create policy "reminders members read" on public.appointment_reminder_jobs for select to authenticated using(exists(select 1 from public.bookings booking where booking.id=booking_id and (booking.client_id=auth.uid() or booking.provider_id=auth.uid() or public.has_admin_permission('bookings.read'))));
revoke all on function public.get_launch_dashboard(),public.get_launch_provider_cohort(),public.sync_founder_badge(uuid) from public,anon,authenticated;
grant execute on function public.get_launch_dashboard(),public.get_launch_provider_cohort(),public.sync_founder_badge(uuid) to authenticated;
revoke all on function public.process_internal_booking_reminders(),public.schedule_internal_booking_reminders(),public.protect_founder_badge() from public,anon,authenticated;
grant execute on function public.process_internal_booking_reminders() to service_role;
-- Same existing reminder schedule, with row locking and idempotent per-booking jobs.
select cron.schedule('mata-process-internal-booking-reminders','*/5 * * * *','select public.process_internal_booking_reminders()');
