-- Lot 1 : identité client, consentements et onboarding professionnel reprenable.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists account_status text not null default 'active'
  check (account_status in ('email_unverified','phone_unverified','active','suspended','disabled','deleted'));
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.profiles add column if not exists marketing_consent boolean not null default false;
alter table public.profiles add column if not exists marketing_consent_updated_at timestamptz;

alter table public.provider_profiles add column if not exists activity_type text not null default 'independent'
  check (activity_type in ('independent','salon','barber_shop','makeup_artist','hairdresser','nail_artist','esthetician','care_specialist','other'));
alter table public.provider_profiles add column if not exists languages text[] not null default array['fr']::text[];
alter table public.provider_profiles add column if not exists cancellation_policy text;
alter table public.provider_profiles add column if not exists travel_radius_km integer check (travel_radius_km between 0 and 500);
alter table public.provider_profiles add column if not exists onboarding_progress smallint not null default 10 check (onboarding_progress between 0 and 100);

create table if not exists public.account_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('customer','professional')),
  created_at timestamptz not null default now(),
  primary key (profile_id,role)
);

insert into public.account_roles(profile_id,role)
select id,case when role = 'provider' then 'professional' else 'customer' end from public.profiles
on conflict do nothing;
insert into public.client_profiles(profile_id)
select id from public.profiles on conflict(profile_id) do nothing;
insert into public.account_roles(profile_id,role)
select profile_id,'customer' from public.client_profiles on conflict do nothing;

create table if not exists public.professional_onboarding (
  provider_id uuid primary key references public.provider_profiles(profile_id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','profile_incomplete','submitted','under_review','additional_information_required','verified','rejected','suspended','disabled')),
  current_step text not null default 'identity' check (current_step in ('identity','professional','location','documents','availability','review')),
  identity_data jsonb not null default '{}'::jsonb,
  professional_data jsonb not null default '{}'::jsonb,
  location_data jsonb not null default '{}'::jsonb,
  administrative_data jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}'::text[],
  rejection_reason text,
  assigned_agent uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.professional_onboarding(provider_id,status)
select profile_id,case status::text when 'approved' then 'verified' when 'pending_review' then 'under_review' when 'rejected' then 'rejected' when 'suspended' then 'suspended' else 'draft' end
from public.provider_profiles on conflict (provider_id) do nothing;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  status text not null default 'requested' check (status in ('requested','reviewing','approved','cancelled','completed')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(profile_id,status)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_role public.user_role; requested_name text; accepted_at timestamptz;
begin
  requested_role := case when new.raw_user_meta_data->>'role' = 'provider' then 'provider'::public.user_role else 'client'::public.user_role end;
  requested_name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1),new.phone,'Mata');
  accepted_at := case when coalesce((new.raw_user_meta_data->>'legal_accepted')::boolean,false) then now() else null end;
  insert into public.profiles(id,role,display_name,account_status,terms_accepted_at,privacy_accepted_at)
  values(new.id,requested_role,requested_name,case when new.email_confirmed_at is null then 'email_unverified' else 'active' end,accepted_at,accepted_at);
  insert into public.client_profiles(profile_id) values(new.id);
  insert into public.account_roles(profile_id,role) values(new.id,'customer');
  if requested_role = 'provider' then
    insert into public.provider_profiles(profile_id,business_name,slug) values(new.id,requested_name,'provider-' || replace(left(new.id::text,18),'-',''));
    insert into public.account_roles(profile_id,role) values(new.id,'professional');
    insert into public.professional_onboarding(provider_id) values(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.save_client_profile(
  target_first_name text,target_last_name text,target_phone text,target_city text,target_address text,
  target_preferences jsonb,target_marketing_consent boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if char_length(trim(target_first_name)) not between 2 and 80 or char_length(trim(target_last_name)) not between 2 and 80 then raise exception 'Prénom ou nom invalide'; end if;
  if target_phone is not null and target_phone !~ '^\+?[0-9 ]{8,20}$' then raise exception 'Téléphone invalide'; end if;
  if jsonb_typeof(target_preferences) <> 'object' then raise exception 'Préférences invalides'; end if;
  update public.profiles set first_name=trim(target_first_name),last_name=trim(target_last_name),display_name=trim(target_first_name || ' ' || target_last_name),
    phone=nullif(trim(target_phone),''),marketing_consent=target_marketing_consent,
    marketing_consent_updated_at=case when marketing_consent is distinct from target_marketing_consent then now() else marketing_consent_updated_at end
  where id=auth.uid();
  update public.client_profiles set city=nullif(trim(target_city),''),default_address=nullif(trim(target_address),''),preferences=target_preferences where profile_id=auth.uid();
end;
$$;
revoke all on function public.save_client_profile(text,text,text,text,text,jsonb,boolean) from public,anon;
grant execute on function public.save_client_profile(text,text,text,text,text,jsonb,boolean) to authenticated;

create or replace function public.save_professional_onboarding(
  target_business_name text,target_bio text,target_city text,target_service_mode text,target_activity_type text,
  target_years_experience integer,target_base_address text,target_languages text[],target_cancellation_policy text
) returns smallint language plpgsql security definer set search_path = '' as $$
declare computed_progress smallint := 10;
begin
  if auth.uid() is null or not exists(select 1 from public.provider_profiles where profile_id=auth.uid()) then raise exception 'Profil professionnel requis'; end if;
  if char_length(trim(target_business_name)) < 2 or target_service_mode not in ('salon','mobile','both') then raise exception 'Informations professionnelles invalides'; end if;
  if target_activity_type not in ('independent','salon','barber_shop','makeup_artist','hairdresser','nail_artist','esthetician','care_specialist','other') then raise exception 'Type activité invalide'; end if;
  if target_years_experience not between 0 and 80 then raise exception 'Expérience invalide'; end if;
  computed_progress := 25;
  if char_length(trim(coalesce(target_bio,''))) >= 40 then computed_progress := computed_progress + 25; end if;
  if char_length(trim(coalesce(target_city,''))) >= 2 and char_length(trim(coalesce(target_base_address,''))) >= 4 then computed_progress := computed_progress + 25; end if;
  if cardinality(target_languages) > 0 and char_length(trim(coalesce(target_cancellation_policy,''))) >= 20 then computed_progress := computed_progress + 25; end if;
  update public.provider_profiles set business_name=trim(target_business_name),bio=nullif(trim(target_bio),''),city=trim(target_city),service_mode=target_service_mode,
    activity_type=target_activity_type,years_experience=target_years_experience,base_address=nullif(trim(target_base_address),''),languages=target_languages,
    cancellation_policy=nullif(trim(target_cancellation_policy),''),onboarding_progress=computed_progress where profile_id=auth.uid();
  update public.professional_onboarding set current_step=case when computed_progress=100 then 'documents' else 'professional' end,
    status=case when computed_progress=100 then 'draft' else 'profile_incomplete' end,
    professional_data=jsonb_build_object('activity_type',target_activity_type,'languages',target_languages,'years_experience',target_years_experience),
    location_data=jsonb_build_object('city',target_city,'address',target_base_address,'service_mode',target_service_mode),updated_at=now()
  where provider_id=auth.uid();
  return computed_progress;
end;
$$;
revoke all on function public.save_professional_onboarding(text,text,text,text,text,integer,text,text[],text) from public,anon;
grant execute on function public.save_professional_onboarding(text,text,text,text,text,integer,text,text[],text) to authenticated;

create or replace function public.synchronize_account_status()
returns text language plpgsql security definer set search_path = '' as $$
declare resulting_status text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update public.profiles set account_status=case when is_suspended then 'suspended' else 'active' end
  where id=auth.uid() and account_status in ('email_unverified','phone_unverified','active') returning account_status into resulting_status;
  return resulting_status;
end;
$$;
revoke all on function public.synchronize_account_status() from public,anon;
grant execute on function public.synchronize_account_status() to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')='service_role' or public.is_admin() then return new; end if;
  if new.role is distinct from old.role or new.is_suspended is distinct from old.is_suspended then raise exception 'La modification du rôle ou de la suspension nécessite un administrateur'; end if;
  if new.account_status is distinct from old.account_status and not (old.account_status in ('email_unverified','phone_unverified') and new.account_status='active') then raise exception 'Transition de compte interdite'; end if;
  if (old.terms_accepted_at is not null and new.terms_accepted_at is distinct from old.terms_accepted_at)
    or (old.privacy_accepted_at is not null and new.privacy_accepted_at is distinct from old.privacy_accepted_at) then raise exception 'Les consentements légaux sont immuables'; end if;
  return new;
end;
$$;

create or replace function public.submit_provider_for_review()
returns public.provider_status language plpgsql security definer set search_path = '' as $$
declare resulting_status public.provider_status;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update public.provider_profiles set status='pending_review',updated_at=now()
  where profile_id=auth.uid() and status in ('draft','rejected') and onboarding_progress=100
    and char_length(trim(business_name))>=2 and char_length(trim(coalesce(bio,'')))>=40 and char_length(trim(city))>=2
  returning status into resulting_status;
  if resulting_status is null then raise exception 'Complétez toutes les étapes du profil avant envoi'; end if;
  update public.professional_onboarding set status='submitted',current_step='review',submitted_at=now(),updated_at=now() where provider_id=auth.uid();
  return resulting_status;
end;
$$;
revoke all on function public.submit_provider_for_review() from public;
grant execute on function public.submit_provider_for_review() to authenticated;

alter table public.account_roles enable row level security;
alter table public.professional_onboarding enable row level security;
alter table public.account_deletion_requests enable row level security;
create policy "account roles own read" on public.account_roles for select using(profile_id=auth.uid() or public.is_admin());
create policy "professional onboarding own read" on public.professional_onboarding for select using(provider_id=auth.uid() or public.is_admin());
create policy "deletion requests own read" on public.account_deletion_requests for select using(profile_id=auth.uid() or public.is_admin());
create policy "deletion requests own create" on public.account_deletion_requests for insert with check(profile_id=auth.uid());

create index if not exists professional_onboarding_queue_idx on public.professional_onboarding(status,updated_at);
create index if not exists account_deletion_requests_queue_idx on public.account_deletion_requests(status,requested_at);
