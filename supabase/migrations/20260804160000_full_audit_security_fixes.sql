-- Full audit hardening: verified account activation and server-owned booking quotes.

create or replace function public.synchronize_account_status()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_status text;
  current_status text;
  suspended boolean;
  email_verified boolean;
  phone_verified boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select p.account_status, p.is_suspended,
    u.email_confirmed_at is not null,
    u.phone_confirmed_at is not null
  into current_status, suspended, email_verified, phone_verified
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
  for update of p;

  if not found then
    raise exception 'Profil introuvable';
  end if;

  resulting_status := case
    when suspended then 'suspended'
    when current_status = 'email_unverified' and email_verified then 'active'
    when current_status = 'phone_unverified' and phone_verified then 'active'
    else current_status
  end;

  if resulting_status is distinct from current_status then
    update public.profiles set account_status = resulting_status where id = auth.uid();
  end if;

  return resulting_status;
end;
$$;
revoke all on function public.synchronize_account_status() from public, anon;
grant execute on function public.synchronize_account_status() to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_verified boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role or new.is_suspended is distinct from old.is_suspended then
    raise exception 'La modification du role ou de la suspension necessite un administrateur';
  end if;

  if new.account_status is distinct from old.account_status then
    if old.account_status = 'email_unverified' and new.account_status = 'active' then
      select email_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    elsif old.account_status = 'phone_unverified' and new.account_status = 'active' then
      select phone_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    end if;
    if not identity_verified then
      raise exception 'Transition de compte interdite ou identite non verifiee';
    end if;
  end if;

  if (old.terms_accepted_at is not null and new.terms_accepted_at is distinct from old.terms_accepted_at)
    or (old.privacy_accepted_at is not null and new.privacy_accepted_at is distinct from old.privacy_accepted_at) then
    raise exception 'Les consentements legaux sont immuables';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

create or replace function public.enforce_booking_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_service public.provider_services%rowtype;
begin
  if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Authentification requise';
  end if;
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and not public.is_admin()
    and new.client_id is distinct from auth.uid() then
    raise exception 'Reservation interdite pour un autre client';
  end if;

  select * into selected_service
  from public.provider_services
  where id = new.provider_service_id and is_active
  for share;
  if not found then
    raise exception 'Prestation indisponible';
  end if;

  if new.starts_at <= now() or new.starts_at > now() + interval '1 year' then
    raise exception 'Date de reservation invalide';
  end if;
  if new.location_mode = 'client_address' and nullif(trim(new.appointment_address), '') is null then
    raise exception 'Adresse client requise';
  end if;

  new.provider_id := selected_service.provider_id;
  new.ends_at := new.starts_at + make_interval(mins => selected_service.duration_minutes);
  new.total_amount := selected_service.price_amount;
  new.currency := selected_service.currency;
  new.status := 'pending';
  return new;
end;
$$;
revoke all on function public.enforce_booking_contract() from public, anon, authenticated;

drop trigger if exists bookings_enforce_contract on public.bookings;
create trigger bookings_enforce_contract
before insert on public.bookings
for each row execute function public.enforce_booking_contract();
