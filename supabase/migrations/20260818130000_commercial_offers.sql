begin;

alter table public.provider_services
  add column if not exists status text not null default 'published',
  add column if not exists cover_url text,
  add column if not exists pricing_mode text not null default 'fixed',
  add column if not exists price_from_amount integer,
  add column if not exists preparation_minutes integer not null default 0,
  add column if not exists location_modes text[] not null default array['salon']::text[],
  add column if not exists home_price_amount integer,
  add column if not exists travel_fee_amount integer not null default 0,
  add column if not exists deposit_amount integer not null default 0,
  add column if not exists cancellation_policy text,
  add column if not exists client_instructions text,
  add column if not exists capacity integer not null default 1,
  add column if not exists published_at timestamptz;

update public.provider_services
set status = case when archived_at is not null then 'archived' when is_active then 'published' else 'paused' end,
    published_at = case when is_active then coalesce(published_at, created_at) else published_at end;

alter table public.provider_services drop constraint if exists provider_services_status_check;
alter table public.provider_services add constraint provider_services_status_check
  check (status in ('draft','published','paused','sold_out','archived','hidden'));
alter table public.provider_services drop constraint if exists provider_services_pricing_mode_check;
alter table public.provider_services add constraint provider_services_pricing_mode_check
  check (pricing_mode in ('fixed','from','variable','option_based'));
alter table public.provider_services drop constraint if exists provider_services_commercial_amounts_check;
alter table public.provider_services add constraint provider_services_commercial_amounts_check check (
  coalesce(price_from_amount, 0) >= 0 and coalesce(home_price_amount, 0) >= 0
  and travel_fee_amount >= 0 and deposit_amount >= 0 and deposit_amount <= greatest(price_amount, coalesce(home_price_amount, price_amount))
  and preparation_minutes between 0 and 240 and capacity between 1 and 100
  and location_modes <@ array['salon','client_address']::text[] and cardinality(location_modes) > 0
);

create table if not exists public.service_options (
  id uuid primary key default gen_random_uuid(),
  provider_service_id uuid not null references public.provider_services(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text check (char_length(description) <= 1000),
  price_amount integer not null default 0 check (price_amount >= 0),
  duration_minutes integer not null default 0 check (duration_minutes between 0 and 360),
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promotions
  add column if not exists provider_service_id uuid references public.provider_services(id) on delete cascade,
  add column if not exists promotional_price_amount integer,
  add column if not exists max_uses integer,
  add column if not exists used_count integer not null default 0,
  add column if not exists new_clients_only boolean not null default false,
  add column if not exists audience text not null default 'all',
  add column if not exists promo_code text,
  add column if not exists status text not null default 'published';
alter table public.promotions drop constraint if exists promotions_commercial_check;
alter table public.promotions add constraint promotions_commercial_check check (
  (promotional_price_amount is null or promotional_price_amount >= 0)
  and (max_uses is null or max_uses > 0) and used_count >= 0
  and audience in ('all','followers','new_clients')
  and status in ('draft','published','paused','archived')
);
create unique index if not exists promotions_provider_code_unique
  on public.promotions(provider_id, lower(promo_code)) where promo_code is not null and status <> 'archived';

create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(profile_id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 2000),
  normal_price_amount integer not null check (normal_price_amount >= 0),
  package_price_amount integer not null check (package_price_amount >= 0),
  duration_minutes integer not null check (duration_minutes between 15 and 1440),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (package_price_amount <= normal_price_amount),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.service_package_items (
  package_id uuid not null references public.service_packages(id) on delete cascade,
  provider_service_id uuid not null references public.provider_services(id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 20),
  primary key (package_id, provider_service_id)
);

alter table public.collaborators add column if not exists commercial_permissions text[] not null default '{}'::text[];
alter table public.collaborators drop constraint if exists collaborators_commercial_permissions_check;
alter table public.collaborators add constraint collaborators_commercial_permissions_check check (
  commercial_permissions <@ array['service.read','service.create','service.update','service.publish','service.archive','pricing.update','promotion.create','promotion.update','promotion.publish']::text[]
);

alter table public.bookings
  add column if not exists selected_option_ids uuid[] not null default '{}'::uuid[],
  add column if not exists base_amount integer,
  add column if not exists options_amount integer not null default 0,
  add column if not exists discount_amount integer not null default 0,
  add column if not exists deposit_amount integer not null default 0;

create index if not exists provider_services_owner_status_idx on public.provider_services(provider_id, status, created_at desc);
create index if not exists provider_services_business_status_idx on public.provider_services(business_id, status) where business_id is not null;
create index if not exists service_options_service_active_idx on public.service_options(provider_service_id, is_active, sort_order);
create index if not exists promotions_service_dates_idx on public.promotions(provider_service_id, status, starts_at, ends_at);
create index if not exists service_packages_owner_status_idx on public.service_packages(provider_id, status);

drop trigger if exists service_options_updated on public.service_options;
create trigger service_options_updated before update on public.service_options for each row execute function public.set_updated_at();
drop trigger if exists service_packages_updated on public.service_packages;
create trigger service_packages_updated before update on public.service_packages for each row execute function public.set_updated_at();

create or replace function public.has_business_commercial_permission(target_business_id uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.businesses b where b.id=target_business_id and b.owner_id=auth.uid() and b.archived_at is null)
    or exists(select 1 from public.collaborators c where c.business_id=target_business_id and c.profile_id=auth.uid() and c.is_active and c.archived_at is null and required_permission=any(c.commercial_permissions));
$$;
revoke all on function public.has_business_commercial_permission(uuid,text) from public;
grant execute on function public.has_business_commercial_permission(uuid,text) to authenticated, service_role;

create or replace function public.sync_provider_service_commercial_status()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='published' and not exists(select 1 from public.provider_profiles pp where pp.profile_id=new.provider_id and pp.status='approved') then
    raise exception 'Profil professionnel non approuvé';
  end if;
  new.is_active := new.status = 'published';
  if new.status='published' then new.published_at:=coalesce(new.published_at,now()); end if;
  if new.status='archived' then new.archived_at:=coalesce(new.archived_at,now()); end if;
  return new;
end; $$;
drop trigger if exists provider_services_sync_commercial_status on public.provider_services;
create trigger provider_services_sync_commercial_status before insert or update of status on public.provider_services
for each row execute function public.sync_provider_service_commercial_status();

alter table public.service_options enable row level security;
alter table public.service_packages enable row level security;
alter table public.service_package_items enable row level security;

drop policy if exists "provider services scoped read" on public.provider_services;
create policy "provider services scoped read" on public.provider_services for select using (
  (status='published' and is_active and archived_at is null)
  or provider_id=auth.uid()
  or (business_id is not null and public.has_business_commercial_permission(business_id,'service.read'))
  or public.has_admin_permission('categories.manage')
);
drop policy if exists "provider services scoped write" on public.provider_services;
create policy "provider services scoped write" on public.provider_services for all using (
  (provider_id=auth.uid() and (business_id is null or exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid())))
  or (business_id is not null and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=provider_id) and public.has_business_commercial_permission(business_id,'service.update'))
  or public.has_admin_permission('categories.manage')
) with check (
  (provider_id=auth.uid() and (business_id is null or exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid())))
  or (business_id is not null and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=provider_id) and public.has_business_commercial_permission(business_id,'service.update'))
  or public.has_admin_permission('categories.manage')
);

create policy "published service options read" on public.service_options for select using (
  exists(select 1 from public.provider_services ps where ps.id=provider_service_id and ((ps.status='published' and ps.is_active) or ps.provider_id=auth.uid() or (ps.business_id is not null and public.has_business_commercial_permission(ps.business_id,'service.read'))))
);
create policy "service owners manage options" on public.service_options for all using (
  exists(select 1 from public.provider_services ps where ps.id=provider_service_id and (ps.provider_id=auth.uid() or (ps.business_id is not null and public.has_business_commercial_permission(ps.business_id,'pricing.update'))))
) with check (
  exists(select 1 from public.provider_services ps where ps.id=provider_service_id and (ps.provider_id=auth.uid() or (ps.business_id is not null and public.has_business_commercial_permission(ps.business_id,'pricing.update'))))
);
create policy "published packages read" on public.service_packages for select using (
  (status='published' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())) or provider_id=auth.uid() or public.has_admin_permission('categories.manage')
);
create policy "package owners manage" on public.service_packages for all using (
  (provider_id=auth.uid() and (business_id is null or exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()))) or (business_id is not null and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=provider_id) and public.has_business_commercial_permission(business_id,'pricing.update')) or public.has_admin_permission('categories.manage')
) with check (
  (provider_id=auth.uid() and (business_id is null or exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()))) or (business_id is not null and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=provider_id) and public.has_business_commercial_permission(business_id,'pricing.update')) or public.has_admin_permission('categories.manage')
);
create policy "package items scoped read" on public.service_package_items for select using (
  exists(select 1 from public.service_packages p where p.id=package_id and (p.status='published' or p.provider_id=auth.uid()))
);
create policy "package owners manage items" on public.service_package_items for all using (
  exists(select 1 from public.service_packages p where p.id=package_id and (p.provider_id=auth.uid() or (p.business_id is not null and public.has_business_commercial_permission(p.business_id,'pricing.update'))))
) with check (
  exists(select 1 from public.service_packages p where p.id=package_id and (p.provider_id=auth.uid() or (p.business_id is not null and public.has_business_commercial_permission(p.business_id,'pricing.update'))))
);

drop policy if exists "active promotions public read" on public.promotions;
create policy "active promotions public read" on public.promotions for select using (
  (status='published' and is_active and starts_at<=now() and ends_at>now() and (max_uses is null or used_count<max_uses))
  or provider_id=auth.uid() or public.has_admin_permission('content.manage')
);
drop policy if exists "providers manage own promotions" on public.promotions;
create policy "providers manage own promotions" on public.promotions for all using (
  (provider_id=auth.uid() and (business_id is null or exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()))) or (business_id is not null and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=provider_id) and public.has_business_commercial_permission(business_id,'promotion.update')) or public.has_admin_permission('content.manage')
) with check (
  (provider_id=auth.uid() and (business_id is null or exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()))) or (business_id is not null and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=provider_id) and public.has_business_commercial_permission(business_id,'promotion.create')) or public.has_admin_permission('content.manage')
);

create or replace function public.set_owned_service_status(target_service_id uuid, next_status text)
returns void language plpgsql security definer set search_path='' as $$
declare selected public.provider_services%rowtype;
begin
  if next_status not in ('draft','published','paused','sold_out','archived','hidden') then raise exception 'Statut invalide'; end if;
  select * into selected from public.provider_services where id=target_service_id for update;
  if not found then raise exception 'Prestation introuvable'; end if;
  if selected.provider_id<>auth.uid() and not (selected.business_id is not null and public.has_business_commercial_permission(selected.business_id,case when next_status='archived' then 'service.archive' else 'service.publish' end)) then raise exception 'Permission insuffisante'; end if;
  if next_status='published' and not exists(select 1 from public.provider_profiles pp where pp.profile_id=selected.provider_id and pp.status='approved') then raise exception 'Profil professionnel non approuvé'; end if;
  update public.provider_services set status=next_status,updated_at=now() where id=target_service_id;
end; $$;
revoke all on function public.set_owned_service_status(uuid,text) from public;
grant execute on function public.set_owned_service_status(uuid,text) to authenticated;

create or replace function public.calculate_service_quote(target_provider_service_id uuid, target_option_ids uuid[] default '{}'::uuid[], target_promotion_id uuid default null, target_location_mode text default 'salon')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare selected public.provider_services%rowtype; option_total integer:=0; discount_total integer:=0; base_total integer; selected_promotion public.promotions%rowtype; final_total integer;
begin
  select * into selected from public.provider_services where id=target_provider_service_id and status='published' and is_active and archived_at is null;
  if not found then raise exception 'Prestation indisponible'; end if;
  if target_location_mode not in ('salon','client_address') or not target_location_mode=any(selected.location_modes) then raise exception 'Lieu indisponible'; end if;
  base_total:=case when target_location_mode='client_address' then coalesce(selected.home_price_amount,selected.price_amount)+selected.travel_fee_amount else selected.price_amount end;
  if cardinality(target_option_ids)>0 then
    if exists(select 1 from unnest(target_option_ids) x(id) left join public.service_options o on o.id=x.id and o.provider_service_id=selected.id and o.is_active where o.id is null) then raise exception 'Option invalide'; end if;
    select coalesce(sum(o.price_amount),0) into option_total from public.service_options o where o.id=any(target_option_ids) and o.provider_service_id=selected.id and o.is_active;
  end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into target_option_ids from public.service_options where provider_service_id=selected.id and is_active and is_required and not id=any(target_option_ids);
  if cardinality(target_option_ids)>0 then select option_total+coalesce(sum(price_amount),0) into option_total from public.service_options where id=any(target_option_ids); end if;
  if target_promotion_id is not null then
    select * into selected_promotion from public.promotions where id=target_promotion_id and provider_id=selected.provider_id and (provider_service_id is null or provider_service_id=selected.id) and status='published' and is_active and starts_at<=now() and ends_at>now() and (max_uses is null or used_count<max_uses);
    if found then
      discount_total:=case when selected_promotion.promotional_price_amount is not null then greatest(0,base_total+option_total-selected_promotion.promotional_price_amount) when selected_promotion.discount_type='percentage' then floor((base_total+option_total)*selected_promotion.discount_value/100.0)::integer else least(base_total+option_total,selected_promotion.discount_value) end;
    end if;
  end if;
  final_total:=greatest(0,base_total+option_total-discount_total);
  return jsonb_build_object('base_amount',base_total,'options_amount',option_total,'discount_amount',discount_total,'total_amount',final_total,'deposit_amount',least(selected.deposit_amount,final_total),'currency',selected.currency,'duration_minutes',selected.duration_minutes);
end; $$;
revoke all on function public.calculate_service_quote(uuid,uuid[],uuid,text) from public;
grant execute on function public.calculate_service_quote(uuid,uuid[],uuid,text) to anon,authenticated;

create or replace function public.enforce_booking_contract()
returns trigger language plpgsql security definer set search_path='' as $$
declare selected public.provider_services%rowtype; quote jsonb;
begin
  if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Authentification requise'; end if;
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and not public.is_admin() and new.client_id is distinct from auth.uid() then raise exception 'Reservation interdite pour un autre client'; end if;
  select * into selected from public.provider_services where id=new.provider_service_id and status='published' and is_active and archived_at is null for share;
  if not found then raise exception 'Prestation indisponible'; end if;
  if new.starts_at<=now() or new.starts_at>now()+interval '1 year' then raise exception 'Date de reservation invalide'; end if;
  if new.location_mode='client_address' and nullif(trim(new.appointment_address),'') is null then raise exception 'Adresse client requise'; end if;
  quote:=public.calculate_service_quote(new.provider_service_id,new.selected_option_ids,new.promotion_id,new.location_mode);
  new.provider_id:=selected.provider_id; new.business_id:=selected.business_id;
  new.ends_at:=new.starts_at+make_interval(mins=>selected.duration_minutes);
  new.base_amount:=(quote->>'base_amount')::integer; new.options_amount:=(quote->>'options_amount')::integer;
  new.discount_amount:=(quote->>'discount_amount')::integer; new.deposit_amount:=(quote->>'deposit_amount')::integer;
  new.total_amount:=(quote->>'total_amount')::integer; new.currency:=quote->>'currency'; new.status:='pending';
  return new;
end; $$;
revoke all on function public.enforce_booking_contract() from public,anon,authenticated;

grant select,insert,update,delete on public.service_options,public.service_packages,public.service_package_items to authenticated;
grant select on public.service_options,public.service_packages,public.service_package_items to anon;

commit;
