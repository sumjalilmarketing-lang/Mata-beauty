begin;

-- One canonical independent calendar for listing and insert validation. The
-- internal function has no display cap: a valid late slot must be bookable.
create or replace function booking_private.independent_slots(target_provider_id uuid,target_provider_service_id uuid,from_date date default current_date,days integer default 14)
returns table(slot_start timestamptz) language sql stable security definer set search_path = '' as $$
  with selected_service as (
    select ps.duration_minutes,ps.business_id,
      booking_private.provider_timezone(ps.provider_id,ps.business_id) as timezone
    from public.provider_services ps
    join public.provider_profiles pp on pp.profile_id=ps.provider_id
    join public.profiles account on account.id=pp.profile_id
      and account.account_status='active' and not account.is_suspended
    left join public.businesses business on business.id=ps.business_id
    where ps.id=target_provider_service_id and ps.provider_id=target_provider_id and ps.is_active
      and ps.archived_at is null and pp.status='approved'
      and coalesce(to_jsonb(ps)->>'status','published')='published'
      and (ps.business_id is null or (business.owner_id=ps.provider_id
        and business.status='approved' and business.is_active and business.archived_at is null))
  ), calendar as (
    select g.day_value::date as day_value from generate_series(from_date,from_date+greatest(0,least(days,31)-1),interval '1 day') g(day_value)
  ), availability_windows as (
    select calendar.day_value,rule.starts_at,rule.ends_at,rule.slot_interval_minutes
    from calendar join public.availability_rules rule on rule.provider_id=target_provider_id
      and rule.weekday=extract(dow from calendar.day_value)::smallint
      and (rule.valid_from is null or calendar.day_value>=rule.valid_from)
      and (rule.valid_until is null or calendar.day_value<=rule.valid_until)
    union all
    select calendar.day_value,hours.opens_at,hours.closes_at,30
    from selected_service s join public.business_hours hours on hours.business_id=s.business_id and not hours.is_closed
    join calendar on hours.weekday=extract(dow from calendar.day_value)::smallint
    where s.business_id is not null and hours.opens_at is not null and hours.closes_at is not null
  ), candidate_slots as (
    select generated.slot_start,s.duration_minutes,s.business_id
    from selected_service s join availability_windows w on s.timezone is not null
    cross join lateral booking_private.local_schedule_slots(
      w.day_value,w.starts_at,w.ends_at,w.slot_interval_minutes,s.duration_minutes,s.timezone
    ) generated
  )
  select distinct c.slot_start from candidate_slots c
  where c.slot_start>now()
    and not exists(select 1 from public.availability_exceptions x where x.provider_id=target_provider_id and not x.is_available
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)'))
    and not exists(select 1 from public.business_closures x where x.business_id=c.business_id
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)'))
    and not exists(select 1 from public.bookings b where b.provider_id=target_provider_id
      and b.status in ('pending','confirmed','in_progress')
      and tstzrange(b.starts_at,coalesce(b.resource_busy_until,b.ends_at),'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)'))
  order by c.slot_start
$$;
revoke all on function booking_private.independent_slots(uuid,uuid,date,integer) from public,anon,authenticated;


-- Keep the public response bounded, without limiting server validation.
create or replace function public.get_available_slots(target_provider_id uuid,target_provider_service_id uuid,from_date date default current_date,days integer default 14)
returns table(slot_start timestamptz) language plpgsql stable security definer set search_path = '' as $$
begin
  if exists(select 1 from public.provider_services s join public.businesses b on b.id=s.business_id
    where s.id=target_provider_service_id and s.provider_id=target_provider_id and b.team_booking_enabled) then
    return query select distinct t.slot_start from public.get_team_available_slots(target_provider_service_id,from_date,days) t order by t.slot_start limit 80;
  else
    return query select * from booking_private.independent_slots(target_provider_id,target_provider_service_id,from_date,days) limit 80;
  end if;
end $$;
revoke all on function public.get_available_slots(uuid,uuid,date,integer) from public;
grant execute on function public.get_available_slots(uuid,uuid,date,integer) to anon,authenticated,service_role;

-- Runs after server price/duration normalization and salon assignment. Existing
-- resource locks and exclusion constraints remain the concurrency authority.
create or replace function booking_private.validate_bookable_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare zone text; mode text; team_enabled boolean;
begin
  if not exists(select 1 from public.profiles client
    where client.id=new.client_id and client.account_status='active' and not client.is_suspended) then
    raise exception 'Compte client indisponible' using errcode='42501';
  end if;
  select provider.service_mode,booking_private.provider_timezone(service.provider_id,service.business_id),
    coalesce(business.team_booking_enabled,false)
    into mode,zone,team_enabled
  from public.provider_services service
  join public.provider_profiles provider on provider.profile_id=service.provider_id
  join public.profiles account on account.id=provider.profile_id
  left join public.businesses business on business.id=service.business_id
  where service.id=new.provider_service_id and service.provider_id=new.provider_id
    and service.is_active and service.archived_at is null
    and coalesce(to_jsonb(service)->>'status','published')='published'
    and provider.status='approved' and account.account_status='active' and not account.is_suspended
    and (service.business_id is null or (business.owner_id=service.provider_id
      and business.status='approved' and business.is_active and business.archived_at is null));
  if not found or zone is null then
    raise exception 'Professionnel ou prestation indisponible' using errcode='23514';
  end if;
  if (new.location_mode='salon' and mode='mobile')
    or (new.location_mode='client_address' and mode='salon') then
    raise exception 'Mode de rendez-vous indisponible' using errcode='23514';
  end if;
  if not team_enabled and not exists(
    select 1 from booking_private.independent_slots(new.provider_id,new.provider_service_id,
      (new.starts_at at time zone zone)::date,1) slot where slot.slot_start=new.starts_at
  ) then
    raise exception 'Créneau indisponible ou hors disponibilités' using errcode='23P01';
  end if;
  return new;
end $$;
revoke all on function booking_private.validate_bookable_slot() from public,anon,authenticated;
drop trigger if exists bookings_enforce_slot_contract on public.bookings;
create trigger bookings_enforce_slot_contract before insert on public.bookings
for each row execute function booking_private.validate_bookable_slot();

notify pgrst,'reload schema';
commit;
