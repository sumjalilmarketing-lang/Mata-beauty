begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.user_role as enum ('client', 'provider', 'admin');
create type public.provider_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'suspended');
create type public.booking_status as enum ('pending', 'confirmed', 'declined', 'cancelled_by_client', 'cancelled_by_provider', 'in_progress', 'completed', 'no_show', 'disputed');
create type public.payment_status as enum ('pending', 'simulated_paid', 'paid_on_site', 'failed', 'refunded');
create type public.payment_method as enum ('on_site', 'orange_money', 'wave', 'card');
create type public.document_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'client',
  display_name text,
  phone text,
  avatar_url text,
  country_code char(2) not null default 'SN',
  locale text not null default 'fr-SN',
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  default_address text,
  city text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  bio text,
  status public.provider_status not null default 'draft',
  cover_url text,
  years_experience integer not null default 0 check (years_experience between 0 and 80),
  service_mode text not null default 'salon' check (service_mode in ('salon', 'mobile', 'both')),
  base_address text,
  city text not null default 'Dakar',
  latitude double precision,
  longitude double precision,
  average_rating numeric(2,1) not null default 0 check (average_rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  kind text not null check (kind in ('identity', 'business_registration', 'qualification', 'address_proof')),
  storage_path text not null,
  status public.document_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider_id, kind, storage_path)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_categories (
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider_id, category_id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create table public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  title text not null,
  description text,
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  price_amount integer not null check (price_amount >= 0),
  currency char(3) not null default 'XOF',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, service_id, title)
);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  city text not null,
  area_name text not null,
  travel_fee_amount integer not null default 0 check (travel_fee_amount >= 0),
  currency char(3) not null default 'XOF',
  created_at timestamptz not null default now(),
  unique (provider_id, city, area_name)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 15 and 240),
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  unique (provider_id, weekday, starts_at, ends_at)
);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_available boolean not null default false,
  reason text,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.client_profiles(profile_id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(profile_id) on delete restrict,
  provider_service_id uuid not null references public.provider_services(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'pending',
  location_mode text not null check (location_mode in ('salon', 'client_address')),
  appointment_address text,
  total_amount integer not null check (total_amount >= 0),
  currency char(3) not null default 'XOF',
  client_note text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

alter table public.bookings add constraint bookings_no_active_overlap
exclude using gist (
  provider_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
)
where (status in ('pending', 'confirmed', 'in_progress'));

create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table public.favorites (
  client_id uuid not null references public.client_profiles(profile_id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, provider_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  client_id uuid not null references public.client_profiles(profile_id) on delete restrict,
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  provider_reply text check (char_length(provider_reply) <= 2000),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  reported_profile_id uuid references public.profiles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  amount integer not null check (amount >= 0),
  currency char(3) not null default 'XOF',
  provider_reference text,
  is_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_commissions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  rate numeric(5,2) not null check (rate between 0 and 100),
  amount integer not null check (amount >= 0),
  currency char(3) not null default 'XOF',
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index provider_profiles_search_idx on public.provider_profiles (status, city, average_rating desc);
create index provider_services_provider_active_idx on public.provider_services (provider_id, is_active);
create index bookings_client_start_idx on public.bookings (client_id, starts_at desc);
create index bookings_provider_start_idx on public.bookings (provider_id, starts_at desc);
create index availability_exceptions_provider_idx on public.availability_exceptions (provider_id, starts_at);
create index reviews_provider_visible_idx on public.reviews (provider_id, is_visible, created_at desc);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index notifications_profile_unread_idx on public.notifications (profile_id, read_at, created_at desc);
create index reports_status_idx on public.reports (status, created_at);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_suspended
  );
$$;

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = target_conversation_id and profile_id = auth.uid()
  );
$$;

create or replace function public.validate_booking_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.client_id is distinct from old.client_id
    or new.provider_id is distinct from old.provider_id
    or new.provider_service_id is distinct from old.provider_service_id
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.total_amount is distinct from old.total_amount
    or new.currency is distinct from old.currency then
    raise exception 'Les données contractuelles de la réservation sont immuables';
  end if;
  if auth.uid() = old.client_id then
    if new.status <> 'cancelled_by_client' or old.status not in ('pending', 'confirmed') then
      raise exception 'Transition de statut client interdite';
    end if;
  elsif auth.uid() = old.provider_id then
    if new.status not in ('confirmed', 'declined', 'cancelled_by_provider', 'in_progress', 'completed', 'no_show', 'disputed') then
      raise exception 'Transition de statut prestataire interdite';
    end if;
  else
    raise exception 'Modification de réservation interdite';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_role public.user_role;
begin
  requested_role := case when new.raw_user_meta_data->>'role' = 'provider' then 'provider'::public.user_role else 'client'::public.user_role end;
  insert into public.profiles (id, role, display_name)
  values (new.id, requested_role, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  if requested_role = 'client' then insert into public.client_profiles (profile_id) values (new.id); end if;
  return new;
end;
$$;

create or replace function public.record_booking_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status else null end, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger clients_updated before update on public.client_profiles for each row execute function public.set_updated_at();
create trigger providers_updated before update on public.provider_profiles for each row execute function public.set_updated_at();
create trigger services_updated before update on public.services for each row execute function public.set_updated_at();
create trigger provider_services_updated before update on public.provider_services for each row execute function public.set_updated_at();
create trigger bookings_updated before update on public.bookings for each row execute function public.set_updated_at();
create trigger bookings_validate before update on public.bookings for each row execute function public.validate_booking_update();
create trigger booking_status_recorded after insert or update of status on public.bookings for each row execute function public.record_booking_status();
create trigger reviews_updated before update on public.reviews for each row execute function public.set_updated_at();
create trigger conversations_updated before update on public.conversations for each row execute function public.set_updated_at();
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.client_profiles enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.provider_documents enable row level security;
alter table public.categories enable row level security;
alter table public.provider_categories enable row level security;
alter table public.services enable row level security;
alter table public.provider_services enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.service_areas enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.payments enable row level security;
alter table public.platform_commissions enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles public approved providers or self" on public.profiles for select using (
  id = auth.uid() or public.is_admin() or exists (
    select 1 from public.provider_profiles pp where pp.profile_id = profiles.id and pp.status = 'approved'
  )
);
create policy "profiles update self or admin" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "client profile own or admin" on public.client_profiles for all using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());
create policy "approved providers readable" on public.provider_profiles for select using (status = 'approved' or profile_id = auth.uid() or public.is_admin());
create policy "providers manage own profile" on public.provider_profiles for all using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());
create policy "provider documents own or admin" on public.provider_documents for all using (provider_id = auth.uid() or public.is_admin()) with check (provider_id = auth.uid() or public.is_admin());
create policy "categories public read" on public.categories for select using (is_active or public.is_admin());
create policy "categories admin write" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "provider categories public read" on public.provider_categories for select using (true);
create policy "provider categories owner write" on public.provider_categories for all using (provider_id = auth.uid() or public.is_admin()) with check (provider_id = auth.uid() or public.is_admin());
create policy "services public read" on public.services for select using (is_active or public.is_admin());
create policy "services admin write" on public.services for all using (public.is_admin()) with check (public.is_admin());
create policy "provider services public read" on public.provider_services for select using (is_active or provider_id = auth.uid() or public.is_admin());
create policy "provider services owner write" on public.provider_services for all using (provider_id = auth.uid() or public.is_admin()) with check (provider_id = auth.uid() or public.is_admin());
create policy "portfolio public read" on public.portfolio_items for select using (true);
create policy "portfolio owner write" on public.portfolio_items for all using (provider_id = auth.uid() or public.is_admin()) with check (provider_id = auth.uid() or public.is_admin());
create policy "areas public read" on public.service_areas for select using (true);
create policy "areas owner write" on public.service_areas for all using (provider_id = auth.uid() or public.is_admin()) with check (provider_id = auth.uid() or public.is_admin());
create policy "availability public read" on public.availability_rules for select using (true);
create policy "availability owner write" on public.availability_rules for all using (provider_id = auth.uid() or public.is_admin()) with check (provider_id = auth.uid() or public.is_admin());
create policy "exceptions public read" on public.availability_exceptions for select using (true);
create policy "exceptions owner write" on public.availability_exceptions for all using (provider_id = auth.uid() or public.is_admin()) with check (provider_id = auth.uid() or public.is_admin());
create policy "booking members read" on public.bookings for select using (client_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "clients create bookings" on public.bookings for insert with check (client_id = auth.uid() and status = 'pending');
create policy "booking members update" on public.bookings for update using (client_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "booking history members read" on public.booking_status_history for select using (exists (select 1 from public.bookings b where b.id = booking_id and (b.client_id = auth.uid() or b.provider_id = auth.uid())) or public.is_admin());
create policy "favorites own" on public.favorites for all using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "visible reviews public" on public.reviews for select using (is_visible or client_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "completed client review" on public.reviews for insert with check (client_id = auth.uid() and exists (select 1 from public.bookings b where b.id = booking_id and b.client_id = auth.uid() and b.provider_id = provider_id and b.status = 'completed'));
create policy "review participants update" on public.reviews for update using (client_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "conversation members read" on public.conversations for select using (public.is_conversation_member(id) or public.is_admin());
create policy "memberships member read" on public.conversation_members for select using (public.is_conversation_member(conversation_id) or public.is_admin());
create policy "messages member read" on public.messages for select using (public.is_conversation_member(conversation_id) or public.is_admin());
create policy "messages member insert" on public.messages for insert with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));
create policy "notifications own" on public.notifications for select using (profile_id = auth.uid() or public.is_admin());
create policy "notifications own update" on public.notifications for update using (profile_id = auth.uid() or public.is_admin());
create policy "reports reporter or admin read" on public.reports for select using (reporter_id = auth.uid() or public.is_admin());
create policy "reports authenticated create" on public.reports for insert with check (reporter_id = auth.uid());
create policy "reports admin update" on public.reports for update using (public.is_admin());
create policy "payments booking members read" on public.payments for select using (exists (select 1 from public.bookings b where b.id = booking_id and (b.client_id = auth.uid() or b.provider_id = auth.uid())) or public.is_admin());
create policy "payments client create test" on public.payments for insert with check (is_test and exists (select 1 from public.bookings b where b.id = booking_id and b.client_id = auth.uid()));
create policy "commissions admin or provider read" on public.platform_commissions for select using (public.is_admin() or exists (select 1 from public.payments p join public.bookings b on b.id = p.booking_id where p.id = payment_id and b.provider_id = auth.uid()));
create policy "audit admin read" on public.audit_logs for select using (public.is_admin());

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('portfolios', 'portfolios', true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('provider-documents', 'provider-documents', false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

create policy "public avatar reads" on storage.objects for select using (bucket_id in ('avatars', 'portfolios'));
create policy "users upload own avatars" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "providers manage own portfolios" on storage.objects for all using (bucket_id = 'portfolios' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'portfolios' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "providers manage own documents" on storage.objects for all using (bucket_id = 'provider-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())) with check (bucket_id = 'provider-documents' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
