begin;
alter table public.bookings drop constraint bookings_no_active_resource_overlap;
alter table public.bookings add constraint bookings_no_active_resource_overlap exclude using gist (
  provider_id with =,
  (coalesce(collaborator_id,provider_id)) with =,
  tstzrange(starts_at,coalesce(resource_busy_until,ends_at),'[)') with &&
) where(status in ('pending','confirmed','in_progress'));
commit;
