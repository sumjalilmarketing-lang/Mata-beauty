begin;
set local lock_timeout = '5s';
-- Removed offers must not reserve a catalogue identity forever.
-- Preserve all historical rows and foreign keys; only live catalogue entries remain unique.
create unique index provider_services_unarchived_identity_uidx
  on public.provider_services(provider_id, service_id, title)
  where archived_at is null;
alter table public.provider_services
  drop constraint provider_services_provider_id_service_id_title_key;
commit;
