-- Google OAuth identity: idempotent customer profiles and professional upgrade without a second Auth user.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
  accepted_at timestamptz;
  avatar_candidate text;
  professional_intent boolean;
begin
  requested_name := left(coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Mata'
  ), 80);
  accepted_at := case when new.raw_user_meta_data->>'legal_accepted' = 'true' then now() else null end;
  avatar_candidate := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
  if avatar_candidate !~ '^https://' or char_length(avatar_candidate) > 2000 then avatar_candidate := null; end if;
  professional_intent := new.raw_user_meta_data->>'professional_intent' = 'true';

  insert into public.profiles(id, role, display_name, avatar_url, account_status, terms_accepted_at, privacy_accepted_at)
  values(
    new.id,
    'client',
    requested_name,
    avatar_candidate,
    case
      when new.email is not null and new.email_confirmed_at is null then 'email_unverified'
      when new.phone is not null and new.phone_confirmed_at is null then 'phone_unverified'
      else 'active'
    end,
    accepted_at,
    accepted_at
  );
  insert into public.client_profiles(profile_id) values(new.id);
  insert into public.account_roles(profile_id, role) values(new.id, 'customer');

  if professional_intent then
    insert into public.provider_profiles(profile_id, business_name, slug)
    values(new.id, requested_name, 'provider-' || replace(left(new.id::text, 18), '-', ''));
    insert into public.account_roles(profile_id, role) values(new.id, 'professional');
    insert into public.professional_onboarding(provider_id) values(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.ensure_authenticated_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity auth.users%rowtype;
  account public.profiles%rowtype;
  requested_name text;
  avatar_candidate text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into identity from auth.users where id = auth.uid();
  if not found then raise exception 'Identite introuvable'; end if;

  requested_name := left(coalesce(
    nullif(trim(identity.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(identity.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(identity.email, ''), '@', 1), ''),
    identity.phone,
    'Mata'
  ), 80);
  avatar_candidate := coalesce(identity.raw_user_meta_data->>'avatar_url', identity.raw_user_meta_data->>'picture');
  if avatar_candidate !~ '^https://' or char_length(avatar_candidate) > 2000 then avatar_candidate := null; end if;

  insert into public.profiles(id, role, display_name, avatar_url, account_status)
  values(
    identity.id,
    'client',
    requested_name,
    avatar_candidate,
    case
      when identity.email is not null and identity.email_confirmed_at is null then 'email_unverified'
      when identity.phone is not null and identity.phone_confirmed_at is null then 'phone_unverified'
      else 'active'
    end
  ) on conflict(id) do nothing;
  insert into public.client_profiles(profile_id) values(identity.id) on conflict(profile_id) do nothing;
  insert into public.account_roles(profile_id, role) values(identity.id, 'customer') on conflict do nothing;

  select * into account from public.profiles where id = identity.id;
  return jsonb_build_object(
    'profile_id', account.id,
    'role', account.role,
    'is_suspended', account.is_suspended,
    'profile_incomplete', account.first_name is null or account.last_name is null or account.phone is null
  );
end;
$$;
revoke all on function public.ensure_authenticated_profile() from public, anon;
grant execute on function public.ensure_authenticated_profile() to authenticated;

create or replace function public.request_professional_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.profiles%rowtype;
  provider public.provider_profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into account from public.profiles where id = auth.uid() for update;
  if not found or account.is_suspended or account.account_status in ('suspended', 'disabled', 'deleted') then
    raise exception 'Compte non autorise';
  end if;

  insert into public.client_profiles(profile_id) values(account.id) on conflict(profile_id) do nothing;
  insert into public.account_roles(profile_id, role) values(account.id, 'customer') on conflict do nothing;
  insert into public.provider_profiles(profile_id, business_name, slug, status)
  values(account.id, coalesce(nullif(account.display_name, ''), 'Mata Pro'), 'provider-' || replace(left(account.id::text, 18), '-', ''), 'draft')
  on conflict(profile_id) do nothing;
  insert into public.account_roles(profile_id, role) values(account.id, 'professional') on conflict do nothing;
  insert into public.professional_onboarding(provider_id, status)
  values(account.id, 'draft') on conflict(provider_id) do nothing;

  select * into provider from public.provider_profiles where profile_id = account.id;
  return jsonb_build_object('provider_id', provider.profile_id, 'status', provider.status, 'onboarding_progress', provider.onboarding_progress);
end;
$$;
revoke all on function public.request_professional_profile() from public, anon;
grant execute on function public.request_professional_profile() to authenticated;
