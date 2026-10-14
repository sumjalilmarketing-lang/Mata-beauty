-- PostgREST exposes verified JWT claims through auth.jwt(); it does not
-- guarantee the legacy request.jwt.claim.role setting used by the original
-- invitation RPC. Keep the server-role restriction while reading the claim
-- from the supported Supabase auth helper.
create or replace function public.accept_business_invitation(
  target_invitation_id uuid,
  target_token_hash text,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.business_invitations%rowtype;
  secret booking_private.business_invitation_secrets%rowtype;
  person public.profiles%rowtype;
  member_id uuid;
  member_name text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service serveur requis' using errcode = '42501';
  end if;

  select * into invitation
  from public.business_invitations
  where id = target_invitation_id
  for update;

  select * into secret
  from booking_private.business_invitation_secrets
  where invitation_id = target_invitation_id
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or invitation.expires_at <= now()
    or secret.token_hash is distinct from target_token_hash
    or target_token_hash !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1
      from auth.users u
      where u.id = target_user_id
        and lower(u.email) = invitation.email
        and u.email_confirmed_at is not null
    )
  then
    raise exception 'Invitation invalide, expirée ou adresse différente' using errcode = '42501';
  end if;

  select * into person
  from public.profiles
  where id = target_user_id
    and not is_suspended
    and account_status = 'active';

  if person.id is null then
    raise exception 'Compte inactif' using errcode = '42501';
  end if;

  member_name := coalesce(
    nullif(trim(coalesce(person.first_name, '') || ' ' || coalesce(person.last_name, '')), ''),
    nullif(person.display_name, ''),
    'Collaborateur'
  );

  perform set_config('app.accept_business_invitation', 'true', true);
  insert into public.collaborators(
    business_id, profile_id, display_name, first_name, public_last_name, is_active, is_bookable
  )
  values (
    invitation.business_id, target_user_id, member_name, person.first_name,
    person.last_name, true, false
  )
  on conflict (business_id, profile_id)
  do update set display_name = excluded.display_name, is_active = true, archived_at = null
  returning id into member_id;

  insert into booking_private.collaborator_access(
    collaborator_id, business_id, profile_id, internal_role, staff_permissions
  )
  values (
    member_id, invitation.business_id, target_user_id, secret.internal_role,
    secret.staff_permissions
  )
  on conflict (collaborator_id)
  do update set profile_id = excluded.profile_id,
    internal_role = excluded.internal_role,
    staff_permissions = excluded.staff_permissions,
    updated_at = now();

  update public.business_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = target_user_id,
    collaborator_id = member_id
  where id = target_invitation_id;

  update booking_private.business_invitation_secrets
  set token_hash = null
  where invitation_id = target_invitation_id;

  insert into booking_private.business_invitation_events(
    invitation_id, business_id, actor_id, event_type
  ) values (invitation.id, invitation.business_id, target_user_id, 'accepted');

  insert into public.notifications(profile_id, kind, title, body, data)
  values (
    invitation.invited_by,
    'team_invitation',
    'Invitation acceptée',
    member_name || ' a rejoint votre salon.',
    jsonb_build_object('business_id', invitation.business_id, 'href', '/salon/team')
  );

  return jsonb_build_object(
    'collaborator_id', member_id,
    'business_id', invitation.business_id,
    'business_name', (select name from public.businesses where id = invitation.business_id)
  );
end;
$$;

revoke all on function public.accept_business_invitation(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_business_invitation(uuid, text, uuid)
  to service_role;
