-- Backend regression checks, not authenticated end-to-end booking acceptance.
-- Read-only: uses no profiles, bookings, claims, fixtures or external delivery.
do $$
declare actual timestamptz[]; expected timestamptz[]; item record;
begin
  for item in select * from (values
    ('Paris spring',date '2027-03-28',time '01:00',time '03:00','Europe/Paris',
      array['2027-03-28 00:00Z']::timestamptz[]),
    ('Paris autumn',date '2027-10-31',time '01:00',time '03:00','Europe/Paris',
      array['2027-10-30 23:00Z','2027-10-30 23:30Z','2027-10-31 00:00Z','2027-10-31 00:30Z','2027-10-31 01:00Z']::timestamptz[]),
    ('New York spring',date '2027-03-14',time '01:00',time '03:00','America/New_York',
      array['2027-03-14 06:00Z']::timestamptz[]),
    ('New York autumn',date '2026-11-01',time '00:00',time '02:00','America/New_York',
      array['2026-11-01 04:00Z','2026-11-01 04:30Z','2026-11-01 05:00Z','2026-11-01 05:30Z','2026-11-01 06:00Z']::timestamptz[]),
    ('Nonexistent closing',date '2027-03-28',time '01:00',time '02:30','Europe/Paris',array[]::timestamptz[])
  ) cases(name,day,opens,closes,zone,slots) loop
    select coalesce(array_agg(slot_start order by slot_start),array[]::timestamptz[]) into actual
      from booking_private.local_schedule_slots(item.day,item.opens,item.closes,30,60,item.zone);
    if actual is distinct from item.slots then raise exception '%: expected %, got %',item.name,item.slots,actual; end if;
  end loop;
  -- No opening and closing windows or steps that could hang generate_series.
  if exists(select from booking_private.local_schedule_slots('2027-06-15','13:00','09:00',30,60,'Europe/Paris'))
    or exists(select from booking_private.local_schedule_slots('2027-06-15','09:00','13:00',0,60,'Europe/Paris')) then
    raise exception 'Invalid schedule should yield no slots';
  end if;
  for item in select * from (values
    ('Africa/Dakar','2027-06-15 09:00Z'::timestamptz),
    ('Europe/Paris','2027-06-15 07:00Z'::timestamptz),
    ('America/New_York','2027-06-15 13:00Z'::timestamptz)
  ) cases(zone,first_slot) loop
    select array_agg(slot_start order by slot_start) into actual
      from booking_private.local_schedule_slots('2027-06-15','09:00','13:00',30,90,item.zone);
    select array_agg(value order by value) into expected
      from generate_series(item.first_slot,item.first_slot+interval '150 minutes',interval '30 minutes') value;
    if actual is distinct from expected then raise exception 'Normal schedule mismatch for %',item.zone; end if;
  end loop;
  if has_function_privilege('anon','booking_private.local_schedule_slots(date,time,time,integer,integer,text)','EXECUTE')
    or has_function_privilege('authenticated','booking_private.local_schedule_slots(date,time,time,integer,integer,text)','EXECUTE') then
    raise exception 'Private helper must not be a public API';
  end if;
end $$;
select 'PASS: 5 DST scenarios, 2 invalid schedules, 3 city schedules, private helper access' as result;
