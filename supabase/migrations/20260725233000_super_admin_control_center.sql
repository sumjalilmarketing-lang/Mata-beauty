begin;

create table if not exists public.admin_permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  domain text not null,
  description text not null,
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{2,49}$'),
  name text not null,
  description text,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_key text not null references public.admin_permissions(key) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table if not exists public.admin_user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  requires_mfa boolean not null default false,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role_id)
);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  signed_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text,
  ip_hash text,
  mfa_verified boolean not null default false,
  revoked_at timestamptz
);

create table if not exists public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  body text not null check (char_length(trim(body)) between 2 and 4000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.document_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.provider_documents(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  decision text not null check (decision in ('approved', 'rejected', 'more_information')),
  reason text not null check (char_length(trim(reason)) between 2 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 160),
  category text not null default 'general',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 8000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'rejected', 'closed')),
  reason text not null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

create table if not exists public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  reason text not null,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.promotion_targets (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  target_type text not null check (target_type in ('all', 'category', 'city', 'provider', 'new_clients')),
  target_value text,
  created_at timestamptz not null default now(),
  unique (promotion_id, target_type, target_value)
);

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  body text not null,
  channel text not null check (channel in ('in_app', 'email', 'sms', 'push')),
  audience jsonb not null default '{"type":"all"}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.notification_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
  provider_reference text,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, recipient_id)
);

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  sort_order integer not null default 0,
  published_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_block_id uuid not null references public.content_blocks(id) on delete cascade,
  version integer not null,
  content jsonb not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (content_block_id, version)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  is_sensitive boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5,2) not null check (rate between 0 and 100),
  category_id uuid references public.categories(id) on delete set null,
  provider_id uuid references public.provider_profiles(profile_id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'draft' check (status in ('draft', 'approved', 'processing', 'paid', 'failed')),
  total_amount integer not null default 0 check (total_amount >= 0),
  currency char(3) not null default 'XOF',
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.payout_batches(id) on delete set null,
  provider_id uuid not null references public.provider_profiles(profile_id) on delete restrict,
  amount integer not null check (amount >= 0),
  currency char(3) not null default 'XOF',
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  provider_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists admin_user_roles_user_active_idx on public.admin_user_roles (user_id, is_active);
create index if not exists admin_sessions_user_active_idx on public.admin_sessions (user_id, revoked_at, last_seen_at desc);
create index if not exists internal_notes_entity_idx on public.internal_notes (entity_type, entity_id, created_at desc);
create index if not exists support_tickets_queue_idx on public.support_tickets (status, priority, created_at);
create index if not exists disputes_queue_idx on public.disputes (status, priority, created_at);
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_type, target_id, created_at desc);
create index if not exists notification_campaigns_status_idx on public.notification_campaigns (status, scheduled_at);
create index if not exists content_blocks_status_sort_idx on public.content_blocks (status, sort_order);
create index if not exists payouts_provider_status_idx on public.payouts (provider_id, status, created_at);

insert into public.admin_permissions (key, domain, description, is_sensitive) values
  ('users.read','users','Consulter les utilisateurs',false),
  ('users.update','users','Modifier les utilisateurs',true),
  ('users.suspend','users','Suspendre ou réactiver un compte',true),
  ('users.delete','users','Anonymiser ou supprimer un compte',true),
  ('providers.read','providers','Consulter tous les prestataires',false),
  ('providers.verify','providers','Valider ou rejeter un prestataire',true),
  ('providers.suspend','providers','Suspendre un prestataire',true),
  ('bookings.read','bookings','Consulter toutes les réservations',false),
  ('bookings.update','bookings','Modifier une réservation',true),
  ('payments.read','finance','Consulter les paiements',false),
  ('payments.refund','finance','Initier un remboursement',true),
  ('commissions.manage','finance','Gérer les commissions',true),
  ('reviews.moderate','moderation','Modérer les avis',true),
  ('reports.manage','moderation','Traiter signalements et litiges',true),
  ('categories.manage','catalog','Gérer catégories et prestations',true),
  ('content.manage','content','Gérer les contenus',true),
  ('notifications.send','communication','Créer et envoyer des campagnes',true),
  ('settings.read','settings','Consulter les paramètres',false),
  ('settings.update','settings','Modifier les paramètres globaux',true),
  ('roles.manage','security','Gérer rôles et permissions',true),
  ('audit.read','security','Consulter les journaux d’audit',false),
  ('support.manage','support','Traiter les tickets support',false),
  ('documents.review','verification','Consulter et valider les documents privés',true),
  ('payouts.manage','finance','Gérer les reversements',true)
on conflict (key) do update set
  domain = excluded.domain,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.admin_roles (key, name, description, is_system) values
  ('super_admin','Super Administrateur','Contrôle complet de la plateforme',true),
  ('admin','Administrateur','Pilotage opérationnel sans gestion des accès Super Admin',true),
  ('support','Support','Utilisateurs, réservations et tickets',true),
  ('moderator','Modérateur','Avis, signalements et litiges',true),
  ('verification_agent','Agent de vérification','Validation des prestataires et documents',true),
  ('finance','Finance','Paiements, commissions et reversements',true),
  ('content_manager','Responsable contenu','Catalogue, contenus et notifications',true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission.key
from public.admin_roles role
cross join public.admin_permissions permission
where role.key = 'super_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission.key
from public.admin_roles role
join public.admin_permissions permission on permission.key = any (case role.key
  when 'admin' then array['users.read','users.update','users.suspend','providers.read','providers.verify','providers.suspend','bookings.read','bookings.update','payments.read','reviews.moderate','reports.manage','categories.manage','content.manage','notifications.send','settings.read','audit.read','support.manage','documents.review']
  when 'support' then array['users.read','bookings.read','bookings.update','reports.manage','support.manage']
  when 'moderator' then array['users.read','providers.read','bookings.read','reviews.moderate','reports.manage']
  when 'verification_agent' then array['users.read','providers.read','providers.verify','documents.review']
  when 'finance' then array['bookings.read','payments.read','payments.refund','commissions.manage','payouts.manage','audit.read']
  when 'content_manager' then array['providers.read','categories.manage','content.manage','notifications.send','settings.read']
  else array[]::text[]
end)
where role.key <> 'super_admin'
on conflict do nothing;

create or replace function public.has_admin_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.admin_user_roles membership on membership.user_id = profile.id
    join public.admin_roles role on role.id = membership.role_id
    left join public.admin_role_permissions role_permission on role_permission.role_id = role.id
    where profile.id = auth.uid()
      and profile.role = 'admin'
      and not profile.is_suspended
      and membership.is_active
      and membership.revoked_at is null
      and role.is_active
      and (role.key = 'super_admin' or role_permission.permission_key = required_permission)
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.admin_user_roles membership on membership.user_id = profile.id
    join public.admin_roles role on role.id = membership.role_id
    where profile.id = auth.uid()
      and profile.role = 'admin'
      and not profile.is_suspended
      and membership.is_active
      and membership.revoked_at is null
      and role.is_active
      and role.key = 'super_admin'
  );
$$;

create or replace function public.write_admin_audit(
  audit_action text,
  resource_type text,
  resource_id uuid,
  previous_value jsonb,
  next_value jsonb,
  justification text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare audit_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Accès administrateur requis'; end if;
  if char_length(trim(coalesce(justification, ''))) < 2 then raise exception 'Une justification est requise'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    auth.uid(), audit_action, resource_type, resource_id,
    coalesce(previous_value, '{}'::jsonb),
    coalesce(next_value, '{}'::jsonb) || jsonb_build_object('justification', justification)
  )
  returning id into audit_id;
  return audit_id;
end;
$$;

create or replace function public.get_admin_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'is_super_admin', public.is_super_admin(),
    'roles', coalesce((
      select jsonb_agg(distinct role.key)
      from public.admin_user_roles membership
      join public.admin_roles role on role.id = membership.role_id
      where membership.user_id = auth.uid() and membership.is_active and membership.revoked_at is null and role.is_active
    ), '[]'::jsonb),
    'permissions', case when public.is_super_admin() then (
      select coalesce(jsonb_agg(permission.key order by permission.key), '[]'::jsonb) from public.admin_permissions permission
    ) else (
      select coalesce(jsonb_agg(distinct role_permission.permission_key), '[]'::jsonb)
      from public.admin_user_roles membership
      join public.admin_roles role on role.id = membership.role_id
      join public.admin_role_permissions role_permission on role_permission.role_id = role.id
      where membership.user_id = auth.uid() and membership.is_active and membership.revoked_at is null and role.is_active
    ) end,
    'requires_mfa', coalesce((select bool_or(membership.requires_mfa) from public.admin_user_roles membership where membership.user_id = auth.uid() and membership.is_active), false)
  ) end;
$$;

create or replace function public.get_admin_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.has_admin_permission('users.read') then null else jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_today', (select count(*) from public.profiles where created_at >= current_date),
    'users_week', (select count(*) from public.profiles where created_at >= date_trunc('week', now())),
    'clients_active', (select count(*) from public.profiles where role = 'client' and not is_suspended),
    'providers_active', (select count(*) from public.provider_profiles where status = 'approved'),
    'providers_pending', (select count(*) from public.provider_profiles where status = 'pending_review'),
    'salons_active', (select count(*) from public.businesses where status = 'approved'),
    'bookings_today', (select count(*) from public.bookings where starts_at >= current_date and starts_at < current_date + interval '1 day'),
    'bookings_week', (select count(*) from public.bookings where starts_at >= date_trunc('week', now()) and starts_at < date_trunc('week', now()) + interval '7 days'),
    'bookings_confirmed', (select count(*) from public.bookings where status = 'confirmed'),
    'bookings_cancelled', (select count(*) from public.bookings where status in ('cancelled_by_client','cancelled_by_provider')),
    'gross_revenue', (select coalesce(sum(amount),0) from public.payments where payment_status in ('simulated_paid','paid_on_site')),
    'commissions', (select coalesce(sum(amount),0) from public.platform_commissions),
    'payments_pending', (select count(*) from public.payments where payment_status = 'pending'),
    'payouts_pending', (select count(*) from public.payouts where status in ('pending','processing')),
    'disputes_open', (select count(*) from public.disputes where status in ('open','investigating')),
    'reports_open', (select count(*) from public.reports where status in ('open','investigating')),
    'tickets_open', (select count(*) from public.support_tickets where status in ('open','pending')),
    'average_order', (select coalesce(round(avg(total_amount)),0) from public.bookings)
  ) end;
$$;

create or replace function public.admin_list_users(search_term text default null)
returns table (
  user_id uuid,
  email text,
  display_name text,
  phone text,
  account_role text,
  is_suspended boolean,
  city text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  bookings_count bigint,
  reports_count bigint,
  verification_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    auth_user.email::text,
    profile.display_name,
    profile.phone,
    profile.role::text,
    profile.is_suspended,
    coalesce(client.city, provider.city),
    profile.created_at,
    auth_user.last_sign_in_at,
    (select count(*) from public.bookings booking where booking.client_id = profile.id or booking.provider_id = profile.id),
    (select count(*) from public.reports report where report.reporter_id = profile.id or report.reported_profile_id = profile.id),
    coalesce(provider.status::text, 'not_required')
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  left join public.client_profiles client on client.profile_id = profile.id
  left join public.provider_profiles provider on provider.profile_id = profile.id
  where public.has_admin_permission('users.read')
    and (
      nullif(trim(search_term), '') is null
      or profile.display_name ilike '%' || trim(search_term) || '%'
      or auth_user.email ilike '%' || trim(search_term) || '%'
      or profile.phone ilike '%' || trim(search_term) || '%'
    )
  order by profile.created_at desc
  limit 250;
$$;

create or replace function public.admin_global_search(search_term text)
returns table (entity_type text, entity_id uuid, title text, subtitle text)
language sql
stable
security definer
set search_path = ''
as $$
  select result.entity_type, result.entity_id, result.title, result.subtitle
  from (
    select 'user'::text, profile.id, coalesce(profile.display_name, auth_user.email)::text, auth_user.email::text
    from public.profiles profile join auth.users auth_user on auth_user.id = profile.id
    where public.has_admin_permission('users.read')
      and (profile.display_name ilike '%' || trim(search_term) || '%' or auth_user.email ilike '%' || trim(search_term) || '%')
    union all
    select 'provider', provider.profile_id, provider.business_name, provider.city
    from public.provider_profiles provider
    where public.has_admin_permission('providers.read') and provider.business_name ilike '%' || trim(search_term) || '%'
    union all
    select 'booking', booking.id, booking.id::text, booking.status::text
    from public.bookings booking
    where public.has_admin_permission('bookings.read') and booking.id::text ilike '%' || trim(search_term) || '%'
    union all
    select 'payment', payment.id, coalesce(payment.provider_reference, payment.id::text), payment.payment_status::text
    from public.payments payment
    where public.has_admin_permission('payments.read')
      and (payment.id::text ilike '%' || trim(search_term) || '%' or payment.provider_reference ilike '%' || trim(search_term) || '%')
    union all
    select 'ticket', ticket.id, ticket.subject, ticket.status
    from public.support_tickets ticket
    where public.has_admin_permission('support.manage') and ticket.subject ilike '%' || trim(search_term) || '%'
    union all
    select 'promotion', promotion.id, promotion.title, case when promotion.is_active then 'active' else 'inactive' end
    from public.promotions promotion
    where public.has_admin_permission('content.manage') and promotion.title ilike '%' || trim(search_term) || '%'
  ) as result(entity_type, entity_id, title, subtitle)
  limit 50;
$$;

create or replace function public.admin_set_user_suspension(target_user_id uuid, suspended boolean, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare previous public.profiles;
begin
  if not public.has_admin_permission('users.suspend') then raise exception 'Permission users.suspend requise'; end if;
  if target_user_id = auth.uid() then raise exception 'Impossible de modifier son propre accès'; end if;
  if exists (
    select 1 from public.admin_user_roles membership join public.admin_roles role on role.id = membership.role_id
    where membership.user_id = target_user_id and membership.is_active and role.key = 'super_admin'
  ) and not public.is_super_admin() then raise exception 'Seul un Super Admin peut gérer ce compte'; end if;
  select * into previous from public.profiles where id = target_user_id for update;
  if previous.id is null then raise exception 'Utilisateur introuvable'; end if;
  update public.profiles set is_suspended = suspended, updated_at = now() where id = target_user_id;
  perform public.write_admin_audit(
    case when suspended then 'user.suspended' else 'user.reactivated' end,
    'profiles', target_user_id,
    jsonb_build_object('is_suspended', previous.is_suspended),
    jsonb_build_object('is_suspended', suspended),
    reason
  );
  return true;
end;
$$;

create or replace function public.admin_set_provider_status(target_provider_id uuid, next_status public.provider_status, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare previous public.provider_profiles;
begin
  if next_status in ('approved','rejected') and not public.has_admin_permission('providers.verify') then raise exception 'Permission providers.verify requise'; end if;
  if next_status = 'suspended' and not public.has_admin_permission('providers.suspend') then raise exception 'Permission providers.suspend requise'; end if;
  select * into previous from public.provider_profiles where profile_id = target_provider_id for update;
  if previous.profile_id is null then raise exception 'Prestataire introuvable'; end if;
  update public.provider_profiles
  set status = next_status, verified_at = case when next_status = 'approved' then now() else verified_at end, updated_at = now()
  where profile_id = target_provider_id;
  perform public.write_admin_audit(
    'provider.status_changed', 'provider_profiles', target_provider_id,
    jsonb_build_object('status', previous.status),
    jsonb_build_object('status', next_status),
    reason
  );
  return true;
end;
$$;

create or replace function public.admin_assign_role(target_user_id uuid, target_role_key text, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target_role_id uuid;
begin
  if not public.is_super_admin() or not public.has_admin_permission('roles.manage') then raise exception 'Super Admin requis'; end if;
  if target_user_id = auth.uid() then raise exception 'Impossible de modifier ses propres permissions'; end if;
  select id into target_role_id from public.admin_roles where key = target_role_key and is_active;
  if target_role_id is null then raise exception 'Rôle introuvable'; end if;
  update public.profiles set role = 'admin', updated_at = now() where id = target_user_id;
  insert into public.admin_user_roles (user_id, role_id, assigned_by, requires_mfa, is_active, revoked_at)
  values (target_user_id, target_role_id, auth.uid(), target_role_key = 'super_admin', true, null)
  on conflict (user_id, role_id) do update set assigned_by = auth.uid(), is_active = true, revoked_at = null, requires_mfa = excluded.requires_mfa;
  perform public.write_admin_audit('admin.role_assigned', 'profiles', target_user_id, null, jsonb_build_object('role', target_role_key), reason);
  return true;
end;
$$;

create or replace function public.admin_update_booking_status(target_booking_id uuid, next_status public.booking_status, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare previous public.bookings;
begin
  if not public.has_admin_permission('bookings.update') then raise exception 'Permission bookings.update requise'; end if;
  select * into previous from public.bookings where id = target_booking_id for update;
  if previous.id is null then raise exception 'Réservation introuvable'; end if;
  update public.bookings set status = next_status, updated_at = now() where id = target_booking_id;
  perform public.write_admin_audit('booking.status_changed','bookings',target_booking_id,jsonb_build_object('status',previous.status),jsonb_build_object('status',next_status),reason);
  return true;
end;
$$;

create or replace function public.admin_update_setting(setting_key text, setting_value jsonb, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare previous jsonb;
begin
  if not public.has_admin_permission('settings.update') then raise exception 'Permission settings.update requise'; end if;
  select value into previous from public.app_settings where key = setting_key;
  insert into public.app_settings (key, value, updated_by, updated_at)
  values (setting_key, setting_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now();
  perform public.write_admin_audit('setting.updated','app_settings',null,jsonb_build_object('key',setting_key,'value',previous),jsonb_build_object('key',setting_key,'value',setting_value),reason);
  return true;
end;
$$;

insert into public.app_settings (key, value, description, is_sensitive) values
  ('application', '{"name":"Mata Beauty","country":"SN","currency":"XOF","timezone":"Africa/Dakar","locale":"fr-SN"}', 'Identité et région', false),
  ('booking', '{"minimum_notice_minutes":60,"cancellation_window_hours":24}', 'Règles de réservation', false),
  ('commission', '{"default_rate":10}', 'Commission globale', true),
  ('maintenance', '{"enabled":false,"message":"Mata Beauty revient très vite.","allow_admins":true,"allow_clients":false,"allow_providers":false}', 'Mode maintenance', true),
  ('support', '{"email":"support@matabeauty.sn","phone":""}', 'Coordonnées support', false)
on conflict (key) do nothing;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'admin_permissions','admin_roles','admin_role_permissions','admin_user_roles','admin_sessions',
    'internal_notes','document_reviews','support_tickets','support_messages','disputes','dispute_events',
    'moderation_actions','promotion_targets','notification_campaigns','notification_deliveries',
    'content_blocks','content_versions','app_settings','commission_rules','payout_batches','payouts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy "admin permissions authorized read" on public.admin_permissions for select using (public.has_admin_permission('roles.manage') or public.is_super_admin());
create policy "admin roles authorized read" on public.admin_roles for select using (public.is_admin());
create policy "admin role permissions authorized read" on public.admin_role_permissions for select using (public.is_admin());
create policy "admin memberships own or manager read" on public.admin_user_roles for select using (user_id = auth.uid() or public.has_admin_permission('roles.manage'));
create policy "admin sessions own or manager read" on public.admin_sessions for select using (user_id = auth.uid() or public.has_admin_permission('roles.manage'));
create policy "internal notes permission read" on public.internal_notes for select using (public.is_admin());
create policy "internal notes permission insert" on public.internal_notes for insert with check (created_by = auth.uid() and public.is_admin());
create policy "document reviews authorized read" on public.document_reviews for select using (public.has_admin_permission('documents.review'));
create policy "document reviews authorized insert" on public.document_reviews for insert with check (
  reviewer_id = auth.uid() and public.has_admin_permission('documents.review')
);
create policy "support requester or admin read" on public.support_tickets for select using (requester_id = auth.uid() or public.has_admin_permission('support.manage'));
create policy "support requester create" on public.support_tickets for insert with check (requester_id = auth.uid());
create policy "support admin update" on public.support_tickets for update using (public.has_admin_permission('support.manage')) with check (public.has_admin_permission('support.manage'));
create policy "support messages participants read" on public.support_messages for select using (
  exists (select 1 from public.support_tickets ticket where ticket.id = ticket_id and (ticket.requester_id = auth.uid() or public.has_admin_permission('support.manage')))
);
create policy "support messages participants insert" on public.support_messages for insert with check (
  sender_id = auth.uid() and exists (select 1 from public.support_tickets ticket where ticket.id = ticket_id and (ticket.requester_id = auth.uid() or public.has_admin_permission('support.manage')))
);
create policy "disputes participants or moderator read" on public.disputes for select using (
  public.has_admin_permission('reports.manage') or exists (
    select 1 from public.bookings booking where booking.id = booking_id and (booking.client_id = auth.uid() or booking.provider_id = auth.uid())
  )
);
create policy "disputes participants create" on public.disputes for insert with check (
  opened_by = auth.uid() and exists (
    select 1 from public.bookings booking where booking.id = booking_id and (booking.client_id = auth.uid() or booking.provider_id = auth.uid())
  )
);
create policy "disputes moderator update" on public.disputes for update using (public.has_admin_permission('reports.manage')) with check (public.has_admin_permission('reports.manage'));
create policy "dispute events moderator read" on public.dispute_events for select using (public.has_admin_permission('reports.manage'));
create policy "dispute events moderator insert" on public.dispute_events for insert with check (
  actor_id = auth.uid() and public.has_admin_permission('reports.manage')
);
create policy "moderation authorized read" on public.moderation_actions for select using (public.has_admin_permission('reports.manage') or public.has_admin_permission('audit.read'));
create policy "moderation authorized insert" on public.moderation_actions for insert with check (
  actor_id = auth.uid() and public.has_admin_permission('reports.manage')
);
create policy "promotion targets public read" on public.promotion_targets for select using (
  exists (select 1 from public.promotions promotion where promotion.id = promotion_id and promotion.is_active and promotion.starts_at <= now() and promotion.ends_at > now())
  or public.has_admin_permission('content.manage')
);
create policy "promotion targets authorized manage" on public.promotion_targets for all using (
  public.has_admin_permission('content.manage')
) with check (public.has_admin_permission('content.manage'));
create policy "campaigns authorized read" on public.notification_campaigns for select using (public.has_admin_permission('notifications.send'));
create policy "campaigns authorized manage" on public.notification_campaigns for all using (
  public.has_admin_permission('notifications.send')
) with check (created_by = auth.uid() and public.has_admin_permission('notifications.send'));
create policy "deliveries authorized read" on public.notification_deliveries for select using (recipient_id = auth.uid() or public.has_admin_permission('notifications.send'));
create policy "deliveries authorized manage" on public.notification_deliveries for all using (
  public.has_admin_permission('notifications.send')
) with check (public.has_admin_permission('notifications.send'));
create policy "published content public read" on public.content_blocks for select using (status = 'published' or public.has_admin_permission('content.manage'));
create policy "content authorized manage" on public.content_blocks for all using (
  public.has_admin_permission('content.manage')
) with check (public.has_admin_permission('content.manage'));
create policy "content versions authorized read" on public.content_versions for select using (public.has_admin_permission('content.manage'));
create policy "content versions authorized insert" on public.content_versions for insert with check (
  created_by = auth.uid() and public.has_admin_permission('content.manage')
);
create policy "settings authorized read" on public.app_settings for select using (not is_sensitive or public.has_admin_permission('settings.read'));
create policy "commission rules finance read" on public.commission_rules for select using (public.has_admin_permission('payments.read') or public.has_admin_permission('commissions.manage'));
create policy "commission rules finance manage" on public.commission_rules for all using (
  public.has_admin_permission('commissions.manage')
) with check (created_by = auth.uid() and public.has_admin_permission('commissions.manage'));
create policy "payout batches finance read" on public.payout_batches for select using (public.has_admin_permission('payouts.manage'));
create policy "payout batches finance manage" on public.payout_batches for all using (
  public.has_admin_permission('payouts.manage')
) with check (created_by = auth.uid() and public.has_admin_permission('payouts.manage'));
create policy "payouts finance or owner read" on public.payouts for select using (provider_id = auth.uid() or public.has_admin_permission('payouts.manage'));
create policy "payouts finance manage" on public.payouts for all using (
  public.has_admin_permission('payouts.manage')
) with check (public.has_admin_permission('payouts.manage'));

drop trigger if exists admin_roles_updated on public.admin_roles;
create trigger admin_roles_updated before update on public.admin_roles for each row execute function public.set_updated_at();
drop trigger if exists support_tickets_updated on public.support_tickets;
create trigger support_tickets_updated before update on public.support_tickets for each row execute function public.set_updated_at();
drop trigger if exists disputes_updated on public.disputes;
create trigger disputes_updated before update on public.disputes for each row execute function public.set_updated_at();
drop trigger if exists notification_campaigns_updated on public.notification_campaigns;
create trigger notification_campaigns_updated before update on public.notification_campaigns for each row execute function public.set_updated_at();
drop trigger if exists content_blocks_updated on public.content_blocks;
create trigger content_blocks_updated before update on public.content_blocks for each row execute function public.set_updated_at();

revoke all on function public.has_admin_permission(text) from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.write_admin_audit(text,text,uuid,jsonb,jsonb,text) from public;
revoke all on function public.get_admin_context() from public;
revoke all on function public.get_admin_dashboard() from public;
revoke all on function public.admin_list_users(text) from public;
revoke all on function public.admin_global_search(text) from public;
revoke all on function public.admin_set_user_suspension(uuid,boolean,text) from public;
revoke all on function public.admin_set_provider_status(uuid,public.provider_status,text) from public;
revoke all on function public.admin_assign_role(uuid,text,text) from public;
revoke all on function public.admin_update_booking_status(uuid,public.booking_status,text) from public;
revoke all on function public.admin_update_setting(text,jsonb,text) from public;

grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.get_admin_context() to authenticated;
grant execute on function public.get_admin_dashboard() to authenticated;
grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_global_search(text) to authenticated;
grant execute on function public.admin_set_user_suspension(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_provider_status(uuid,public.provider_status,text) to authenticated;
grant execute on function public.admin_assign_role(uuid,text,text) to authenticated;
grant execute on function public.admin_update_booking_status(uuid,public.booking_status,text) to authenticated;
grant execute on function public.admin_update_setting(text,jsonb,text) to authenticated;

commit;
