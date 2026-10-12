-- Keep the provider location fields used by public profile/feed experiences
-- available in environments that were provisioned from older schemas.
alter table public.provider_profiles
  add column if not exists area text,
  add column if not exists location_verified_at timestamptz;
