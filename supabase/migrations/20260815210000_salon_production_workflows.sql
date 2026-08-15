begin;

alter table public.businesses add column if not exists logo_url text;
alter table public.businesses add column if not exists is_active boolean not null default true;
alter table public.businesses add column if not exists archived_at timestamptz;
alter table public.provider_services add column if not exists business_id uuid references public.businesses(id) on delete set null;
alter table public.provider_services add column if not exists archived_at timestamptz;
alter table public.collaborators add column if not exists internal_role text not null default 'member'
  check (internal_role in ('manager','reception','member'));
alter table public.collaborators add column if not exists archived_at timestamptz;

create table if not exists public.business_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('logo','cover','gallery')),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, weekday),
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table if not exists public.business_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 240),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email = lower(email)),
  internal_role text not null default 'member' check (internal_role in ('manager','reception','member')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists provider_services_business_active_idx on public.provider_services(business_id,is_active) where archived_at is null;
create index if not exists business_media_business_sort_idx on public.business_media(business_id,media_type,sort_order);
create index if not exists business_closures_business_dates_idx on public.business_closures(business_id,starts_at,ends_at);
create unique index if not exists business_invitations_pending_email_idx on public.business_invitations(business_id,email) where status='pending';

drop trigger if exists business_hours_updated on public.business_hours;
create trigger business_hours_updated before update on public.business_hours for each row execute function public.set_updated_at();

alter table public.business_media enable row level security;
alter table public.business_hours enable row level security;
alter table public.business_closures enable row level security;
alter table public.business_invitations enable row level security;

create policy "business media public or owner read" on public.business_media for select using (
  exists(select 1 from public.businesses b where b.id=business_id and ((b.status='approved' and b.is_active and b.archived_at is null) or b.owner_id=auth.uid())) or public.is_admin()
);
create policy "business owners manage media" on public.business_media for all using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
) with check (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
);

create policy "business hours public or owner read" on public.business_hours for select using (
  exists(select 1 from public.businesses b where b.id=business_id and ((b.status='approved' and b.is_active and b.archived_at is null) or b.owner_id=auth.uid())) or public.is_admin()
);
create policy "business owners manage hours" on public.business_hours for all using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
) with check (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
);

create policy "business owners read closures" on public.business_closures for select using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
);
create policy "business owners manage closures" on public.business_closures for all using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
) with check (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
);

create policy "business owners read invitations" on public.business_invitations for select using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or invited_by=auth.uid() or public.is_admin()
);
create policy "business owners manage invitations" on public.business_invitations for all using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()) or public.is_admin()
) with check (
  (invited_by=auth.uid() and exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid())) or public.is_admin()
);

create policy "salon owners read business bookings" on public.bookings for select using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid())
);
create policy "salon owners update business bookings" on public.bookings for update using (
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid())
);

create or replace function public.enforce_salon_booking_contract()
returns trigger language plpgsql security definer set search_path='' as $$
declare selected_business uuid; selected_collaborator_business uuid;
begin
  select ps.business_id into selected_business from public.provider_services ps where ps.id=new.provider_service_id and ps.is_active and ps.archived_at is null;
  new.business_id:=selected_business;
  if new.collaborator_id is not null then
    select c.business_id into selected_collaborator_business from public.collaborators c where c.id=new.collaborator_id and c.is_active and c.is_bookable and c.archived_at is null;
    if selected_business is null or selected_collaborator_business is distinct from selected_business then raise exception 'Collaborateur indisponible pour cette prestation'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.enforce_salon_booking_contract() from public,anon,authenticated;
drop trigger if exists bookings_enforce_salon_contract on public.bookings;
create trigger bookings_enforce_salon_contract before insert on public.bookings for each row execute function public.enforce_salon_booking_contract();

create or replace function public.protect_salon_booking_contract()
returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and not public.is_admin()
    and (new.business_id is distinct from old.business_id or new.collaborator_id is distinct from old.collaborator_id) then
    raise exception 'Affectation contractuelle immuable';
  end if;
  return new;
end; $$;
drop trigger if exists bookings_protect_salon_contract on public.bookings;
create trigger bookings_protect_salon_contract before update on public.bookings for each row execute function public.protect_salon_booking_contract();

create or replace function public.protect_business_moderation_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')='service_role' or public.is_admin() then return new; end if;
  if tg_op='INSERT' then new.status:='draft';
  elsif new.status is distinct from old.status then raise exception 'Le statut de validation est administré par Mata Beauty';
  end if;
  return new;
end; $$;
drop trigger if exists businesses_protect_moderation on public.businesses;
create trigger businesses_protect_moderation before insert or update on public.businesses for each row execute function public.protect_business_moderation_fields();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-media','business-media',true,12582912,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "business media public read" on storage.objects for select using (bucket_id='business-media');
create policy "owners upload business media" on storage.objects for insert to authenticated with check (
  bucket_id='business-media' and exists(select 1 from public.businesses b where b.id=(storage.foldername(name))[1]::uuid and b.owner_id=auth.uid())
);
create policy "owners update business media" on storage.objects for update to authenticated using (
  bucket_id='business-media' and exists(select 1 from public.businesses b where b.id=(storage.foldername(name))[1]::uuid and b.owner_id=auth.uid())
) with check (
  bucket_id='business-media' and exists(select 1 from public.businesses b where b.id=(storage.foldername(name))[1]::uuid and b.owner_id=auth.uid())
);
create policy "owners delete business media" on storage.objects for delete to authenticated using (
  bucket_id='business-media' and exists(select 1 from public.businesses b where b.id=(storage.foldername(name))[1]::uuid and b.owner_id=auth.uid())
);

create or replace function public.archive_owned_business(target_business_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.businesses b where b.id=target_business_id and (b.owner_id=auth.uid() or public.is_admin())) then raise exception 'Accès refusé'; end if;
  update public.businesses set is_active=false,archived_at=now(),updated_at=now() where id=target_business_id;
  update public.provider_services set is_active=false,archived_at=coalesce(archived_at,now()),updated_at=now() where business_id=target_business_id;
  update public.collaborators set is_active=false,archived_at=coalesce(archived_at,now()),updated_at=now() where business_id=target_business_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'business.archive','business',target_business_id,jsonb_build_object('archived_at',now()));
end; $$;
revoke all on function public.archive_owned_business(uuid) from public,anon;
grant execute on function public.archive_owned_business(uuid) to authenticated;

-- La date d'effet est figée au moment de la création du paiement. Modifier une
-- règle future ne recalculera jamais une écriture ou un paiement historique.
create or replace function public.resolve_commission_breakdown_at(target_booking_id uuid,target_gross integer,target_effective_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_provider uuid; target_category uuid; selected_rate numeric(5,2):=10; selected_rule uuid; fee integer;
begin
  if target_gross<0 or target_effective_at is null then raise exception 'Montant ou date invalide'; end if;
  select b.provider_id,s.category_id into target_provider,target_category from public.bookings b
    left join public.provider_services ps on ps.id=b.provider_service_id
    left join public.services s on s.id=ps.service_id where b.id=target_booking_id;
  if target_provider is null then raise exception 'Réservation introuvable'; end if;
  select cr.id,cr.rate into selected_rule,selected_rate from public.commission_rules cr
    where cr.is_active and cr.valid_from<=target_effective_at and (cr.valid_until is null or cr.valid_until>target_effective_at)
      and (cr.provider_id=target_provider or (cr.provider_id is null and cr.category_id=target_category) or (cr.provider_id is null and cr.category_id is null))
    order by (cr.provider_id is not null) desc,(cr.category_id is not null) desc,cr.valid_from desc limit 1;
  selected_rate:=coalesce(selected_rate,10); fee:=round(target_gross*selected_rate/100);
  return jsonb_build_object('gross_amount',target_gross,'commission_rule_id',selected_rule,'commission_rate',selected_rate,'platform_fee',fee,'professional_net_amount',target_gross-fee,'currency','XOF','effective_at',target_effective_at);
end; $$;
revoke all on function public.resolve_commission_breakdown_at(uuid,integer,timestamptz) from public,anon;
grant execute on function public.resolve_commission_breakdown_at(uuid,integer,timestamptz) to authenticated,service_role;

create or replace function public.apply_payment_commission()
returns trigger language plpgsql security definer set search_path='' as $$
declare breakdown jsonb;
begin
  breakdown:=public.resolve_commission_breakdown_at(new.booking_id,coalesce(new.gross_amount,new.amount),coalesce(new.created_at,now()));
  new.gross_amount:=(breakdown->>'gross_amount')::integer;
  new.platform_fee:=(breakdown->>'platform_fee')::integer;
  new.professional_net_amount:=(breakdown->>'professional_net_amount')::integer-new.provider_fee;
  return new;
end; $$;

commit;
