create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_verified boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.is_admin()
  then
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
    or (old.privacy_accepted_at is not null and new.privacy_accepted_at is distinct from old.privacy_accepted_at)
  then
    raise exception 'Les consentements legaux sont immuables';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.is_admin()
  then
    return new;
  end if;

  if old.role is distinct from new.role then
    raise exception 'Le rôle ne peut pas être modifié depuis le profil';
  end if;

  if old.is_suspended is distinct from new.is_suspended then
    raise exception 'Champ réservé';
  end if;

  return new;
end;
$$;
