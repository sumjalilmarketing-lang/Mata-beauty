-- TEST PROJECT ONLY. Synthetic users and invitations; no email; complete rollback.
begin;
select set_config('test.link_owner',gen_random_uuid()::text,true),
       set_config('test.link_recipient',gen_random_uuid()::text,true),
       set_config('test.link_other',gen_random_uuid()::text,true),
       set_config('test.link_unconfirmed',gen_random_uuid()::text,true),
       set_config('test.link_business',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select current_setting(k)::uuid,'link-qa-'||current_setting(k)||'@example.invalid',
       case when k='test.link_unconfirmed' then null else now() end,
       '{"qa_suppress_email":true}'::jsonb,'{"display_name":"Invitation QA rollback"}'::jsonb
from (values('test.link_owner'),('test.link_recipient'),('test.link_other'),('test.link_unconfirmed')) t(k);
insert into public.profiles(id,display_name)
select current_setting(k)::uuid,'Invitation QA rollback'
from (values('test.link_owner'),('test.link_recipient'),('test.link_other'),('test.link_unconfirmed')) t(k)
on conflict(id) do nothing;
insert into public.provider_profiles(profile_id,business_name,slug)
values(current_setting('test.link_owner')::uuid,'Invitation QA rollback','link-qa-'||current_setting('test.link_owner'));
insert into public.businesses(id,owner_id,name,slug,address,city)
values(current_setting('test.link_business')::uuid,current_setting('test.link_owner')::uuid,'Invitation QA rollback','link-qa-'||current_setting('test.link_business'),'QA','QA');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_other'),'role','authenticated')::text,true);
do $$ begin
  begin
    perform public.create_business_invitation(current_setting('test.link_business')::uuid,'link-qa-'||current_setting('test.link_recipient')||'@example.invalid','member',array['bookings.read'],repeat('a',64));
    raise exception 'Non-owner created invitation';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_owner'),'role','authenticated')::text,true);
select set_config('test.link_invitation',public.create_business_invitation(current_setting('test.link_business')::uuid,'link-qa-'||current_setting('test.link_recipient')||'@example.invalid','member',array['bookings.read'],repeat('a',64))::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_unconfirmed'),'role','authenticated')::text,true);
do $$ begin
  begin
    perform public.accept_business_invitation(repeat('a',64));
    raise exception 'Unconfirmed email accepted';
  exception when raise_exception then
    if sqlerrm='Unconfirmed email accepted' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_other'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.accept_business_invitation(repeat('a',64)); raise exception 'Other email accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_recipient'),'role','authenticated')::text,true);
select set_config('test.link_collaborator',public.accept_business_invitation(repeat('a',64))::text,true);
do $$ begin
  begin perform public.accept_business_invitation(repeat('a',64)); raise exception 'Token reused';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.business_invitations where id=current_setting('test.link_invitation')::uuid and status='accepted' and sent_at is null and accepted_by=current_setting('test.link_recipient')::uuid) then raise exception 'Link-only acceptance failed'; end if;
  if exists(select 1 from booking_private.business_invitation_secrets where invitation_id=current_setting('test.link_invitation')::uuid) then raise exception 'Used secret retained'; end if;
  if not exists(select 1 from booking_private.collaborator_access where collaborator_id=current_setting('test.link_collaborator')::uuid and internal_role='member' and permissions=array['bookings.read']::text[]) then raise exception 'Role or permissions changed'; end if;
  if exists(select 1 from booking_private.business_invitation_events where invitation_id=current_setting('test.link_invitation')::uuid and event_type='delivery_confirmed') then raise exception 'Invented email delivery'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_owner'),'role','authenticated')::text,true);
select set_config('test.link_revoked',public.create_business_invitation(current_setting('test.link_business')::uuid,'link-qa-'||current_setting('test.link_recipient')||'@example.invalid','member',array['bookings.read'],repeat('b',64))::text,true);
select public.revoke_business_invitation(current_setting('test.link_revoked')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_recipient'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.accept_business_invitation(repeat('b',64)); raise exception 'Revoked token accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_owner'),'role','authenticated')::text,true);
select set_config('test.link_expired',public.create_business_invitation(current_setting('test.link_business')::uuid,'link-qa-'||current_setting('test.link_recipient')||'@example.invalid','member',array['bookings.read'],repeat('c',64))::text,true);
reset role;
update public.business_invitations set expires_at=now()-interval '1 second' where id=current_setting('test.link_expired')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.link_recipient'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.accept_business_invitation(repeat('c',64)); raise exception 'Expired token accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: owner-only creation, confirmed recipient, exact grants, single use, revocation, expiry, no invented delivery; all rolled back' as result;
rollback;
