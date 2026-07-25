begin;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  business_type text not null default 'salon' check (business_type in ('salon', 'institute', 'mobile_collective')),
  description text check (char_length(description) <= 3000),
  phone text,
  address text not null,
  city text not null default 'Dakar',
  area text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 2 and 100),
  title text,
  avatar_url text,
  is_bookable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, profile_id)
);

create table if not exists public.collaborator_services (
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  provider_service_id uuid not null references public.provider_services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collaborator_id, provider_service_id)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 1000),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (discount_type <> 'percentage' or discount_value <= 100)
);

alter table public.bookings add column if not exists business_id uuid references public.businesses(id) on delete set null;
alter table public.bookings add column if not exists collaborator_id uuid references public.collaborators(id) on delete set null;
alter table public.bookings add column if not exists promotion_id uuid references public.promotions(id) on delete set null;

create index if not exists businesses_owner_status_idx on public.businesses (owner_id, status);
create index if not exists businesses_location_idx on public.businesses (city, area);
create index if not exists collaborators_business_active_idx on public.collaborators (business_id, is_active);
create index if not exists promotions_active_dates_idx on public.promotions (is_active, starts_at, ends_at);

drop trigger if exists businesses_updated on public.businesses;
create trigger businesses_updated before update on public.businesses for each row execute function public.set_updated_at();
drop trigger if exists collaborators_updated on public.collaborators;
create trigger collaborators_updated before update on public.collaborators for each row execute function public.set_updated_at();
drop trigger if exists promotions_updated on public.promotions;
create trigger promotions_updated before update on public.promotions for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;
alter table public.collaborators enable row level security;
alter table public.collaborator_services enable row level security;
alter table public.promotions enable row level security;

create policy "approved businesses public read" on public.businesses for select using (
  status = 'approved' or owner_id = auth.uid() or public.is_admin()
);
create policy "providers manage own businesses" on public.businesses for all using (
  owner_id = auth.uid() or public.is_admin()
) with check (
  owner_id = auth.uid() or public.is_admin()
);

create policy "active collaborators public read" on public.collaborators for select using (
  (is_active and exists (
    select 1 from public.businesses b where b.id = business_id and b.status = 'approved'
  )) or exists (
    select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()
  ) or public.is_admin()
);
create policy "business owners manage collaborators" on public.collaborators for all using (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  or public.is_admin()
) with check (
  exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  or public.is_admin()
);

create policy "collaborator services public read" on public.collaborator_services for select using (
  exists (
    select 1 from public.collaborators c
    join public.businesses b on b.id = c.business_id
    where c.id = collaborator_id and c.is_active and b.status = 'approved'
  ) or public.is_admin()
);
create policy "business owners manage collaborator services" on public.collaborator_services for all using (
  exists (
    select 1 from public.collaborators c
    join public.businesses b on b.id = c.business_id
    where c.id = collaborator_id and b.owner_id = auth.uid()
  ) or public.is_admin()
) with check (
  exists (
    select 1 from public.collaborators c
    join public.businesses b on b.id = c.business_id
    where c.id = collaborator_id and b.owner_id = auth.uid()
  ) or public.is_admin()
);

create policy "active promotions public read" on public.promotions for select using (
  (is_active and starts_at <= now() and ends_at > now())
  or provider_id = auth.uid()
  or public.is_admin()
);
create policy "providers manage own promotions" on public.promotions for all using (
  provider_id = auth.uid() or public.is_admin()
) with check (
  provider_id = auth.uid() or public.is_admin()
);

commit;
