begin;

create or replace function public.protect_provider_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(current_setting('mata.rating_refresh', true), '') = 'trusted'
    or public.has_admin_permission('providers.verify')
    or public.has_admin_permission('providers.suspend') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.verified_at is not null then
      raise exception 'Un nouveau profil prestataire doit être créé en brouillon';
    end if;
  elsif new.status is distinct from old.status
    or new.verified_at is distinct from old.verified_at
    or new.average_rating is distinct from old.average_rating
    or new.review_count is distinct from old.review_count then
    raise exception 'Les champs de validation et de notation sont administrés par le serveur';
  end if;

  return new;
end;
$$;

commit;
