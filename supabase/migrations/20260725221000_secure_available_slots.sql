begin;

create or replace function public.get_available_slots(
  target_provider_id uuid,
  target_provider_service_id uuid,
  from_date date default current_date,
  days integer default 14
)
returns table (slot_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_service as (
    select ps.duration_minutes
    from public.provider_services ps
    join public.provider_profiles pp on pp.profile_id = ps.provider_id
    where ps.id = target_provider_service_id
      and ps.provider_id = target_provider_id
      and ps.is_active
      and pp.status = 'approved'
  ),
  candidate_slots as (
    select
      generated.slot_start,
      selected_service.duration_minutes
    from selected_service
    cross join generate_series(
      from_date,
      from_date + greatest(0, least(days, 31) - 1),
      interval '1 day'
    ) as calendar(day_value)
    join public.availability_rules rule
      on rule.provider_id = target_provider_id
      and rule.weekday = extract(dow from calendar.day_value)::smallint
      and (rule.valid_from is null or calendar.day_value::date >= rule.valid_from)
      and (rule.valid_until is null or calendar.day_value::date <= rule.valid_until)
    cross join lateral generate_series(
      (calendar.day_value::date + rule.starts_at) at time zone 'Africa/Dakar',
      ((calendar.day_value::date + rule.ends_at) at time zone 'Africa/Dakar')
        - make_interval(mins => selected_service.duration_minutes),
      make_interval(mins => rule.slot_interval_minutes)
    ) as generated(slot_start)
  )
  select candidate.slot_start
  from candidate_slots candidate
  where candidate.slot_start > now()
    and not exists (
      select 1
      from public.availability_exceptions exception
      where exception.provider_id = target_provider_id
        and not exception.is_available
        and tstzrange(exception.starts_at, exception.ends_at, '[)') &&
          tstzrange(
            candidate.slot_start,
            candidate.slot_start + make_interval(mins => candidate.duration_minutes),
            '[)'
          )
    )
    and not exists (
      select 1
      from public.bookings booking
      where booking.provider_id = target_provider_id
        and booking.status in ('pending', 'confirmed', 'in_progress')
        and tstzrange(booking.starts_at, booking.ends_at, '[)') &&
          tstzrange(
            candidate.slot_start,
            candidate.slot_start + make_interval(mins => candidate.duration_minutes),
            '[)'
          )
    )
  order by candidate.slot_start
  limit 80;
$$;

revoke all on function public.get_available_slots(uuid, uuid, date, integer) from public;
grant execute on function public.get_available_slots(uuid, uuid, date, integer) to anon, authenticated;

commit;
