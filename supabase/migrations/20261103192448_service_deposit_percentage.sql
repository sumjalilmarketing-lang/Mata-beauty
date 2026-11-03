-- Additive configuration only. No payment, booking or existing fixed deposit is changed.
set lock_timeout = '5s';
alter table public.provider_services
  add column deposit_percentage smallint not null default 0
  constraint provider_services_deposit_percentage_range check (deposit_percentage between 0 and 60);
comment on column public.provider_services.deposit_percentage is
  'Planned service deposit percentage (0..60); collection requires a separately verified payment flow. Existing bookings are unchanged.';
-- Existing table grants and RLS continue to apply. No additional access is granted.
