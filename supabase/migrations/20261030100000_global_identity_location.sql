begin;

-- Existing profile locations are retained verbatim. A missing location is now
-- represented as unknown instead of being silently assigned to Senegal.
alter table public.profiles alter column country_code drop default;
alter table public.profiles alter column country_code drop not null;
alter table public.profiles alter column locale drop default;
alter table public.profiles alter column locale drop not null;
alter table public.client_profiles add column if not exists region text;

create or replace function public.capture_global_signup_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  country text := upper(nullif(trim(new.raw_user_meta_data->>'country_code'), ''));
  locale_value text := nullif(trim(new.raw_user_meta_data->>'locale'), '');
  region_value text := nullif(trim(new.raw_user_meta_data->>'region'), '');
  city_value text := nullif(trim(new.raw_user_meta_data->>'city'), '');
  phone_value text := nullif(trim(new.raw_user_meta_data->>'phone_e164'), '');
begin
  if country !~ '^[A-Z]{2}$' then country := null; end if;
  if locale_value !~ '^[a-z]{2,3}(-[A-Z]{2})?$' then locale_value := null; end if;
  if phone_value !~ '^\+[1-9][0-9]{7,14}$' then phone_value := null; end if;
  update public.profiles
    set country_code = country,
        locale = locale_value,
        phone = coalesce(nullif(new.phone, ''), phone_value, phone),
        updated_at = now()
    where id = new.id;
  insert into public.client_profiles(profile_id,city,region)
    values(new.id,left(city_value,120),left(region_value,120))
    on conflict(profile_id) do update set city=excluded.city,region=excluded.region,updated_at=now();
  return new;
end;
$$;

revoke all on function public.capture_global_signup_metadata() from public, anon, authenticated;
drop trigger if exists zz_capture_global_signup_metadata on auth.users;
create trigger zz_capture_global_signup_metadata
after insert on auth.users
for each row execute function public.capture_global_signup_metadata();

create or replace function public.update_client_identity_global(
  target_first_name text,target_last_name text,target_username text,target_phone text,target_bio text,
  target_city text,target_neighborhood text,target_locale text,target_country_code text,target_region text
) returns void language plpgsql security definer set search_path = '' as $$
declare country_value text := upper(trim(coalesce(target_country_code,''))); previous_phone text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_username !~ '^[a-zA-Z0-9_]{3,30}$' then raise exception 'Nom d’utilisateur invalide'; end if;
  if country_value !~ '^[A-Z]{2}$' then raise exception 'Code pays ISO invalide'; end if;
  if coalesce(target_locale,'') !~ '^[a-z]{2,3}-[A-Z]{2}$' or right(coalesce(target_locale,''),2)<>country_value then raise exception 'Langue ou pays invalide'; end if;
  select phone into previous_phone from public.profiles where id=auth.uid();
  if nullif(trim(target_phone),'') is distinct from previous_phone and nullif(trim(target_phone),'') is not null
      and trim(target_phone) !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Le téléphone doit être au format international E.164'; end if;
  update public.profiles set first_name=nullif(trim(target_first_name),''),last_name=nullif(trim(target_last_name),''),
    display_name=trim(concat_ws(' ',target_first_name,target_last_name)),username=lower(target_username),
    phone=nullif(trim(target_phone),''),bio=nullif(trim(target_bio),''),locale=target_locale,country_code=country_value,updated_at=now()
    where id=auth.uid();
  insert into public.client_profiles(profile_id,city,neighborhood,region)
    values(auth.uid(),nullif(trim(target_city),''),nullif(trim(target_neighborhood),''),nullif(trim(target_region),''))
    on conflict(profile_id) do update set city=excluded.city,neighborhood=excluded.neighborhood,region=excluded.region,updated_at=now();
exception when unique_violation then raise exception 'Ce nom d’utilisateur est déjà utilisé';
end $$;
revoke all on function public.update_client_identity_global(text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_client_identity_global(text,text,text,text,text,text,text,text,text,text) to authenticated;

commit;
