-- Répare les projets distants où le trigger de notification de réservation a dérivé.
create or replace function public.notify_booking_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (profile_id, kind, title, body, data)
  values (
    new.provider_id,
    'booking_created',
    'Nouvelle demande de réservation',
    'Une nouvelle réservation attend votre réponse.',
    jsonb_build_object('booking_id', new.id, 'source_post_id', new.source_post_id)
  );
  return new;
end;
$$;

drop trigger if exists bookings_notify_created on public.bookings;
create trigger bookings_notify_created
after insert on public.bookings
for each row execute function public.notify_booking_created();

revoke all on function public.notify_booking_created() from public, anon, authenticated;
comment on function public.notify_booking_created() is 'Notifie le prestataire après chaque réservation créée, y compris depuis Inspiration.';
