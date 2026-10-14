-- Regression test for owner conversation reassignment of a pending booking.
-- Every account, salon, booking and conversation is fictitious and rolled back.
begin;

do $test$
declare
  owner_id uuid := 'a3141001-0000-4000-8000-000000000001';
  client_id uuid := 'a3141002-0000-4000-8000-000000000002';
  staff_a uuid := 'a3141003-0000-4000-8000-000000000003';
  staff_b uuid := 'a3141004-0000-4000-8000-000000000004';
  business_id uuid := 'a3142001-0000-4000-8000-000000000001';
  category_id uuid := 'a3143001-0000-4000-8000-000000000001';
  service_id uuid := 'a3143002-0000-4000-8000-000000000002';
  provider_service_id uuid := 'a3143003-0000-4000-8000-000000000003';
  v_booking_id uuid := 'a3144001-0000-4000-8000-000000000001';
  collaborator_a uuid;
  collaborator_b uuid;
  v_conversation_id uuid;
  quote_id uuid;
  result jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (owner_id,'authenticated','authenticated','qa-v2-owner@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"QA V2 Owner"}',now(),now()),
    (client_id,'authenticated','authenticated','qa-v2-client@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"QA V2 Client"}',now(),now()),
    (staff_a,'authenticated','authenticated','qa-v2-staff-a@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"QA V2 Staff A"}',now(),now()),
    (staff_b,'authenticated','authenticated','qa-v2-staff-b@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"QA V2 Staff B"}',now(),now());

  insert into public.provider_profiles(profile_id,business_name,slug,status,city,activity_type)
  values(owner_id,'QA Salon V2','qa-salon-v2-assignment','approved','Dakar','salon');
  insert into public.businesses(id,owner_id,name,slug,business_type,address,city,status,is_active,team_booking_enabled)
  values(business_id,owner_id,'QA Salon V2','qa-salon-v2-assignment','salon','Test','Dakar','approved',true,false);
  insert into public.categories(id,name,slug,is_active)
  values(category_id,'QA V2 Category','qa-v2-category-assignment',true);
  insert into public.services(id,category_id,name,slug,is_active)
  values(service_id,category_id,'QA V2 Service','qa-v2-service-assignment',true);
  insert into public.provider_services(id,provider_id,service_id,title,duration_minutes,price_amount,currency,is_active,status,business_id)
  values(provider_service_id,owner_id,service_id,'QA V2 Service',90,12500,'XOF',true,'published',business_id);

  perform set_config('app.accept_business_invitation','true',true);
  insert into public.collaborators(business_id,profile_id,display_name,is_active,is_bookable)
  values(business_id,staff_a,'QA Staff A',true,true) returning id into collaborator_a;
  insert into public.collaborators(business_id,profile_id,display_name,is_active,is_bookable)
  values(business_id,staff_b,'QA Staff B',true,true) returning id into collaborator_b;
  insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,staff_permissions)
  values
    (collaborator_a,business_id,staff_a,'member',array['bookings.read','messages.read','messages.reply']),
    (collaborator_b,business_id,staff_b,'member',array['bookings.read','messages.read','messages.reply'])
  on conflict(collaborator_id) do update
    set profile_id=excluded.profile_id,internal_role=excluded.internal_role,staff_permissions=excluded.staff_permissions;
  insert into public.collaborator_services(collaborator_id,provider_service_id)
  values(collaborator_a,provider_service_id),(collaborator_b,provider_service_id);
  insert into public.business_hours(business_id,weekday,opens_at,closes_at,is_closed)
  values(business_id,1,'09:00','16:00',false);
  insert into public.collaborator_hours(collaborator_id,weekday,starts_at,ends_at,slot_interval_minutes)
  values(collaborator_a,1,'09:00','16:00',30),(collaborator_b,1,'09:00','16:00',30);
  update public.businesses set team_booking_enabled=true where id=business_id;

  insert into public.bookings(id,client_id,provider_id,provider_service_id,starts_at,ends_at,location_mode,total_amount,currency,business_id,collaborator_id,status)
  values(v_booking_id,client_id,owner_id,provider_service_id,'2026-10-19 10:00+00','2026-10-19 11:30+00','salon',12500,'XOF',business_id,collaborator_a,'pending');
  select conversation.id into v_conversation_id
  from public.conversations conversation where conversation.booking_id=v_booking_id;
  if v_conversation_id is null then raise exception 'Booking conversation was not created'; end if;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  result:=public.save_conversation_quote(
    v_conversation_id,provider_service_id,'Prestation fictive de recette',12500,90,
    now()+interval '2 days','Conditions de test',null,null,'a3145001-0000-4000-8000-000000000001'
  );
  quote_id:=(result->>'id')::uuid;
  if quote_id is null or result->>'status'<>'draft' then raise exception 'Provider could not create quote draft'; end if;
  result:=public.send_conversation_quote(quote_id,(result->>'version')::integer,'a3145002-0000-4000-8000-000000000002');
  if result->>'status'<>'sent' then raise exception 'Provider could not send quote'; end if;

  perform set_config('request.jwt.claim.sub',client_id::text,true);
  result:=public.respond_to_conversation_quote(quote_id,'accept',(result->>'version')::integer,'a3145003-0000-4000-8000-000000000003');
  if result->>'status'<>'accepted' then raise exception 'Client could not accept quote'; end if;
  if not exists(select 1 from public.messages where conversation_id=v_conversation_id and message_type='quote') then
    raise exception 'Quote message was not added to the existing conversation';
  end if;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.owner_assign_conversation(v_conversation_id,collaborator_b);
  if coalesce((result->>'changed')::boolean,false) is not true then raise exception 'Owner assignment did not change'; end if;
  if (select collaborator_id from public.bookings where id=v_booking_id) is distinct from collaborator_b then raise exception 'Booking was not reassigned'; end if;
  if not exists(select 1 from public.booking_assignments where booking_assignments.booking_id=v_booking_id and previous_collaborator_id=collaborator_a and public.booking_assignments.collaborator_id=collaborator_b) then
    raise exception 'Assignment audit row missing';
  end if;

  perform set_config('request.jwt.claim.sub',client_id::text,true);
  begin
    perform public.owner_assign_conversation(v_conversation_id,collaborator_a);
    raise exception 'Client unexpectedly reassigned salon conversation';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if not public.revoke_business_collaborator(business_id,collaborator_b) then raise exception 'Owner could not revoke collaborator'; end if;
  if exists(select 1 from booking_private.collaborator_access where collaborator_id=collaborator_b and (profile_id is not null or cardinality(staff_permissions)>0)) then
    raise exception 'Revoked collaborator retained private access';
  end if;
  if exists(select 1 from public.collaborators where id=collaborator_b and (profile_id is not null or is_active or is_bookable)) then
    raise exception 'Revoked public collaborator retained active profile';
  end if;
  if exists(select 1 from public.conversation_members where conversation_members.conversation_id=v_conversation_id and profile_id=staff_b) then
    raise exception 'Revoked collaborator retained conversation membership';
  end if;
  begin
    perform public.owner_assign_conversation(v_conversation_id,collaborator_b);
    raise exception 'Revoked collaborator was assigned again';
  exception when insufficient_privilege then null;
  end;
end
$test$;

rollback;
