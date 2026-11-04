-- Apply as a versioned migration after tests. No table or access grant is added.
begin;

create or replace function booking_private.minimum_booking_notice()
returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select case when value->>'minimum_notice_minutes' ~ '^[0-9]{1,5}$'
   then case when (value->>'minimum_notice_minutes')::integer between 0 and 43200
   then (value->>'minimum_notice_minutes')::integer else 60 end else 60 end
 from public.app_settings where key='booking'),60)
$$;
revoke all on function booking_private.minimum_booking_notice() from public,anon,authenticated;

-- Cancellation remains the published fixed 48-hour policy. Do not introduce
-- an editable financial rule or retroactive contract change through settings.
update public.app_settings set value=jsonb_set(value,'{cancellation_window_hours}','48'::jsonb) where key='booking';
create or replace function booking_private.validate_booking_setting()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.key='booking' then
   if not coalesce(jsonb_typeof(new.value)='object'
     and jsonb_typeof(new.value->'minimum_notice_minutes')='number'
     and new.value->>'minimum_notice_minutes' ~ '^[0-9]{1,5}$'
     and new.value->'cancellation_window_hours'='48'::jsonb,false) then
     raise exception 'Préavis invalide ou politique d''annulation différente de 48 heures' using errcode='23514';
   end if;
   if (new.value->>'minimum_notice_minutes')::integer>43200 then
     raise exception 'Préavis maximum de 43200 minutes' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
revoke all on function booking_private.validate_booking_setting() from public,anon,authenticated;
create trigger app_settings_validate_booking before insert or update of value,key on public.app_settings
for each row execute function booking_private.validate_booking_setting();

create or replace function booking_private.enforce_booking_notice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.starts_at is not distinct from old.starts_at then return new; end if;
 end if;
 if new.starts_at < now()+make_interval(mins=>booking_private.minimum_booking_notice()) then
   raise exception 'Créneau trop proche : préavis minimum non respecté' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function booking_private.enforce_booking_notice() from public,anon,authenticated;
create trigger bookings_enforce_minimum_notice before insert or update of starts_at on public.bookings
for each row execute function booking_private.enforce_booking_notice();

-- Patch only the two reviewed predicates; retain existing timezone, capacity,
-- publication, holiday and authorization checks and existing function ACLs.
do $$ declare original text; patched text; begin
 original:=pg_get_functiondef('booking_private.independent_slots(uuid,uuid,date,integer)'::regprocedure);
 if position('where c.slot_start>now()' in original)=0 then raise exception 'Independent slot predicate changed'; end if;
 patched:=replace(original,'where c.slot_start>now()',
   'where c.slot_start>now() and c.slot_start>=now()+make_interval(mins=>booking_private.minimum_booking_notice())');
 execute patched;
 original:=pg_get_functiondef('public.get_team_available_slots(uuid,date,integer)'::regprocedure);
 if position('where s.id=target_provider_service_id and booking_private.can_assign' in original)=0 then raise exception 'Team slot predicate changed'; end if;
 patched:=replace(original,'where s.id=target_provider_service_id and booking_private.can_assign',
   'where slot.start_at>=now()+make_interval(mins=>booking_private.minimum_booking_notice()) and s.id=target_provider_service_id and booking_private.can_assign');
 execute patched;
end $$;
notify pgrst,'reload schema';
commit;
