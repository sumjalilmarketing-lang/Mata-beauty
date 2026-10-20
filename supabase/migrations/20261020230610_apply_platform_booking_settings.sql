begin;

-- Refuse to install against a schema that does not match the Production
-- booking pipeline inspected for this change.
do $$
begin
  if to_regclass('public.app_settings') is null
    or to_regclass('public.bookings') is null
    or not exists (select 1 from pg_namespace where nspname = 'booking_private')
    or to_regprocedure('booking_private.independent_slots(uuid,uuid,date,integer)') is null
    or to_regprocedure('public.get_team_available_slots(uuid,date,integer)') is null
    or to_regprocedure('public.enforce_booking_contract()') is null
    or to_regprocedure('public.validate_booking_update()') is null then
    raise exception 'Schéma de réservation inattendu : migration platform booking settings arrêtée';
  end if;
end;
$$;

-- Read the existing non-sensitive app setting with safe defaults. This helper
-- lives outside exposed schemas and is not directly callable by API roles.
create or replace function booking_private.read_platform_booking_rules()
returns table(minimum_notice_minutes integer, cancellation_window_hours integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rules jsonb;
  raw_value text;
  parsed_value integer;
begin
  select setting.value into rules
  from public.app_settings as setting
  where setting.key = 'booking';

  minimum_notice_minutes := 60;
  raw_value := rules ->> 'minimum_notice_minutes';
  if jsonb_typeof(rules -> 'minimum_notice_minutes') = 'number'
    and raw_value ~ '^(0|[1-9][0-9]{0,4})$' then
    parsed_value := raw_value::integer;
    if parsed_value between 0 and 43200 then minimum_notice_minutes := parsed_value; end if;
  end if;

  cancellation_window_hours := 24;
  raw_value := rules ->> 'cancellation_window_hours';
  if jsonb_typeof(rules -> 'cancellation_window_hours') = 'number'
    and raw_value ~ '^(0|[1-9][0-9]{0,3})$' then
    parsed_value := raw_value::integer;
    if parsed_value between 0 and 8760 then cancellation_window_hours := parsed_value; end if;
  end if;

  return next;
end;
$$;
revoke all on function booking_private.read_platform_booking_rules() from public, anon, authenticated;

-- Keep administrators from persisting malformed values that would silently
-- fall back to defaults in the booking engine.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_settings'::regclass
      and conname = 'app_settings_booking_rules_valid'
  ) then
    alter table public.app_settings
      add constraint app_settings_booking_rules_valid
      check (
        key <> 'booking' or (
          jsonb_typeof(value) = 'object'
          and case
            when jsonb_typeof(value -> 'minimum_notice_minutes') = 'number'
              and (value ->> 'minimum_notice_minutes') ~ '^(0|[1-9][0-9]{0,4})$'
            then (value ->> 'minimum_notice_minutes')::numeric between 0 and 43200
            else false
          end
          and case
            when jsonb_typeof(value -> 'cancellation_window_hours') = 'number'
              and (value ->> 'cancellation_window_hours') ~ '^(0|[1-9][0-9]{0,3})$'
            then (value ->> 'cancellation_window_hours')::numeric between 0 and 8760
            else false
          end
        )
      ) not valid;
  end if;
end;
$$;
alter table public.app_settings validate constraint app_settings_booking_rules_valid;

-- Independent providers use a stored copy of the slot calculation. Patch only
-- its lower-bound predicate and fail closed if the inspected definition drifts.
do $$
declare
  current_definition text;
  patched_definition text;
begin
  current_definition := pg_get_functiondef('booking_private.independent_slots(uuid,uuid,date,integer)'::regprocedure);
  if position(
    'candidate.slot_start >= now() + make_interval(mins => (select rules.minimum_notice_minutes from booking_private.read_platform_booking_rules() as rules))'
    in current_definition
  ) = 0 then
    patched_definition := replace(
      current_definition,
      'where candidate.slot_start > now()',
      'where candidate.slot_start >= now() + make_interval(mins => (select rules.minimum_notice_minutes from booking_private.read_platform_booking_rules() as rules))'
    );
    if patched_definition = current_definition then
      raise exception 'Définition de independent_slots inattendue : préavis non installé';
    end if;
    execute patched_definition;
  end if;
end;
$$;

-- Team slots are rebuilt from the Production signature and predicates, adding
-- the same server-side lower bound without changing assignment or availability
-- logic.
create or replace function public.get_team_available_slots(
  target_provider_service_id uuid,
  from_date date default current_date,
  days integer default 1
)
returns table(slot_start timestamptz, collaborator_id uuid, display_name text, title text, avatar_url text, specialties text[])
language sql
stable
security definer
set search_path = ''
as $$
  select distinct slot.start_at, c.id, c.display_name, c.title, c.avatar_url, c.specialties
  from public.provider_services s
  join public.collaborator_services skill on skill.provider_service_id = s.id
  join public.collaborators c on c.id = skill.collaborator_id
  cross join generate_series(from_date, from_date + greatest(0, least(days, 31) - 1), interval '1 day') d
  cross join lateral booking_private.employee_windows(c.id, d::date) w
  cross join lateral generate_series(
    w.window_start,
    w.window_end - make_interval(mins => booking_private.default_service_duration(s.id) + c.buffer_minutes),
    make_interval(mins => w.interval_minutes)
  ) slot(start_at)
  cross join lateral booking_private.read_platform_booking_rules() rules
  where s.id = target_provider_service_id
    and booking_private.can_assign(s.id, c.id, slot.start_at, slot.start_at + make_interval(mins => booking_private.default_service_duration(s.id)))
    and slot.start_at >= now() + make_interval(mins => rules.minimum_notice_minutes)
  order by slot.start_at, c.id
  limit 4000;
$$;

-- Defense in depth: all booking inserts, including quote-backed writes that
-- take a separate path in enforce_booking_contract(), obey the configured lead time.
create or replace function booking_private.enforce_platform_booking_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare minimum_notice integer;
begin
  select rules.minimum_notice_minutes into minimum_notice
  from booking_private.read_platform_booking_rules() as rules;
  if new.starts_at < now() + make_interval(mins => minimum_notice) then
    raise exception 'Ce rendez-vous doit respecter un préavis minimum de % minutes.', minimum_notice
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function booking_private.enforce_platform_booking_notice() from public, anon, authenticated;
drop trigger if exists bookings_00_platform_booking_notice on public.bookings;
create trigger bookings_00_platform_booking_notice
before insert on public.bookings
for each row execute function booking_private.enforce_platform_booking_notice();

-- The existing booking trigger continues to own all state transitions. This
-- separate guard only limits client cancellations to the configured window.
create or replace function booking_private.enforce_platform_cancellation_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare cancellation_window integer;
begin
  if new.status is distinct from old.status
    and new.status = 'cancelled_by_client'
    and auth.uid() = old.client_id
    and old.status in ('pending', 'confirmed') then
    select rules.cancellation_window_hours into cancellation_window
    from booking_private.read_platform_booking_rules() as rules;
    if old.starts_at < now() + make_interval(hours => cancellation_window) then
      raise exception 'Cette réservation doit être annulée au moins % heures avant le rendez-vous.', cancellation_window
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function booking_private.enforce_platform_cancellation_window() from public, anon, authenticated;
drop trigger if exists bookings_00_platform_cancellation_window on public.bookings;
create trigger bookings_00_platform_cancellation_window
before update of status on public.bookings
for each row execute function booking_private.enforce_platform_cancellation_window();

-- This permission-gated probe lets the Super Admin UI stay read-only on Preview
-- projects where this migration has not been installed.
create or replace function public.get_booking_settings_enforcement_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_permission('settings.update') then
    raise exception 'Permission settings.update requise' using errcode = '42501';
  end if;
  return exists (
    select 1 from pg_trigger
    where tgrelid = 'public.bookings'::regclass
      and tgname in ('bookings_00_platform_booking_notice', 'bookings_00_platform_cancellation_window')
      and not tgisinternal
    group by tgrelid
    having count(*) = 2
  );
end;
$$;
revoke all on function public.get_booking_settings_enforcement_status() from public, anon;
grant execute on function public.get_booking_settings_enforcement_status() to authenticated;

notify pgrst, 'reload schema';
commit;
