begin;

create or replace function booking_private.provider_timezone(target_provider uuid, target_business uuid default null)
returns text language sql stable security definer set search_path = '' as $$
  -- Legacy schedules were interpreted in Dakar before establishment zones
  -- existed. Keep that behavior as a scheduling fallback only; it does not
  -- infer or write an establishment's country.
  select coalesce(nullif(b.timezone,''), nullif(p.timezone,''), 'Africa/Dakar')
  from public.provider_profiles p
  left join public.businesses b on b.id=target_business and b.owner_id=p.profile_id
  where p.profile_id=target_provider
$$;
revoke all on function booking_private.provider_timezone(uuid,uuid) from public,anon,authenticated;

-- Existing Dakar profiles keep their historical scheduling convention. Other
-- establishments must supply a real IANA zone before becoming bookable.
create or replace function public.require_global_location_before_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='pending_review' and (new.country_code is null or new.currency is null or new.timezone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=new.timezone)) then
    raise exception 'Pays, devise et fuseau horaire IANA requis avant la soumission';
  end if;
  return new;
end $$;
drop trigger if exists provider_global_location_required on public.provider_profiles;
create trigger provider_global_location_required before update of status on public.provider_profiles
for each row execute function public.require_global_location_before_publication();
revoke all on function public.require_global_location_before_publication() from public,anon,authenticated;

create or replace function public.require_global_business_location_before_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='approved' and (new.country_code is null or new.currency is null or new.timezone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=new.timezone)) then
    raise exception 'Pays, devise et fuseau horaire IANA requis avant la publication du salon';
  end if;
  return new;
end $$;
drop trigger if exists business_global_location_required on public.businesses;
create trigger business_global_location_required before insert or update of status on public.businesses
for each row execute function public.require_global_business_location_before_publication();
revoke all on function public.require_global_business_location_before_publication() from public,anon,authenticated;

-- Remove the legacy Dakar-day-only check on staff hour exceptions; UTC ranges
-- remain constrained to start < end and are now interpreted by business zone.
do $$ declare item record; begin
  for item in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid='public.collaborator_exceptions'::regclass and c.contype='c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%Africa/Dakar%'
  loop execute format('alter table public.collaborator_exceptions drop constraint %I',item.conname); end loop;
end $$;

create or replace function booking_private.employee_windows(target_employee uuid,target_day date)
returns table(window_start timestamptz,window_end timestamptz,interval_minutes integer)
language sql stable security definer set search_path = '' as $$
  with zone as (
    select booking_private.provider_timezone(b.owner_id,b.id) as value
    from public.collaborators c join public.businesses b on b.id=c.business_id
    where c.id=target_employee
  ), windows as (
    select (target_day+h.starts_at) at time zone zone.value as opens,
      (target_day+h.ends_at) at time zone zone.value as closes,h.slot_interval_minutes as step
    from public.collaborator_hours h cross join zone
    where h.collaborator_id=target_employee and h.weekday=extract(dow from target_day)
      and zone.value is not null
      and not exists(select 1 from public.collaborator_exceptions x cross join zone
        where x.collaborator_id=target_employee and x.kind='hours'
          and (x.starts_at at time zone zone.value)::date=target_day)
    union all
    select x.starts_at,x.ends_at,30 from public.collaborator_exceptions x cross join zone
      where x.collaborator_id=target_employee and x.kind='hours' and zone.value is not null
        and (x.starts_at at time zone zone.value)::date=target_day
  )
  select greatest(w.opens,coalesce((target_day+h.opens_at) at time zone zone.value,w.opens)),
    least(w.closes,coalesce((target_day+h.closes_at) at time zone zone.value,w.closes)),w.step
  from windows w join public.collaborators c on c.id=target_employee
  join public.businesses b on b.id=c.business_id cross join zone
  left join public.business_hours h on h.business_id=c.business_id and h.weekday=extract(dow from target_day)
  where zone.value is not null and not coalesce(h.is_closed,false);
$$;
revoke all on function booking_private.employee_windows(uuid,date) from public,anon,authenticated;

create or replace function booking_private.can_assign(target_service uuid,target_employee uuid,starts timestamptz,ends timestamptz,ignore_booking uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.collaborators c
    join public.businesses business on business.id=c.business_id
    join public.provider_services service on service.id=target_service and service.business_id=business.id and service.provider_id=business.owner_id
    join public.provider_profiles provider on provider.profile_id=service.provider_id
    join public.profiles account on account.id=service.provider_id and not account.is_suspended and account.account_status='active'
    join public.collaborator_services skill on skill.collaborator_id=c.id and skill.provider_service_id=service.id
    where c.id=target_employee and c.is_active and c.is_bookable and c.archived_at is null
      and business.team_booking_enabled and business.is_active and business.archived_at is null and business.status='approved'
      and provider.status='approved' and service.is_active and coalesce(to_jsonb(service)->>'status','published')='published' and service.archived_at is null
      and starts>now() and starts<now()+interval '1 year' and ends>starts
      and exists(select 1 from booking_private.employee_windows(c.id,(starts at time zone booking_private.provider_timezone(business.owner_id,business.id))::date) w
        where starts>=w.window_start and ends+make_interval(mins=>c.buffer_minutes)<=w.window_end
          and mod(extract(epoch from starts-w.window_start)::numeric,w.interval_minutes*60)=0)
      and not exists(select 1 from public.collaborator_exceptions x where x.collaborator_id=c.id and x.kind<>'hours'
        and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(starts,ends+make_interval(mins=>c.buffer_minutes),'[)'))
      and not exists(select 1 from public.business_closures x where x.business_id=business.id
        and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(starts,ends+make_interval(mins=>c.buffer_minutes),'[)'))
      and not exists(select 1 from public.bookings b where b.provider_id=service.provider_id
        and (ignore_booking is null or b.id<>ignore_booking) and (b.collaborator_id=c.id or b.collaborator_id is null)
        and b.status in ('pending','confirmed','in_progress')
        and tstzrange(b.starts_at,coalesce(b.resource_busy_until,b.ends_at),'[)') && tstzrange(starts,ends+make_interval(mins=>c.buffer_minutes),'[)'))
  );
$$;
revoke all on function booking_private.can_assign(uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;

-- Replace the existing private helper (rather than bypassing it) so the public
-- wrapper keeps routing team-booked services through collaborator availability.
create or replace function booking_private.independent_slots(target_provider_id uuid,target_provider_service_id uuid,from_date date default current_date,days integer default 14)
returns table(slot_start timestamptz) language sql stable security definer set search_path = '' as $$
  with selected_service as (
    select ps.duration_minutes,ps.business_id,
      booking_private.provider_timezone(ps.provider_id,ps.business_id) as timezone
    from public.provider_services ps join public.provider_profiles pp on pp.profile_id=ps.provider_id
    where ps.id=target_provider_service_id and ps.provider_id=target_provider_id and ps.is_active
      and ps.archived_at is null and pp.status='approved'
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
  ), local_wall_slots as (
    -- Build the provider's nominal wall-clock schedule first. A direct
    -- `timestamp AT TIME ZONE zone` maps an ambiguous autumn time to only one
    -- offset, silently dropping the first occurrence of the repeated hour.
    select s.duration_minutes,s.business_id,s.timezone,w.day_value,
      generated.local_start,w.starts_at,w.ends_at,w.slot_interval_minutes
    from selected_service s join availability_windows w on s.timezone is not null
    cross join lateral generate_series(
      w.day_value+w.starts_at,
      w.day_value+w.ends_at-make_interval(mins=>s.duration_minutes),
      make_interval(mins=>w.slot_interval_minutes)
    ) generated(local_start)
  ), candidate_slots as (
    -- A wall time can have zero UTC instants (spring gap), one normal instant,
    -- or two instants (autumn fold). Try nearby offsets and retain only exact
    -- round trips; nonexistent local times therefore produce no slot.
    select distinct ((wall.local_start at time zone wall.timezone)
        + make_interval(mins=>offsets.offset_minutes)) as slot_start,
      wall.duration_minutes,wall.business_id,wall.timezone
    from local_wall_slots wall
    cross join lateral generate_series(-120,120,15) offsets(offset_minutes)
    where (((wall.local_start at time zone wall.timezone)
        + make_interval(mins=>offsets.offset_minutes)) at time zone wall.timezone)=wall.local_start
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
  order by c.slot_start limit 80
$$;
revoke all on function booking_private.independent_slots(uuid,uuid,date,integer) from public,anon,authenticated;

create or replace function public.get_available_slots(target_provider_id uuid,target_provider_service_id uuid,from_date date default current_date,days integer default 14)
returns table(slot_start timestamptz) language plpgsql stable security definer set search_path = '' as $$
begin
  if exists(select 1 from public.provider_services s join public.businesses b on b.id=s.business_id
    where s.id=target_provider_service_id and s.provider_id=target_provider_id and b.team_booking_enabled) then
    return query select distinct t.slot_start from public.get_team_available_slots(target_provider_service_id,from_date,days) t order by t.slot_start;
  else
    return query select * from booking_private.independent_slots(target_provider_id,target_provider_service_id,from_date,days);
  end if;
end $$;
revoke all on function public.get_available_slots(uuid,uuid,date,integer) from public;
grant execute on function public.get_available_slots(uuid,uuid,date,integer) to anon,authenticated,service_role;

create or replace function public.get_team_available_slots(target_provider_service_id uuid,from_date date default current_date,days integer default 1)
returns table(slot_start timestamptz,collaborator_id uuid,display_name text,title text,avatar_url text,specialties text[])
language sql stable security definer set search_path = '' as $$
  select distinct slot.start_at,c.id,c.display_name,c.title,c.avatar_url,c.specialties
  from public.provider_services s join public.collaborator_services skill on skill.provider_service_id=s.id
  join public.collaborators c on c.id=skill.collaborator_id
  cross join generate_series(from_date,from_date+greatest(0,least(days,31)-1),interval '1 day') d
  cross join lateral booking_private.employee_windows(c.id,d::date) w
  cross join lateral generate_series(w.window_start,w.window_end-make_interval(mins=>s.duration_minutes+c.buffer_minutes),make_interval(mins=>w.interval_minutes)) slot(start_at)
  where s.id=target_provider_service_id and booking_private.can_assign(s.id,c.id,slot.start_at,slot.start_at+make_interval(mins=>s.duration_minutes))
  order by slot.start_at,c.id limit 4000
$$;
revoke all on function public.get_team_available_slots(uuid,date,integer) from public;
grant execute on function public.get_team_available_slots(uuid,date,integer) to anon,authenticated,service_role;

create or replace function public.get_booking_team_availability(target_service_id uuid,from_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare service public.provider_services%rowtype; enabled boolean; slots jsonb;
begin
  select s.* into service from public.provider_services s join public.provider_profiles p on p.profile_id=s.provider_id
    where s.id=target_service_id and coalesce(to_jsonb(s)->>'status','published')='published' and s.is_active and s.archived_at is null and p.status='approved';
  if service.id is null then return jsonb_build_object('teamEnabled',false,'slots','[]'::jsonb); end if;
  select b.team_booking_enabled into enabled from public.businesses b where b.id=service.business_id;
  if coalesce(enabled,false) then select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into slots from public.get_team_available_slots(service.id,from_date,1) t;
  else select coalesce(jsonb_agg(jsonb_build_object('slot_start',t.slot_start)),'[]'::jsonb) into slots from public.get_available_slots(service.provider_id,service.id,from_date,1) t; end if;
  return jsonb_build_object('teamEnabled',coalesce(enabled,false),'slots',slots);
end $$;
revoke all on function public.get_booking_team_availability(uuid,date) from public;
grant execute on function public.get_booking_team_availability(uuid,date) to anon,authenticated,service_role;

-- Salon owner agenda: the date range is interpreted in the salon's own local
-- calendar, while booking columns remain unambiguous timestamptz instants.
create or replace function public.get_team_agenda(target_business_id uuid,from_date date default current_date,days integer default 31)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare zone text;
begin
  select booking_private.provider_timezone(b.owner_id,b.id) into zone
    from public.businesses b join public.profiles owner on owner.id=b.owner_id
    where b.id=target_business_id and b.owner_id=auth.uid() and not owner.is_suspended and owner.account_status='active';
  if not found then raise exception 'Accès refusé' using errcode='42501'; end if;
  if zone is null then raise exception 'Le salon doit définir un fuseau IANA avant d’utiliser son agenda'; end if;
  return coalesce((select jsonb_agg(to_jsonb(item) order by item.starts_at,item.id) from (
    select booking.id,booking.starts_at,booking.ends_at,booking.status,booking.collaborator_id,booking.collaborator_name,booking.provider_service_id,service.title as service_title,
      coalesce(nullif(account.display_name,''),nullif(trim(coalesce(account.first_name,'')||' '||coalesce(account.last_name,'')),''),'Client') as client_name,
      case when booking.collaborator_id is not null and booking.starts_at>now() and booking.status in ('pending','confirmed') then not booking_private.can_assign(booking.provider_service_id,booking.collaborator_id,booking.starts_at,booking.ends_at,booking.id) else false end as assignment_conflict
    from public.bookings booking join public.provider_services service on service.id=booking.provider_service_id join public.profiles account on account.id=booking.client_id
    where booking.business_id=target_business_id
      and booking.starts_at >= (from_date::timestamp at time zone zone)
      and booking.starts_at < ((from_date+greatest(1,least(days,93)))::timestamp at time zone zone)
    order by booking.starts_at,booking.id limit 500
  ) item),'[]'::jsonb);
end $$;
revoke all on function public.get_team_agenda(uuid,date,integer) from public,anon;
grant execute on function public.get_team_agenda(uuid,date,integer) to authenticated;

create or replace function booking_private.validate_collaborator_hours_exception()
returns trigger language plpgsql security definer set search_path = '' as $$
declare zone text;
begin
  if new.kind <> 'hours' then return new; end if;
  select coalesce(nullif(b.timezone,''),nullif(p.timezone,''),'Africa/Dakar')
    into zone from public.collaborators c join public.businesses b on b.id=c.business_id
    join public.provider_profiles p on p.profile_id=b.owner_id where c.id=new.collaborator_id;
  if zone is null then raise exception 'Définissez le fuseau IANA du salon avant les horaires particuliers'; end if;
  if (new.starts_at at time zone zone)::date <> (new.ends_at at time zone zone)::date then
    raise exception 'Une plage d’horaires particuliers doit rester dans le même jour local du salon';
  end if;
  return new;
end $$;
revoke all on function booking_private.validate_collaborator_hours_exception() from public,anon,authenticated;
drop trigger if exists collaborator_exception_global_hours_check on public.collaborator_exceptions;
create trigger collaborator_exception_global_hours_check before insert or update of starts_at,ends_at,kind,collaborator_id on public.collaborator_exceptions
for each row execute function booking_private.validate_collaborator_hours_exception();

-- Staff agenda returns its business timezone so the UI can display each shift
-- correctly even when a collaborator has access to more than one business.
create or replace function public.get_staff_booking_agenda_global(from_date date default current_date,days integer default 31)
returns table(id uuid,starts_at timestamptz,ends_at timestamptz,status text,service_title text,client_name text,time_zone text)
language sql stable security definer set search_path='' as $$
  select booking.id,booking.starts_at,booking.ends_at,booking.status,service.title,
    coalesce(nullif(trim(coalesce(account.display_name,'')||' '||coalesce(account.first_name,'')||' '||coalesce(account.last_name,'')),''),'Client'),
    coalesce(nullif(business.timezone,''),nullif(provider.timezone,''),'Africa/Dakar')
  from public.bookings booking
  join booking_private.collaborator_access access on access.collaborator_id=booking.collaborator_id and access.business_id=booking.business_id
  join public.collaborators collaborator on collaborator.id=access.collaborator_id and collaborator.profile_id=auth.uid() and collaborator.is_active and collaborator.archived_at is null
  join public.profiles active on active.id=auth.uid() and active.account_status='active' and not active.is_suspended
  join public.businesses business on business.id=booking.business_id
  join public.provider_profiles provider on provider.profile_id=business.owner_id
  join public.provider_services service on service.id=booking.provider_service_id
  join public.profiles account on account.id=booking.client_id
  where access.profile_id=auth.uid() and access.revoked_at is null and 'bookings.read'=any(access.permissions)
    and booking.starts_at >= (from_date::timestamp at time zone coalesce(nullif(business.timezone,''),nullif(provider.timezone,''),'Africa/Dakar'))
    and booking.starts_at < ((from_date+greatest(1,least(days,93)))::timestamp at time zone coalesce(nullif(business.timezone,''),nullif(provider.timezone,''),'Africa/Dakar'))
  order by booking.starts_at,booking.id limit 500
$$;
revoke all on function public.get_staff_booking_agenda_global(date,integer) from public,anon;
grant execute on function public.get_staff_booking_agenda_global(date,integer) to authenticated;

notify pgrst,'reload schema';
commit;
