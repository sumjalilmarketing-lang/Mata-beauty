begin;

insert into public.categories (name, slug, description, icon, sort_order, is_active)
values
  ('Coiffure homme', 'coiffure-homme', 'Coupes, coiffage et soins capillaires pour homme.', '✂', 25, true),
  ('Perruques et lace wigs', 'perruques-lace-wigs', 'Pose, personnalisation et entretien de perruques et lace wigs.', '◇', 35, true),
  ('Beauté à domicile', 'beaute-domicile', 'Prestations beauté réalisées à l’adresse de la cliente.', '⌂', 90, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.services (category_id, name, slug, description, is_active)
select category.id, seed.name, seed.slug, seed.description, true
from (
  values
    ('coiffure-homme', 'Coiffure homme', 'coiffure-homme', 'Coupe et coiffage personnalisés pour homme.'),
    ('perruques-lace-wigs', 'Pose de perruque', 'pose-perruque', 'Préparation, pose et finition naturelle d’une perruque ou lace wig.'),
    ('beaute-domicile', 'Prestation beauté à domicile', 'beaute-domicile', 'Prestation réalisée à domicile selon la zone desservie.')
) as seed(category_slug, name, slug, description)
join public.categories category on category.slug = seed.category_slug
on conflict (category_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

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
    select ps.duration_minutes, ps.business_id
    from public.provider_services ps
    join public.provider_profiles pp on pp.profile_id = ps.provider_id
    where ps.id = target_provider_service_id
      and ps.provider_id = target_provider_id
      and ps.is_active
      and pp.status = 'approved'
  ),
  calendar as (
    select generated.day_value::date as day_value
    from generate_series(
      from_date,
      from_date + greatest(0, least(days, 31) - 1),
      interval '1 day'
    ) as generated(day_value)
  ),
  availability_windows as (
    select calendar.day_value, rule.starts_at, rule.ends_at, rule.slot_interval_minutes
    from calendar
    join public.availability_rules rule
      on rule.provider_id = target_provider_id
      and rule.weekday = extract(dow from calendar.day_value)::smallint
      and (rule.valid_from is null or calendar.day_value >= rule.valid_from)
      and (rule.valid_until is null or calendar.day_value <= rule.valid_until)
    union
    select calendar.day_value, hours.opens_at, hours.closes_at, 30
    from selected_service
    join public.business_hours hours on hours.business_id = selected_service.business_id and not hours.is_closed
    join calendar on hours.weekday = extract(dow from calendar.day_value)::smallint
    where selected_service.business_id is not null
      and hours.opens_at is not null
      and hours.closes_at is not null
  ),
  candidate_slots as (
    select generated.slot_start, selected_service.duration_minutes, selected_service.business_id
    from selected_service
    join availability_windows on true
    cross join lateral generate_series(
      (availability_windows.day_value + availability_windows.starts_at) at time zone 'Africa/Dakar',
      ((availability_windows.day_value + availability_windows.ends_at) at time zone 'Africa/Dakar')
        - make_interval(mins => selected_service.duration_minutes),
      make_interval(mins => availability_windows.slot_interval_minutes)
    ) as generated(slot_start)
  )
  select distinct candidate.slot_start
  from candidate_slots candidate
  where candidate.slot_start > now()
    and not exists (
      select 1 from public.availability_exceptions exception
      where exception.provider_id = target_provider_id
        and not exception.is_available
        and tstzrange(exception.starts_at, exception.ends_at, '[)') &&
          tstzrange(candidate.slot_start, candidate.slot_start + make_interval(mins => candidate.duration_minutes), '[)')
    )
    and not exists (
      select 1 from public.business_closures closure
      where closure.business_id = candidate.business_id
        and tstzrange(closure.starts_at, closure.ends_at, '[)') &&
          tstzrange(candidate.slot_start, candidate.slot_start + make_interval(mins => candidate.duration_minutes), '[)')
    )
    and not exists (
      select 1 from public.bookings booking
      where booking.provider_id = target_provider_id
        and booking.status in ('pending', 'confirmed', 'in_progress')
        and tstzrange(booking.starts_at, booking.ends_at, '[)') &&
          tstzrange(candidate.slot_start, candidate.slot_start + make_interval(mins => candidate.duration_minutes), '[)')
    )
  order by candidate.slot_start
  limit 80;
$$;

revoke all on function public.get_available_slots(uuid, uuid, date, integer) from public;
grant execute on function public.get_available_slots(uuid, uuid, date, integer) to anon, authenticated;

commit;
