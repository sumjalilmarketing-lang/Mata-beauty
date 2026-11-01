-- Relie chaque réservation issue du feed à sa vidéo source sans faire confiance au navigateur.

alter table public.bookings
  add column if not exists source_post_id uuid references public.posts(id) on delete set null;

create index if not exists bookings_source_post_created_idx
  on public.bookings(source_post_id, created_at desc)
  where source_post_id is not null;

create or replace function public.validate_social_booking_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_post_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.posts post
    join public.post_services post_service
      on post_service.post_id = post.id
     and post_service.provider_service_id = new.provider_service_id
     and post_service.is_primary
    join public.provider_services service
      on service.id = new.provider_service_id
     and service.provider_id = post.author_id
     and service.is_active
    where post.id = new.source_post_id
      and post.status = 'published'
      and post.visibility = 'public'
  ) then
    raise exception 'Source sociale invalide pour cette prestation';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_social_booking_source() from public, anon, authenticated;

drop trigger if exists bookings_validate_social_source on public.bookings;
create trigger bookings_validate_social_source
before insert on public.bookings
for each row execute function public.validate_social_booking_source();

create or replace function public.protect_booking_source_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source_post_id is distinct from new.source_post_id
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and not public.is_admin()
  then
    raise exception 'La source d acquisition d une réservation est immuable';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_booking_source_attribution() from public, anon, authenticated;

drop trigger if exists bookings_protect_social_source on public.bookings;
create trigger bookings_protect_social_source
before update of source_post_id on public.bookings
for each row execute function public.protect_booking_source_attribution();

create or replace function public.provider_social_conversion_summary(
  target_from timestamptz default now() - interval '30 days',
  target_to timestamptz default now()
)
returns table (
  post_id uuid,
  booking_count bigint,
  active_booking_count bigint,
  completed_booking_count bigint,
  gross_amount bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if target_to <= target_from or target_to - target_from > interval '366 days' then
    raise exception 'Période invalide';
  end if;
  if not exists (select 1 from public.provider_profiles where profile_id = auth.uid()) then
    raise exception 'Compte professionnel requis';
  end if;

  return query
  select
    post.id,
    count(booking.id),
    count(booking.id) filter (where booking.status in ('pending', 'confirmed', 'in_progress')),
    count(booking.id) filter (where booking.status = 'completed'),
    coalesce(sum(booking.total_amount) filter (
      where booking.status not in ('declined', 'cancelled_by_client', 'cancelled_by_provider')
    ), 0)::bigint
  from public.posts post
  left join public.bookings booking
    on booking.source_post_id = post.id
   and booking.created_at >= target_from
   and booking.created_at < target_to
  where post.author_id = auth.uid()
  group by post.id
  order by count(booking.id) desc, post.id;
end;
$$;

revoke all on function public.provider_social_conversion_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.provider_social_conversion_summary(timestamptz, timestamptz) to authenticated;

comment on column public.bookings.source_post_id is
  'Vidéo publiée ayant déclenché la réservation. Validée côté serveur et immuable pour les utilisateurs.';
comment on function public.provider_social_conversion_summary(timestamptz, timestamptz) is
  'Métriques de conversion des vidéos du professionnel connecté; ne retourne jamais les données d un autre professionnel.';
