-- Additive catalog parity for older installations (including isolated QA).
-- Existing production columns, option policies and distance helper are retained.
-- This does not replace the catalog pricing contract or simulate payments.
begin;

alter table public.provider_services
  add column if not exists status text not null default 'published'
    check (status in ('draft','published','paused','sold_out','archived','hidden')),
  add column if not exists cover_url text,
  add column if not exists location_modes text[] not null default array['salon']::text[]
    check (location_modes <@ array['salon','client_address']::text[] and cardinality(location_modes)>0),
  add column if not exists home_price_amount integer check (home_price_amount>=0),
  add column if not exists travel_fee_amount integer not null default 0 check (travel_fee_amount>=0),
  add column if not exists deposit_amount integer not null default 0 check (deposit_amount>=0),
  add column if not exists home_service_radius_km integer check (home_service_radius_km between 0 and 500),
  add column if not exists travel_fee_per_km_amount integer check (travel_fee_per_km_amount between 0 and 100000),
  add column if not exists free_travel_radius_km numeric check (free_travel_radius_km between 0 and 500);

alter table public.provider_profiles
  add column if not exists location_place_id text,
  add column if not exists travel_fee_per_km_amount integer not null default 0 check (travel_fee_per_km_amount between 0 and 100000),
  add column if not exists free_travel_radius_km numeric not null default 0 check (free_travel_radius_km between 0 and 500);

alter table public.businesses
  add column if not exists location_place_id text,
  add column if not exists service_radius_km integer check (service_radius_km between 0 and 500),
  add column if not exists travel_fee_per_km_amount integer not null default 0 check (travel_fee_per_km_amount between 0 and 100000),
  add column if not exists free_travel_radius_km numeric not null default 0 check (free_travel_radius_km between 0 and 500);

alter table public.bookings
  add column if not exists selected_option_ids uuid[] not null default '{}'::uuid[],
  add column if not exists base_amount integer,
  add column if not exists options_amount integer not null default 0,
  add column if not exists discount_amount integer not null default 0,
  add column if not exists deposit_amount integer not null default 0,
  add column if not exists appointment_place_id text,
  add column if not exists appointment_latitude double precision,
  add column if not exists appointment_longitude double precision,
  add column if not exists travel_distance_km numeric,
  add column if not exists distance_travel_fee_amount integer not null default 0 check (distance_travel_fee_amount>=0);

-- Do not broaden or replace existing production policies. A missing table gets
-- its own conservative owner-management and published-approved-read policies.
do $compat$ begin
  if to_regclass('public.service_options') is null then
    create table public.service_options (
      id uuid primary key default gen_random_uuid(),
      provider_service_id uuid not null references public.provider_services(id) on delete cascade,
      name text not null check (char_length(name) between 2 and 120),
      description text check (char_length(description)<=1000),
      price_amount integer not null default 0 check (price_amount>=0),
      duration_minutes integer not null default 0 check (duration_minutes between 0 and 360),
      is_required boolean not null default false,
      is_active boolean not null default true,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index service_options_provider_service_idx on public.service_options(provider_service_id);
    alter table public.service_options enable row level security;
    create policy service_options_catalog_read on public.service_options for select to anon,authenticated
      using (exists(select 1 from public.provider_services ps join public.provider_profiles pp on pp.profile_id=ps.provider_id
        where ps.id=provider_service_id and ps.status='published' and ps.is_active and ps.archived_at is null
          and pp.status='approved'));
    create policy service_options_owner_manage on public.service_options for all to authenticated
      using (exists(select 1 from public.provider_services ps join public.profiles p on p.id=ps.provider_id
        where ps.id=provider_service_id and ps.provider_id=auth.uid() and p.account_status='active' and not p.is_suspended))
      with check (exists(select 1 from public.provider_services ps join public.profiles p on p.id=ps.provider_id
        where ps.id=provider_service_id and ps.provider_id=auth.uid() and p.account_status='active' and not p.is_suspended));
    revoke all on public.service_options from public,anon,authenticated;
    grant select on public.service_options to anon;
    grant select,insert,update,delete on public.service_options to authenticated;
    grant all on public.service_options to service_role;
  end if;
end $compat$;

-- Exact audited production geographic helper, created only when absent.
do $compat$ begin
  if to_regprocedure('public.distance_km(double precision,double precision,double precision,double precision)') is null then
    execute $definition$
      create function public.distance_km(lat1 double precision,lng1 double precision,lat2 double precision,lng2 double precision)
      returns double precision language sql immutable strict set search_path='' as $body$
        select 6371.0088 * 2 * asin(least(1::double precision,sqrt(
          power(sin(radians(lat2-lat1)/2),2) + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)
        )));
      $body$;
    $definition$;
  end if;
end $compat$;
notify pgrst,'reload schema';
commit;
