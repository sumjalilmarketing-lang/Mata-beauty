create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_verified boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'Impossible de modifier son propre rôle';
  end if;
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'Le changement de rôle nécessite un Super Admin';
  end if;
  if new.is_suspended is distinct from old.is_suspended
    and not public.has_admin_permission('users.suspend')
  then
    raise exception 'Permission users.suspend requise';
  end if;

  if new.account_status is distinct from old.account_status then
    if old.account_status = 'email_unverified' and new.account_status = 'active' then
      select email_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    elsif old.account_status = 'phone_unverified' and new.account_status = 'active' then
      select phone_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    end if;
    if not identity_verified then
      raise exception 'Transition de compte interdite ou identité non vérifiée';
    end if;
  end if;

  if (old.terms_accepted_at is not null and new.terms_accepted_at is distinct from old.terms_accepted_at)
    or (old.privacy_accepted_at is not null and new.privacy_accepted_at is distinct from old.privacy_accepted_at)
  then
    raise exception 'Les consentements légaux sont immuables';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

-- Keep public identity readable, but never expose contact details, birth date,
-- legal acceptance timestamps or marketing choices through the public profile row.
revoke select on public.profiles from public,anon,authenticated;
revoke select (phone,birth_date,terms_accepted_at,privacy_accepted_at,marketing_consent,marketing_consent_updated_at) on public.profiles from public,anon,authenticated;
grant select (id,role,display_name,avatar_url,country_code,locale,is_suspended,created_at,updated_at,first_name,last_name,account_status,username,bio) on public.profiles to anon,authenticated;
-- Restore the already versioned guard missing from the production trigger set.
drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges before update on public.profiles for each row execute function public.protect_profile_privileges();
