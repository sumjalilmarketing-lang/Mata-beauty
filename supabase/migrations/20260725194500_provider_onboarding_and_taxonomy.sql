begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role public.user_role;
  requested_name text;
begin
  requested_role := case
    when new.raw_user_meta_data->>'role' = 'provider' then 'provider'::public.user_role
    else 'client'::public.user_role
  end;
  requested_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, role, display_name)
  values (new.id, requested_role, requested_name);

  if requested_role = 'client' then
    insert into public.client_profiles (profile_id) values (new.id);
  else
    insert into public.provider_profiles (profile_id, business_name, slug)
    values (
      new.id,
      requested_name,
      'provider-' || replace(left(new.id::text, 18), '-', '')
    );
  end if;
  return new;
end;
$$;

create or replace function public.submit_provider_for_review()
returns public.provider_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_status public.provider_status;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  update public.provider_profiles
  set status = 'pending_review', updated_at = now()
  where profile_id = auth.uid()
    and status in ('draft', 'rejected')
    and char_length(trim(business_name)) >= 2
    and char_length(trim(coalesce(bio, ''))) >= 40
    and char_length(trim(city)) >= 2
  returning status into resulting_status;

  if resulting_status is null then
    raise exception 'Le profil doit contenir un nom, une ville et une description d’au moins 40 caractères';
  end if;
  return resulting_status;
end;
$$;

revoke all on function public.submit_provider_for_review() from public;
grant execute on function public.submit_provider_for_review() to authenticated;

create or replace function public.protect_provider_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.verified_at is not null then
      raise exception 'Un nouveau profil prestataire doit être créé en brouillon';
    end if;
  elsif new.verified_at is distinct from old.verified_at
    or new.average_rating is distinct from old.average_rating
    or new.review_count is distinct from old.review_count then
    raise exception 'Les champs de validation et de notation sont administrés par le serveur';
  elsif new.status is distinct from old.status
    and not (
      auth.uid() = old.profile_id
      and old.status in ('draft', 'rejected')
      and new.status = 'pending_review'
    ) then
    raise exception 'Cette transition de validation nécessite un administrateur';
  end if;
  return new;
end;
$$;

insert into public.categories (name, slug, description, icon, sort_order)
values
  ('Coiffure femme', 'coiffure-femme', 'Coiffure, brushing et soins capillaires.', '✦', 10),
  ('Tresses africaines', 'tresses-africaines', 'Braids, vanilles et tresses traditionnelles.', '≋', 20),
  ('Locks', 'locks', 'Création et entretien des locks.', '◌', 30),
  ('Maquillage', 'maquillage', 'Maquillage événementiel et mariée.', '♢', 40),
  ('Onglerie', 'onglerie', 'Manucure, pédicure et nail art.', '◐', 50),
  ('Cils et sourcils', 'cils-sourcils', 'Extensions de cils et mise en beauté du regard.', '⌁', 60),
  ('Barbier', 'barbier', 'Coupe homme, contours et entretien de la barbe.', '✂', 70),
  ('Soins du visage', 'soins-visage', 'Soins, nettoyage et bien-être du visage.', '♡', 80)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.services (category_id, name, slug, description)
select category.id, seed.name, seed.slug, seed.description
from (
  values
    ('coiffure-femme', 'Coiffure signature', 'coiffure-signature', 'Coiffure personnalisée selon le style souhaité.'),
    ('tresses-africaines', 'Tresses africaines', 'tresses-africaines', 'Tresses avec diagnostic et finition.'),
    ('locks', 'Entretien de locks', 'entretien-locks', 'Reprise des racines et coiffage.'),
    ('maquillage', 'Maquillage événement', 'maquillage-evenement', 'Mise en beauté pour cérémonie ou événement.'),
    ('onglerie', 'Manucure complète', 'manucure-complete', 'Soin des mains et pose de vernis.'),
    ('cils-sourcils', 'Mise en beauté du regard', 'beaute-regard', 'Prestation cils ou sourcils personnalisée.'),
    ('barbier', 'Coupe et barbe', 'coupe-barbe', 'Coupe, contours et taille de barbe.'),
    ('soins-visage', 'Soin du visage', 'soin-visage', 'Nettoyage et soin adaptés au type de peau.')
) as seed(category_slug, name, slug, description)
join public.categories category on category.slug = seed.category_slug
on conflict (category_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

commit;
