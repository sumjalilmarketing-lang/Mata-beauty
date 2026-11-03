CREATE OR REPLACE FUNCTION public.sync_provider_service_commercial_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status='published' and not exists(select 1 from public.provider_profiles pp where pp.profile_id=new.provider_id and pp.status='approved') then
    raise exception 'Profil professionnel non approuvé';
  end if;
  new.is_active := new.status = 'published';
  if new.status='published' then new.published_at:=coalesce(new.published_at,now()); end if;
  if new.status='archived' then new.archived_at:=coalesce(new.archived_at,now()); end if;
  return new;
end; $function$
