begin;

create or replace function booking_private.lock_booking_resource() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  select provider_id into owner from public.provider_services where id=new.provider_service_id;
  if owner is not null then
    if tg_op='UPDATE' then
      -- UPDATE already holds a row lock. Never wait in the reverse lock order
      -- of the owner RPC (provider lock, then appointment row lock).
      if not pg_try_advisory_xact_lock(hashtextextended(owner::text,8108)) then
        raise exception 'Agenda en cours de modification, veuillez réessayer' using errcode='40001';
      end if;
    else perform pg_advisory_xact_lock(hashtextextended(owner::text,8108)); end if;
  end if;
  return new;
end $$;

create function booking_private.prevent_duplicate_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.bookings b where b.client_id=new.client_id
    and b.provider_service_id=new.provider_service_id and b.starts_at=new.starts_at
    and b.status in ('pending','confirmed','in_progress')) then
    raise exception 'Une réservation existe déjà pour cette prestation et ce créneau' using errcode='23P01';
  end if;
  return new;
end $$;
create trigger bookings_ab_duplicate_request before insert on public.bookings
for each row execute function booking_private.prevent_duplicate_request();

do $$ declare definition text; begin
  definition:=pg_get_functiondef('booking_private.calendar_changed()'::regprocedure);
  execute replace(definition,
    'perform pg_advisory_xact_lock(hashtextextended(owner::text,8108));',
    'if not pg_try_advisory_xact_lock(hashtextextended(owner::text,8108)) then raise exception ''Agenda en cours de modification, veuillez réessayer'' using errcode=''40001''; end if;');
end $$;

revoke all on function public.enforce_salon_booking_contract(),public.protect_salon_booking_contract() from public,anon,authenticated;
revoke all on all functions in schema booking_private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
