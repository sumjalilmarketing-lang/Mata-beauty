begin;
create function booking_private.require_enabled_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.collaborator_id is not null and not exists(
    select 1 from public.provider_services s join public.businesses b on b.id=s.business_id
    where s.id=new.provider_service_id and b.team_booking_enabled
  ) then raise exception 'La réservation par collaborateur n’est pas activée pour cette prestation' using errcode='23514'; end if;
  return new;
end $$;
create trigger bookings_ac_enabled_assignment before insert on public.bookings
for each row execute function booking_private.require_enabled_assignment();
revoke all on function booking_private.require_enabled_assignment() from public,anon,authenticated;
commit;
