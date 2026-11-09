begin;

-- A report keeps the contracted duration and cleanup buffer, even if the
-- service has since changed. Its own old range must not block the new range.
-- This private helper retains the independent calendar eligibility, timezone,
-- DST, opening-hour, holiday, notice and active-booking checks.
create function booking_private.independent_reschedule_slots(
  target_provider_id uuid, target_provider_service_id uuid, from_date date,
  occupied_minutes integer, ignore_booking uuid
)
returns table(slot_start timestamptz)
language sql stable strict security definer set search_path='' as $$
  with selected_service as (
    select occupied_minutes as duration_minutes,ps.business_id,
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
    select g.day_value::date as day_value from generate_series(from_date,from_date,interval '1 day') g(day_value)
  ), availability_windows as (
    select calendar.day_value,rule.starts_at,rule.ends_at,rule.slot_interval_minutes
    from calendar join public.availability_rules rule on rule.provider_id=target_provider_id
      and rule.weekday=extract(dow from calendar.day_value)::smallint
      and (rule.valid_from is null or calendar.day_value>=rule.valid_from)
      and (rule.valid_until is null or calendar.day_value<=rule.valid_until)
    where not exists(select 1 from selected_service s where s.business_id is not null)
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
    and c.slot_start>=now()+make_interval(mins=>booking_private.minimum_booking_notice())
    and c.slot_start<now()+interval '1 year'
    and not exists(select 1 from public.availability_exceptions x where x.provider_id=target_provider_id and not x.is_available
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)'))
    and not exists(select 1 from public.business_closures x where x.business_id=c.business_id
      and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)'))
    and not exists(select 1 from public.bookings b where b.provider_id=target_provider_id
      and b.id<>ignore_booking
      and b.status in ('pending','confirmed','in_progress')
      and tstzrange(b.starts_at,coalesce(b.resource_busy_until,b.ends_at),'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)'))
  order by c.slot_start
$$;
revoke all on function booking_private.independent_reschedule_slots(uuid,uuid,date,integer,uuid)
  from public,anon,authenticated;

create or replace function booking_private.owner_booking_slot_available(
  target uuid, new_start timestamptz, new_end timestamptz
)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((
    select (b.provider_id=auth.uid() or exists(
      select 1 from public.businesses business
      where business.id=b.business_id and business.owner_id=auth.uid()
    ))
    and new_start>now() and new_end>new_start
    and new_end-new_start=b.ends_at-b.starts_at
    and case when b.collaborator_id is not null then
      booking_private.can_assign(b.provider_service_id,b.collaborator_id,new_start,new_end,b.id)
    else exists(
      select 1 from booking_private.independent_reschedule_slots(
        b.provider_id,b.provider_service_id,
        (new_start at time zone booking_private.provider_timezone(b.provider_id,b.business_id))::date,
        -- Stored booking durations and cleanup buffers have minute precision.
        -- Rounding upward is conservative for any legacy fractional interval.
        ceil(extract(epoch from (new_end-new_start+
          greatest(coalesce(b.resource_busy_until-b.ends_at,interval '0'),interval '0')))/60)::integer,
        b.id
      ) slot where slot.slot_start=new_start
    ) end
    from public.bookings b where b.id=target
  ),false);
$$;
-- CREATE OR REPLACE preserves the reviewed helper's existing ACL. No new
-- authenticated/public execution right is added to the new privileged helper.
notify pgrst,'reload schema';
commit;
