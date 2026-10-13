-- End-to-end SQL checks for collaborator privacy and invitation lifecycle.
-- Run only against a disposable local Supabase database. All fixtures roll back.
begin;

do $$
declare
  owner_a constant uuid := 'a0000001-0000-4000-8000-000000000001';
  owner_b constant uuid := 'b0000002-0000-4000-8000-000000000002';
  staff_a constant uuid := 'c0000003-0000-4000-8000-000000000003';
  invitee_a constant uuid := 'd0000004-0000-4000-8000-000000000004';
  invitee_expired constant uuid := 'e0000005-0000-4000-8000-000000000005';
  invitee_revoked constant uuid := 'f0000006-0000-4000-8000-000000000006';
  business_a constant uuid := 'a1000001-0000-4000-8000-000000000001';
  business_b constant uuid := 'b1000002-0000-4000-8000-000000000002';
  collaborator_a uuid;
  collaborator_b uuid;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (owner_a, 'authenticated', 'authenticated', 'qa-owner-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"QA Owner A","professional_intent":true}', now(), now()),
    (owner_b, 'authenticated', 'authenticated', 'qa-owner-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"QA Owner B","professional_intent":true}', now(), now()),
    (staff_a, 'authenticated', 'authenticated', 'qa-staff-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"QA Staff A"}', now(), now()),
    (invitee_a, 'authenticated', 'authenticated', 'qa-invitee-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"QA Invitee A"}', now(), now()),
    (invitee_expired, 'authenticated', 'authenticated', 'qa-invitee-expired@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"QA Expired Invitee"}', now(), now()),
    (invitee_revoked, 'authenticated', 'authenticated', 'qa-invitee-revoked@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"QA Revoked Invitee"}', now(), now());

  insert into public.businesses (id, owner_id, name, slug, business_type, address, city, status, is_active)
  values
    (business_a, owner_a, 'QA Salon Alpha', 'qa-salon-alpha', 'salon', 'Local test', 'Lyon', 'approved', true),
    (business_b, owner_b, 'QA Salon Beta', 'qa-salon-beta', 'salon', 'Local test', 'Lyon', 'approved', true);

  perform set_config('app.accept_business_invitation', 'true', true);
  insert into public.collaborators (business_id, profile_id, display_name, is_active, is_bookable)
  values (business_a, staff_a, 'QA Staff Alpha', true, false) returning id into collaborator_a;
  insert into public.collaborators (business_id, profile_id, display_name, is_active, is_bookable)
  values (business_b, invitee_a, 'QA Staff Beta', true, false) returning id into collaborator_b;
  insert into booking_private.collaborator_access
    (collaborator_id, business_id, profile_id, internal_role, staff_permissions)
  values
    (collaborator_a, business_a, staff_a, 'member', array['bookings.read','messages.read']::text[]),
    (collaborator_b, business_b, invitee_a, 'manager', array['bookings.read','bookings.manage']::text[]);

  perform set_config('app.accept_business_invitation', '', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end
$$;

set local role anon;
do $$
declare visible_names integer;
begin
  if has_column_privilege('anon', 'public.collaborators', 'profile_id', 'select') then
    raise exception 'FAIL: anon can select collaborator profile_id';
  end if;
  if has_column_privilege('anon', 'public.collaborators', 'profile_id', 'update') then
    raise exception 'FAIL: anon can update collaborator profile_id';
  end if;
  begin
    execute 'select profile_id from public.collaborators limit 1';
    raise exception 'FAIL: anon profile_id query unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  execute 'select count(display_name) from public.collaborators' into visible_names;
  if visible_names <> 2 then
    raise exception 'FAIL: anon should see the two public active team labels, saw %', visible_names;
  end if;
  begin
    execute 'update public.collaborators set display_name = ''Anon changed''';
    raise exception 'FAIL: anon collaborator update unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.current_collaborator_access();
    raise exception 'FAIL: anon executed the collaborator SECURITY DEFINER RPC';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.lookup_business_invitation(repeat('0',64));
    raise exception 'FAIL: anon executed the invitation lookup RPC';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.accept_business_invitation('00000000-0000-4000-8000-000000000000', repeat('0',64), '00000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: anon executed the invitation acceptance RPC';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare visible_names integer; access_count integer; changed_count integer;
begin
  if has_column_privilege('authenticated', 'public.collaborators', 'profile_id', 'select')
    or has_column_privilege('authenticated', 'public.collaborators', 'profile_id', 'update') then
    raise exception 'FAIL: authenticated can read or update collaborator profile_id';
  end if;
  execute 'select count(display_name) from public.collaborators' into visible_names;
  if visible_names <> 2 then
    raise exception 'FAIL: authenticated public presentation visibility expected two rows, saw %', visible_names;
  end if;
  select count(*) into access_count from public.owner_list_collaborator_access('a1000001-0000-4000-8000-000000000001');
  if access_count <> 1 then
    raise exception 'FAIL: salon A owner should see exactly its own collaborator access, saw %', access_count;
  end if;
  select count(*) into access_count from public.owner_list_collaborator_access('b1000002-0000-4000-8000-000000000002');
  if access_count <> 0 then
    raise exception 'FAIL: salon A owner can see salon B access';
  end if;
  begin
    execute 'select * from booking_private.collaborator_access';
    raise exception 'FAIL: authenticated direct access to private permissions unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  update public.collaborators set display_name = 'QA Staff Alpha Updated'
  where business_id = 'a1000001-0000-4000-8000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'FAIL: salon A owner could not update their public collaborator presentation';
  end if;
  update public.collaborators set display_name = 'Cross Salon Mutation'
  where business_id = 'b1000002-0000-4000-8000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'FAIL: salon A owner updated salon B collaborator presentation';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', 'c0000003-0000-4000-8000-000000000003', true);
set local role authenticated;
do $$
declare access_count integer; other_salon_count integer;
begin
  select count(*) into access_count from public.current_collaborator_access();
  if access_count <> 1 then
    raise exception 'FAIL: collaborator should receive exactly their own access row, saw %', access_count;
  end if;
  select count(*) into other_salon_count from public.current_collaborator_access()
  where business_id = 'b1000002-0000-4000-8000-000000000002';
  if other_salon_count <> 0 then
    raise exception 'FAIL: collaborator can resolve access for another salon';
  end if;
  begin
    perform public.create_business_invitation(
      'a1000001-0000-4000-8000-000000000001', 'qa-unauthorized@example.invalid', 'member',
      array['bookings.read']::text[], repeat('f',64));
    raise exception 'FAIL: non-owner collaborator created a salon invitation';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare v_invitation_id uuid; v_expired_id uuid; v_revoked_id uuid; v_expires_at timestamptz; rows_found integer;
begin
  v_invitation_id := public.create_business_invitation(
    'a1000001-0000-4000-8000-000000000001', 'qa-invitee-a@example.invalid', 'member',
    array['bookings.read']::text[], repeat('a',64));
  select i.expires_at into v_expires_at from public.business_invitations i where i.id=v_invitation_id;
  if v_expires_at < now() + interval '47 hours' or v_expires_at > now() + interval '49 hours' then
    raise exception 'FAIL: invitation expiry is not 48 hours';
  end if;
  v_expired_id := public.create_business_invitation(
    'a1000001-0000-4000-8000-000000000001', 'qa-invitee-expired@example.invalid', 'member',
    array['bookings.read']::text[], repeat('b',64));
  v_revoked_id := public.create_business_invitation(
    'a1000001-0000-4000-8000-000000000001', 'qa-invitee-revoked@example.invalid', 'member',
    array['bookings.read']::text[], repeat('c',64));
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_invitations' and column_name='token_hash') then
    raise exception 'FAIL: invitation token hash remains in the public table';
  end if;
  select count(*) into rows_found from public.business_invitations where id=v_invitation_id and status='pending';
  if rows_found <> 1 then raise exception 'FAIL: invitation was not created'; end if;
end
$$;

reset role;
do $$
begin
  if not exists(select 1 from booking_private.business_invitation_secrets s
    join public.business_invitations i on i.id=s.invitation_id
    where i.email='qa-invitee-a@example.invalid' and s.token_hash=repeat('a',64)) then
    raise exception 'FAIL: hashed invitation token was not stored in the private table';
  end if;
  update public.business_invitations set expires_at=now()-interval '1 second'
  where email='qa-invitee-expired@example.invalid' and status='pending';
end
$$;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare v_revoked_id uuid;
begin
  select id into v_revoked_id from public.business_invitations
  where email='qa-invitee-revoked@example.invalid' and status='pending';
  if not public.revoke_business_invitation(v_revoked_id) then
    raise exception 'FAIL: invitation revocation did not succeed';
  end if;
end
$$;
reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
do $$
declare v_invitation_id uuid; v_expired_id uuid; v_revoked_id uuid; result jsonb; rows_found integer;
begin
  select i.id into v_invitation_id from public.business_invitations i
  where i.email='qa-invitee-a@example.invalid' and i.status='pending';
  result := public.accept_business_invitation(v_invitation_id, repeat('a',64), 'd0000004-0000-4000-8000-000000000004');
  if result->>'business_id' <> 'a1000001-0000-4000-8000-000000000001' then
    raise exception 'FAIL: invitation acceptance returned the wrong salon';
  end if;
  select id into v_expired_id from public.business_invitations where email='qa-invitee-expired@example.invalid';
  select id into v_revoked_id from public.business_invitations where email='qa-invitee-revoked@example.invalid';
  select count(*) into rows_found from public.lookup_business_invitation(repeat('b',64));
  if rows_found <> 0 then raise exception 'FAIL: expired invitation lookup returned a result'; end if;
  select count(*) into rows_found from public.lookup_business_invitation(repeat('c',64));
  if rows_found <> 0 then raise exception 'FAIL: revoked invitation lookup returned a result'; end if;
  begin
    perform public.accept_business_invitation(v_expired_id, repeat('b',64), 'e0000005-0000-4000-8000-000000000005');
    raise exception 'FAIL: expired invitation was accepted';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.accept_business_invitation(v_revoked_id, repeat('c',64), 'f0000006-0000-4000-8000-000000000006');
    raise exception 'FAIL: revoked invitation was accepted';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

reset role;
do $$
declare v_invitation_id uuid; rows_found integer;
begin
  select i.id into v_invitation_id from public.business_invitations i
  where i.email='qa-invitee-a@example.invalid' and i.status='accepted';
  if not exists(select 1 from booking_private.collaborator_access a
    where a.business_id='a1000001-0000-4000-8000-000000000001'
      and a.profile_id='d0000004-0000-4000-8000-000000000004'
      and a.internal_role='member' and a.staff_permissions=array['bookings.read']::text[]) then
    raise exception 'FAIL: accepted invitation did not create the expected private access';
  end if;
  if exists(select 1 from booking_private.business_invitation_secrets where business_invitation_secrets.invitation_id=v_invitation_id and token_hash is not null) then
    raise exception 'FAIL: accepted invitation token was not invalidated';
  end if;
  select count(*) into rows_found from booking_private.business_invitation_events
    where business_invitation_events.invitation_id=v_invitation_id and event_type in ('created','accepted');
  if rows_found < 2 then raise exception 'FAIL: invitation events were not audited'; end if;
  if not exists(select 1 from public.business_invitations where email='qa-invitee-revoked@example.invalid' and status='revoked')
    or exists(select 1 from booking_private.business_invitation_secrets s
      join public.business_invitations i on i.id=s.invitation_id
      where i.email='qa-invitee-revoked@example.invalid' and s.token_hash is not null)
    or not exists(select 1 from booking_private.business_invitation_events e
      join public.business_invitations i on i.id=e.invitation_id
      where i.email='qa-invitee-revoked@example.invalid' and e.event_type='revoked') then
    raise exception 'FAIL: revocation status, token invalidation, or audit event missing';
  end if;
  begin
    perform public.accept_business_invitation(v_invitation_id, repeat('a',64), 'd0000004-0000-4000-8000-000000000004');
    raise exception 'FAIL: invitation could be accepted twice';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

rollback;
