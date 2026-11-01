begin;

alter table public.provider_profiles
  add column if not exists country_code char(2),
  add column if not exists region text,
  add column if not exists timezone text,
  add column if not exists currency char(3);

alter table public.businesses
  add column if not exists country_code char(2),
  add column if not exists region text,
  add column if not exists timezone text,
  add column if not exists currency char(3);

-- New professional profiles may be drafts without a location. Keep the
-- required column shape while replacing the misleading Dakar placeholder.
alter table public.provider_profiles alter column city set default '';
alter table public.businesses alter column city drop default;

-- Do not infer an establishment's country from profiles.country_code. In the
-- legacy Production schema that column defaulted to SN, including accounts
-- whose professional city is outside Senegal. Existing addresses and values
-- remain untouched; each establishment confirms its own country, zone, and
-- billing currency through the forms below.

alter table public.provider_profiles add constraint provider_profiles_country_code_format
  check(country_code is null or country_code ~ '^[A-Z]{2}$') not valid;
alter table public.provider_profiles add constraint provider_profiles_currency_code_supported
  check(currency is null or currency in ('XOF','EUR','USD','GBP','CAD')) not valid;
alter table public.provider_profiles add constraint provider_profiles_timezone_nonempty
  check(timezone is null or length(trim(timezone)) between 3 and 80) not valid;
alter table public.businesses add constraint businesses_country_code_format
  check(country_code is null or country_code ~ '^[A-Z]{2}$') not valid;
alter table public.businesses add constraint businesses_currency_code_supported
  check(currency is null or currency in ('XOF','EUR','USD','GBP','CAD')) not valid;
alter table public.businesses add constraint businesses_timezone_nonempty
  check(timezone is null or length(trim(timezone)) between 3 and 80) not valid;

create or replace function public.save_professional_global_location(
  target_country_code text, target_region text, target_timezone text, target_currency text
) returns void
language plpgsql security definer set search_path = '' as $$
declare country_value text := upper(trim(coalesce(target_country_code,'')));
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if country_value !~ '^[A-Z]{2}$' then raise exception 'Code pays ISO invalide'; end if;
  if target_currency is null or target_currency not in ('XOF','EUR','USD','GBP','CAD') then raise exception 'Devise non prise en charge'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=target_timezone) then raise exception 'Fuseau IANA inconnu'; end if;
  update public.provider_profiles set country_code=country_value,region=nullif(left(trim(coalesce(target_region,'')),120),''),
    timezone=target_timezone,currency=target_currency,updated_at=now()
    where profile_id=auth.uid() and (status in ('draft','rejected','approved') or (status='pending_review'
      and exists(select 1 from public.professional_onboarding o where o.provider_id=auth.uid() and o.status='additional_information_required')));
  if not found then raise exception 'Seul votre propre dossier professionnel peut enregistrer sa localisation'; end if;
end $$;
revoke all on function public.save_professional_global_location(text,text,text,text) from public,anon;
grant execute on function public.save_professional_global_location(text,text,text,text) to authenticated;

create or replace function public.save_business_global_location(
  target_business_id uuid, target_country_code text, target_region text,
  target_timezone text, target_currency text
) returns void
language plpgsql security definer set search_path = '' as $$
declare country_value text := upper(trim(coalesce(target_country_code,'')));
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if country_value !~ '^[A-Z]{2}$' then raise exception 'Code pays ISO invalide'; end if;
  if target_currency is null or target_currency not in ('XOF','EUR','USD','GBP','CAD') then raise exception 'Devise non prise en charge'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=target_timezone) then raise exception 'Fuseau IANA inconnu'; end if;
  update public.businesses set country_code=country_value,region=nullif(left(trim(coalesce(target_region,'')),120),''),
    timezone=target_timezone,currency=target_currency,updated_at=now()
    where id=target_business_id and owner_id=auth.uid() and status in ('draft','pending_review','rejected','approved');
  if not found then raise exception 'Salon absent, non modifiable ou accès refusé'; end if;
end $$;
revoke all on function public.save_business_global_location(uuid,text,text,text,text) from public,anon;
grant execute on function public.save_business_global_location(uuid,text,text,text,text) to authenticated;

create or replace function booking_private.enforce_service_business_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
declare selected_currency char(3);
begin
  select case when new.business_id is not null then b.currency else p.currency end into selected_currency
  from public.provider_profiles p left join public.businesses b on b.id=new.business_id
  where p.profile_id=new.provider_id;
  if selected_currency is null then
    raise exception 'Configurez d’abord le pays, le fuseau horaire et la devise de l’établissement.';
  end if;
  if new.currency is distinct from selected_currency then
    raise exception 'La devise de la prestation doit correspondre à la devise du professionnel ou du salon. Le prix n’a pas été converti.';
  end if;
  return new;
end $$;
drop trigger if exists provider_services_apply_business_currency on public.provider_services;
drop trigger if exists provider_services_enforce_business_currency on public.provider_services;
create trigger provider_services_enforce_business_currency before insert or update of currency on public.provider_services
for each row execute function booking_private.enforce_service_business_currency();
revoke all on function booking_private.enforce_service_business_currency() from public,anon,authenticated;

-- A parent currency cannot be changed while any saved service still carries a
-- different currency. Amounts are never converted implicitly.
create or replace function booking_private.prevent_provider_currency_mismatch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.currency is distinct from old.currency and exists(
    select 1 from public.provider_services s
    where s.provider_id=new.profile_id and s.business_id is null
      and s.currency is distinct from new.currency
  ) then
    raise exception 'Mettez d’abord à jour les tarifs indépendants dans leur devise réelle; aucun montant n’a été converti.';
  end if;
  return new;
end $$;
revoke all on function booking_private.prevent_provider_currency_mismatch() from public,anon,authenticated;
drop trigger if exists provider_profile_currency_consistency on public.provider_profiles;
create trigger provider_profile_currency_consistency before update of currency on public.provider_profiles
for each row execute function booking_private.prevent_provider_currency_mismatch();

create or replace function booking_private.prevent_business_currency_mismatch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.currency is distinct from old.currency and exists(
    select 1 from public.provider_services s
    where s.business_id=new.id and s.currency is distinct from new.currency
  ) then
    raise exception 'Mettez d’abord à jour les tarifs du salon dans leur devise réelle; aucun montant n’a été converti.';
  end if;
  return new;
end $$;
revoke all on function booking_private.prevent_business_currency_mismatch() from public,anon,authenticated;
drop trigger if exists business_currency_consistency on public.businesses;
create trigger business_currency_consistency before update of currency on public.businesses
for each row execute function booking_private.prevent_business_currency_mismatch();

-- Direct Data API updates must use a real timezone identifier too; text length
-- alone is not enough to protect the booking engine from invalid zones.
create or replace function public.validate_global_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.timezone is not null and not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=new.timezone) then
    raise exception 'Fuseau horaire IANA inconnu';
  end if;
  return new;
end $$;
revoke all on function public.validate_global_timezone() from public,anon,authenticated;
drop trigger if exists provider_global_timezone_valid on public.provider_profiles;
create trigger provider_global_timezone_valid before insert or update of timezone on public.provider_profiles
for each row execute function public.validate_global_timezone();
drop trigger if exists business_global_timezone_valid on public.businesses;
create trigger business_global_timezone_valid before insert or update of timezone on public.businesses
for each row execute function public.validate_global_timezone();

commit;
