-- Run only against an isolated Supabase/PostgreSQL database. Every setting
-- update and fixture row is inside a transaction that is rolled back.
begin;
create temporary table booking_rule_assertions (
  assertion text primary key,
  passed boolean not null check (passed)
) on commit drop;

do $$
declare
  changed integer;
  actual_notice integer;
  actual_cancellation integer;
  client_one constant uuid := 'a0000001-0000-4000-8000-000000000001';
  client_two constant uuid := 'a0000002-0000-4000-8000-000000000002';
  admin_user constant uuid := 'a0000003-0000-4000-8000-000000000003';
  actual_message text;
begin
  if to_regprocedure('booking_private.read_platform_booking_rules()') is null then raise exception 'Assertion 01 failed: settings helper missing'; end if;
  insert into booking_rule_assertions values ('01 private settings helper exists', true);

  if to_regprocedure('public.get_booking_settings_enforcement_status()') is null then raise exception 'Assertion 02 failed: admin probe missing'; end if;
  insert into booking_rule_assertions values ('02 permission-gated admin probe exists', true);

  if not exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='bookings_00_platform_booking_notice' and not tgisinternal) then raise exception 'Assertion 03 failed: lead-time trigger missing'; end if;
  insert into booking_rule_assertions values ('03 insert trigger exists', true);

  if not exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='bookings_00_platform_cancellation_window' and not tgisinternal) then raise exception 'Assertion 04 failed: cancellation trigger missing'; end if;
  insert into booking_rule_assertions values ('04 cancellation trigger exists', true);

  if has_function_privilege('anon','booking_private.read_platform_booking_rules()','EXECUTE') then raise exception 'Assertion 05 failed: anon can execute private helper'; end if;
  insert into booking_rule_assertions values ('05 anon cannot execute private helper', true);

  if has_function_privilege('authenticated','booking_private.read_platform_booking_rules()','EXECUTE') then raise exception 'Assertion 06 failed: authenticated can execute private helper'; end if;
  insert into booking_rule_assertions values ('06 authenticated cannot execute private helper', true);

  if has_function_privilege('anon','public.get_booking_settings_enforcement_status()','EXECUTE') then raise exception 'Assertion 07 failed: anon can execute admin probe'; end if;
  insert into booking_rule_assertions values ('07 anon cannot execute admin probe', true);

  if not has_function_privilege('authenticated','public.get_booking_settings_enforcement_status()','EXECUTE') then raise exception 'Assertion 08 failed: authenticated cannot call permission-gated probe'; end if;
  insert into booking_rule_assertions values ('08 authenticated may call permission-gated probe', true);

  update public.app_settings set value='{"minimum_notice_minutes":120,"cancellation_window_hours":3}'::jsonb where key='booking';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Assertion 09 failed: booking setting row missing'; end if;
  select rules.minimum_notice_minutes,rules.cancellation_window_hours into actual_notice,actual_cancellation from booking_private.read_platform_booking_rules() rules;
  if actual_notice <> 120 or actual_cancellation <> 3 then raise exception 'Assertion 09 failed: helper did not read transaction-local settings'; end if;
  insert into booking_rule_assertions values ('09 helper reads configured booking values', true);

  create temporary table booking_notice_fixture(starts_at timestamptz not null);
  create trigger booking_notice_fixture_trigger before insert on booking_notice_fixture for each row execute function booking_private.enforce_platform_booking_notice();
  begin
    insert into booking_notice_fixture values (now()+interval '60 minutes');
    raise exception 'Assertion 10 failed: short notice insert was accepted';
  exception when check_violation then
    get stacked diagnostics actual_message = message_text;
    if actual_message <> 'Ce rendez-vous doit respecter un préavis minimum de 120 minutes.' then raise; end if;
  end;
  insert into booking_rule_assertions values ('10 insert inside minimum notice is rejected', true);
  insert into booking_notice_fixture values (now()+interval '121 minutes');
  insert into booking_rule_assertions values ('11 insert outside minimum notice is accepted', true);

  create temporary table booking_cancel_fixture(client_id uuid not null,starts_at timestamptz not null,status public.booking_status not null);
  create trigger booking_cancel_fixture_trigger before update of status on booking_cancel_fixture for each row execute function booking_private.enforce_platform_cancellation_window();
  insert into booking_cancel_fixture values (client_one,now()+interval '2 hours','confirmed'),(client_one,now()+interval '4 hours','confirmed'),(client_two,now()+interval '2 hours','confirmed');
  perform set_config('request.jwt.claim.sub',client_one::text,true);
  begin
    update booking_cancel_fixture set status='cancelled_by_client' where client_id=client_one and starts_at < now()+interval '3 hours';
    raise exception 'Assertion 12 failed: client cancellation inside window was accepted';
  exception when check_violation then
    get stacked diagnostics actual_message = message_text;
    if actual_message <> 'Cette réservation doit être annulée au moins 3 heures avant le rendez-vous.' then raise; end if;
  end;
  insert into booking_rule_assertions values ('12 client cancellation inside window is rejected', true);
  update booking_cancel_fixture set status='cancelled_by_client' where client_id=client_one and starts_at >= now()+interval '3 hours';
  insert into booking_rule_assertions values ('13 client cancellation outside window is accepted', true);
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  update booking_cancel_fixture set status='cancelled_by_client' where client_id=client_two;
  insert into booking_rule_assertions values ('14 authorized non-client status override is not blocked by client rule', true);

  begin
    update public.app_settings set value='{"minimum_notice_minutes":-1,"cancellation_window_hours":24}'::jsonb where key='booking';
    raise exception 'Assertion 15 failed: invalid setting was accepted';
  exception when check_violation then
    insert into booking_rule_assertions values ('15 invalid booking settings are rejected', true);
  end;
end;
$$;

grant select,insert on booking_rule_assertions to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000004-0000-4000-8000-000000000004',true);
do $$
begin
  begin
    perform public.get_booking_settings_enforcement_status();
    raise exception 'Assertion 16 failed: ordinary authenticated user passed admin permission check';
  exception when insufficient_privilege then
    insert into booking_rule_assertions values ('16 ordinary authenticated user is denied admin status probe', true);
  end;
end;
$$;
reset role;

do $$
declare
  test_admin_id uuid;
  enforcement_active boolean;
begin
  select p.id into test_admin_id
  from public.profiles p
  join public.admin_user_roles m on m.user_id=p.id
  join public.admin_roles r on r.id=m.role_id
  where p.role='admin' and not p.is_suspended and m.is_active and m.revoked_at is null
    and r.is_active and r.key='super_admin'
  order by p.id
  limit 1;
  if test_admin_id is null then raise exception 'Assertion 17 failed: authorized QA Super Admin fixture missing'; end if;
  perform set_config('request.jwt.claim.sub',test_admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_admin_id::text,'role','authenticated','aal','aal2')::text,true);
  enforcement_active := public.get_booking_settings_enforcement_status();
  if not enforcement_active then raise exception 'Assertion 17 failed: QA Super Admin was not authorized'; end if;
  insert into booking_rule_assertions values ('17 QA Super Admin JWT claim with MFA is authorized by status probe', true);
end;
$$;

select assertion,passed from booking_rule_assertions order by assertion;
rollback;
