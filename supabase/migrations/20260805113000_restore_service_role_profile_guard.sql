create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
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
