-- Centre de contrôle client: identité enrichie, préférences, confidentialité et cycle de compte.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists birth_date date;
create unique index if not exists profiles_username_unique_idx on public.profiles(lower(username)) where username is not null;
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format check(username is null or username ~ '^[a-zA-Z0-9_]{3,30}$');
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length check(bio is null or char_length(bio)<=280);

alter table public.client_profiles add column if not exists neighborhood text;
alter table public.inspiration_collections add column if not exists is_public boolean not null default false;

create table if not exists public.profile_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  favorite_categories text[] not null default '{}',
  preferred_styles text[] not null default '{}',
  usual_services text[] not null default '{}',
  budget_min integer check(budget_min is null or budget_min>=0),
  budget_max integer check(budget_max is null or budget_max>=0),
  radius_km integer not null default 15 check(radius_km between 1 and 200),
  location_mode text not null default 'both' check(location_mode in ('salon','mobile','both')),
  preferred_days smallint[] not null default '{}',
  preferred_time_start time,
  preferred_time_end time,
  personalization_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check(budget_min is null or budget_max is null or budget_max>=budget_min)
);

create table if not exists public.profile_privacy_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  profile_visibility text not null default 'limited' check(profile_visibility in ('public','limited')),
  show_collections boolean not null default false,
  show_follows boolean not null default false,
  allow_personalized_recommendations boolean not null default true,
  allow_marketing_email boolean not null default false,
  allow_promotional_notifications boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  bookings_in_app boolean not null default true, bookings_email boolean not null default true,
  payments_in_app boolean not null default true, payments_email boolean not null default true,
  messages_in_app boolean not null default true, messages_email boolean not null default false,
  reminders_in_app boolean not null default true, reminders_email boolean not null default true,
  social_in_app boolean not null default true, social_email boolean not null default false,
  promotions_in_app boolean not null default false, promotions_email boolean not null default false,
  support_in_app boolean not null default true, support_email boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'requested' check(status in ('requested','identity_check','blocked_financial','scheduled','cancelled','completed')),
  reason text check(reason is null or char_length(reason)<=1000),
  requested_at timestamptz not null default now(), processed_at timestamptz,
  unique(profile_id,status)
);

create table if not exists public.user_activity_history (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

alter table public.profile_preferences enable row level security;
alter table public.profile_privacy_settings enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.blocked_users enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.user_activity_history enable row level security;

create policy "preferences owner access" on public.profile_preferences for all using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create policy "privacy owner access" on public.profile_privacy_settings for all using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create policy "notification preferences owner access" on public.notification_preferences for all using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create policy "blocks owner access" on public.blocked_users for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy "deletion requests owner read" on public.account_deletion_requests for select using(profile_id=auth.uid() or public.is_admin());
create policy "activity owner read" on public.user_activity_history for select using(profile_id=auth.uid() or public.is_admin());

create or replace function public.protect_profile_security_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then raise exception 'Le rôle ne peut pas être modifié depuis le profil'; end if;
  if old.is_suspended is distinct from new.is_suspended and not public.is_admin() then raise exception 'Champ réservé'; end if;
  return new;
end; $$;
drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields before update on public.profiles for each row execute function public.protect_profile_security_fields();

create or replace function public.initialize_client_control_center()
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  insert into public.profile_preferences(profile_id) values(auth.uid()) on conflict do nothing;
  insert into public.profile_privacy_settings(profile_id) values(auth.uid()) on conflict do nothing;
  insert into public.notification_preferences(profile_id) values(auth.uid()) on conflict do nothing;
end; $$;

create or replace function public.update_client_identity(target_first_name text,target_last_name text,target_username text,target_phone text,target_bio text,target_city text,target_neighborhood text,target_locale text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_username !~ '^[a-zA-Z0-9_]{3,30}$' then raise exception 'Nom d utilisateur invalide'; end if;
  update public.profiles set first_name=nullif(trim(target_first_name),''),last_name=nullif(trim(target_last_name),''),display_name=trim(concat_ws(' ',target_first_name,target_last_name)),username=lower(target_username),phone=nullif(trim(target_phone),''),bio=nullif(trim(target_bio),''),locale=target_locale,updated_at=now() where id=auth.uid();
  insert into public.client_profiles(profile_id,city,neighborhood) values(auth.uid(),nullif(trim(target_city),''),nullif(trim(target_neighborhood),'')) on conflict(profile_id) do update set city=excluded.city,neighborhood=excluded.neighborhood,updated_at=now();
  insert into public.user_activity_history(profile_id,action) values(auth.uid(),'profile.updated');
exception when unique_violation then raise exception 'Ce nom d utilisateur est déjà utilisé';
end; $$;

create or replace function public.request_account_deletion(target_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if exists(select 1 from public.bookings where client_id=auth.uid() and status in ('pending','confirmed','in_progress')) then raise exception 'Annulez ou terminez vos rendez-vous actifs avant cette demande'; end if;
  if exists(select 1 from public.payments p join public.bookings b on b.id=p.booking_id where b.client_id=auth.uid() and p.payment_status='pending') then raise exception 'Un paiement doit être traité avant cette demande'; end if;
  insert into public.account_deletion_requests(profile_id,reason) values(auth.uid(),nullif(trim(target_reason),'')) returning id into result_id;
  insert into public.user_activity_history(profile_id,action,metadata) values(auth.uid(),'account.deletion_requested',jsonb_build_object('request_id',result_id));
  return result_id;
end; $$;

revoke all on function public.initialize_client_control_center(), public.update_client_identity(text,text,text,text,text,text,text,text), public.request_account_deletion(text) from public,anon;
grant execute on function public.initialize_client_control_center(), public.update_client_identity(text,text,text,text,text,text,text,text), public.request_account_deletion(text) to authenticated;

create policy "users update own avatars" on storage.objects for update using(bucket_id='avatars' and owner_id=auth.uid()::text) with check(bucket_id='avatars' and owner_id=auth.uid()::text);
create policy "users delete own avatars" on storage.objects for delete using(bucket_id='avatars' and owner_id=auth.uid()::text);
