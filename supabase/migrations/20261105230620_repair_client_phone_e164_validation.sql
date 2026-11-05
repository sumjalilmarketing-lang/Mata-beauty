-- Correct the literal plus matcher. Preserve the existing ownership and grants.
begin;
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
      and trim(target_phone) !~ '^[+][1-9][0-9]{7,14}$' then raise exception 'Le téléphone doit être au format international E.164'; end if;
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
