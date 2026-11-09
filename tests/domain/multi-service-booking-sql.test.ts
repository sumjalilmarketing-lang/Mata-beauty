import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
let beforeTimezoneFix: string | undefined;
const owner = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
const serviceA = "33333333-3333-4333-8333-333333333333";
const serviceB = "44444444-4444-4444-8444-444444444444";
const business = "55555555-5555-4555-8555-555555555555";
const personA = "66666666-6666-4666-8666-666666666666";
const personB = "77777777-7777-4777-8777-777777777777";
const serviceC = "88888888-8888-4888-8888-888888888888";
const day = "(current_date+7)";
const ids = `array['${serviceA}','${serviceB}']::uuid[]`;
const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
type Created = { id: string; starts_at: string; ends_at: string; total_amount: number; collaborator_name: string | null; collaborator_avatar_url: string | null; services: { id: string; title: string; price_amount: number }[] };
async function create(start = "09:00", person: string | null = null) {
  const rows = await db.query<{ result: Created }>(`select public.create_multi_service_booking(${ids},${day}+time '${start}',${person ? `'${person}'` : "null"}) as result`);
  return rows.rows[0].result;
}
async function expectFailure(action: () => Promise<unknown>, code: string) {
  await db.exec("savepoint rejection");
  let caught: unknown;
  try { await action(); } catch (error) { caught = error; }
  await db.exec("rollback to rejection; release rejection");
  expect(caught).toMatchObject({ code });
}
async function slots() {
  return (await db.query<{ result: { durationMinutes: number; totalAmount: number; services: unknown[]; people: { collaborator_id: string }[]; slots: { slot_start: string; collaborator_id?: string }[] } }>(`select public.get_multi_service_availability(${ids},${day}) as result`)).rows[0].result;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`
    create extension btree_gist;
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema booking_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function booking_private.active_staff_permission(uuid,uuid,text) returns boolean language sql as $$select false$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function public.has_admin_permission(text) returns boolean language sql as $$select false$$;
    create function public.current_collaborator_access() returns table(business_id uuid) language sql as $$select null::uuid where false$$;
    create function public.is_admin() returns boolean language sql as $$select false$$;
    create table public.profiles(id uuid primary key,account_status text,is_suspended boolean,role text default 'client',display_name text,first_name text,last_name text);
    create table public.app_settings(key text primary key,value jsonb);
    insert into public.app_settings values('booking','{"minimum_notice_minutes":60,"cancellation_window_hours":48}');
    create table public.account_roles(profile_id uuid,role text);
    create table public.provider_profiles(profile_id uuid primary key,status text,service_mode text,
      base_address text,latitude double precision,longitude double precision,location_place_id text);
    create table public.businesses(id uuid primary key,owner_id uuid,status text,is_active boolean,archived_at timestamptz,
      team_booking_enabled boolean,address text,latitude numeric,longitude numeric,location_place_id text);
    create table public.provider_services(id uuid primary key,provider_id uuid,business_id uuid,title text,
      duration_minutes integer,price_amount integer,currency char(3),deposit_percentage integer,
      is_active boolean,archived_at timestamptz,status text,location_modes text[] default array['salon'],home_price_amount integer,
      travel_fee_amount integer default 0,deposit_amount integer default 0);
    create table public.service_options(id uuid primary key,provider_service_id uuid,is_active boolean,is_required boolean,price_amount integer,duration_minutes integer,name text default 'Option');
    create table public.promotions(id uuid primary key,provider_id uuid,provider_service_id uuid,status text,is_active boolean,starts_at timestamptz,ends_at timestamptz,max_uses integer,used_count integer,new_clients_only boolean,audience text,promotional_price_amount integer,discount_type text,discount_value integer);
    create table public.follows(follower_id uuid,followed_provider_id uuid);
    create table public.collaborators(id uuid primary key,business_id uuid,display_name text,title text,avatar_url text,
      specialties text[] not null default '{}',is_active boolean,is_bookable boolean,archived_at timestamptz,buffer_minutes integer);
    create table public.collaborator_services(collaborator_id uuid,provider_service_id uuid);
    create table public.collaborator_exceptions(collaborator_id uuid,starts_at timestamptz,ends_at timestamptz,kind text);
    create table public.availability_rules(provider_id uuid,weekday smallint,starts_at time,ends_at time,
      slot_interval_minutes integer,valid_from date,valid_until date);
    create table public.business_hours(business_id uuid,weekday smallint,opens_at time,closes_at time,is_closed boolean);
    create table public.availability_exceptions(provider_id uuid,starts_at timestamptz,ends_at timestamptz,is_available boolean);
    create table public.business_closures(business_id uuid,starts_at timestamptz,ends_at timestamptz);
    create table public.bookings(id uuid primary key default gen_random_uuid(),provider_id uuid,client_id uuid,
      provider_service_id uuid,business_id uuid,collaborator_id uuid,starts_at timestamptz,ends_at timestamptz,
      resource_busy_until timestamptz,status text,total_amount integer,currency char(3),base_amount integer,
      options_amount integer,discount_amount integer,deposit_amount integer,selected_option_ids uuid[],promotion_id uuid,
      conversation_quote_id uuid,location_mode text,appointment_address text,client_note text,source_post_id uuid,
      collaborator_name text,collaborator_avatar_url text,assignment_reason text,appointment_latitude double precision,
      appointment_longitude double precision,appointment_place_id text,travel_distance_km numeric,distance_travel_fee_amount integer,
      created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.payments(id uuid primary key default gen_random_uuid(),booking_id uuid,payment_method text);
    create function booking_private.provider_timezone(uuid,uuid) returns text language sql as $$select 'Africa/Dakar'::text$$;
    create function booking_private.minimum_booking_notice() returns integer language sql as $$select 60$$;
    create function booking_private.employee_windows(target_employee uuid,target_day date)
    returns table(window_start timestamptz,window_end timestamptz,interval_minutes integer) language sql stable as $$
      select (target_day+h.opens_at) at time zone 'Africa/Dakar',(target_day+h.closes_at) at time zone 'Africa/Dakar',30
      from public.collaborators c join public.business_hours h on h.business_id=c.business_id
      where c.id=target_employee and h.weekday=extract(dow from target_day) and not h.is_closed
    $$;
    select set_config('test.user','${client}',false);
    insert into public.profiles(id,account_status,is_suspended) values('${owner}','active',false),('${client}','active',false);
    insert into public.provider_profiles(profile_id,status,service_mode,base_address) values('${owner}','approved','salon','Dakar');
    insert into public.businesses(id,owner_id,status,is_active,team_booking_enabled,address)
      values('${business}','${owner}','approved',true,false,'Salon Dakar');
    insert into public.provider_services(id,provider_id,business_id,title,duration_minutes,price_amount,currency,deposit_percentage,is_active,archived_at,status) values
      ('${serviceA}','${owner}','${business}','Visage',45,10000,'XOF',0,true,null,'published'),
      ('${serviceB}','${owner}','${business}','Manucure',30,5000,'XOF',0,true,null,'published'),
      ('${serviceC}','${owner}',null,'Autre salon',30,1000,'XOF',0,true,null,'published');
    insert into public.business_hours select '${business}',extract(dow from ${day})::smallint,'09:00','13:00',false;
    insert into public.collaborators(id,business_id,display_name,title,avatar_url,is_active,is_bookable,buffer_minutes)
      values('${personA}','${business}','Aida',null,null,true,true,15),('${personB}','${business}','Lisa',null,null,true,true,15);
    insert into public.collaborator_services values('${personA}','${serviceA}'),('${personB}','${serviceA}'),('${personB}','${serviceB}');
  `);
  const dst = await migration("20261031062239_dst_safe_independent_slots.sql");
  await db.exec(dst.slice(dst.indexOf("create or replace function booking_private.local_schedule_slots"), dst.indexOf("create or replace function booking_private.independent_slots")));
  await db.exec(await migration("20261031180040_enforce_nonteam_business_hours.sql"));
  const timezone = await migration("20261030102000_timezone_aware_availability.sql");
  const canAssign = timezone.slice(timezone.indexOf("create or replace function booking_private.can_assign("), timezone.indexOf("-- Replace the existing private helper"));
  await db.exec(canAssign);
  const assignment = await migration("20261008170112_employee_booking_assignment.sql");
  await db.exec(assignment.slice(assignment.indexOf("create or replace function public.enforce_salon_booking_contract()"), assignment.indexOf("do $$ declare definition text; begin", assignment.indexOf("create or replace function public.enforce_salon_booking_contract()"))));
  const lockGuard = await migration("20261008172740_employee_assignment_guards.sql");
  await db.exec(lockGuard.slice(lockGuard.indexOf("create or replace function booking_private.lock_booking_resource"), lockGuard.indexOf("do $$ declare definition text; begin")));
  await db.exec(`create trigger bookings_aa_resource_lock before insert or update on public.bookings for each row execute function booking_private.lock_booking_resource()`);
  await db.exec(await migration("20261008174522_require_enabled_team_assignment.sql"));
  const oldContract = await migration("20260804160000_full_audit_security_fixes.sql");
  await db.exec(oldContract.slice(oldContract.indexOf("create or replace function public.enforce_booking_contract()")));
  const teamFunction = timezone.slice(timezone.indexOf("create or replace function public.get_team_available_slots("), timezone.indexOf("revoke all on function public.get_team_available_slots("));
  await db.exec(teamFunction);
  await db.exec(`
    create trigger bookings_enforce_salon_contract before insert on public.bookings for each row execute function public.enforce_salon_booking_contract();
    create trigger bookings_protect_salon_contract before update on public.bookings for each row execute function public.protect_salon_booking_contract();
    alter table public.bookings add constraint bookings_no_active_resource_overlap exclude using gist (
      provider_id with =,(coalesce(collaborator_id,provider_id)) with =,
      tstzrange(starts_at,coalesce(resource_busy_until,ends_at),'[)') with &&)
      where(status in ('pending','confirmed','in_progress'));
  `);
  await db.exec(await readFile(new URL("./multi-service-server-quote.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../fixtures/audit/booking-validation-before.sql", import.meta.url), "utf8"));
  const audit = await migration("20261103161056_audit_booking_and_legacy_media_guards.sql");
  await db.exec(audit.slice(audit.indexOf("do $migration$"), audit.indexOf("create policy")));
  await db.exec(await migration("20261103200423_staff_booking_reassignment.sql"));
  await db.exec(await migration("20261104171000_owner_booking_reschedule.sql"));
  await db.exec(await migration("20261105163236_repair_self_booking_provider_actions.sql"));
  await db.exec(await migration("20261109122456_independent_reschedule_historical_interval.sql"));
  await db.exec(`create trigger bookings_validate before update on public.bookings for each row execute function public.validate_booking_update()`);
  const slotContract = await migration("20261031173823_enforce_international_booking_availability.sql");
  await db.exec(slotContract.slice(slotContract.indexOf("create or replace function public.get_available_slots("),slotContract.indexOf("-- Runs after server price/duration normalization")));
  await db.exec(slotContract.slice(slotContract.indexOf("create or replace function booking_private.validate_bookable_slot()")));
  await db.exec(await migration("20261104230907_enforce_configured_booking_notice.sql"));
  await db.exec(await migration("20261109125316_client_booking_reschedule.sql"));
  await db.exec(await readFile(new URL("../fixtures/team-agenda-production.sql", import.meta.url), "utf8"));
  await db.exec("begin");
  await db.exec(`create or replace function booking_private.provider_timezone(uuid,uuid) returns text language sql as $$select 'America/New_York'::text$$;
    update public.business_hours set opens_at='20:00',closes_at='23:30'`);
  try {
    await db.query(`insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,total_amount,currency,location_mode)
      values('${client}','${owner}','${serviceA}',(${day}+time '22:00') at time zone 'America/New_York',(${day}+time '22:45') at time zone 'America/New_York',10000,'XOF','salon')`);
  } catch (error) { beforeTimezoneFix=(error as { code?: string }).code; }
  await db.exec("rollback");
  await db.exec(await migration("20261109125333_atomic_multi_service_booking.sql"));
  await db.exec(`
    grant usage on schema public,auth,booking_private to authenticated;
    grant select on public.profiles,public.businesses to authenticated;
    grant select on public.provider_services to authenticated;
    grant select,insert,update on public.bookings to authenticated;
    alter table public.bookings enable row level security;
    create policy read_member on public.bookings for select to authenticated using(client_id=auth.uid() or provider_id=auth.uid());
    create policy update_member on public.bookings for update to authenticated using(client_id=auth.uid() or provider_id=auth.uid()) with check(client_id=auth.uid() or provider_id=auth.uid());
    create policy insert_client on public.bookings for insert to authenticated with check(client_id=auth.uid());
  `);
}, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

it("returns one continuous 75-minute calendar and server quote for 45+30 minutes", async () => {
  const result = await slots();
  expect(result.durationMinutes).toBe(75); expect(result.totalAmount).toBe(15000); expect(result.services).toHaveLength(2);
  expect(result.slots.some(s => s.slot_start.includes("11:30"))).toBe(true);
  expect(result.slots.some(s => s.slot_start.includes("12:00"))).toBe(false);
});
it("creates one appointment with immutable per-service prices and total duration", async () => {
  const result = await create();
  expect(result.total_amount).toBe(15000); expect(result.services.map(s => s.price_amount)).toEqual([10000, 5000]);
  expect(Date.parse(result.ends_at) - Date.parse(result.starts_at)).toBe(75 * 60_000);
  expect((await db.query<{ count: number }>("select count(*)::integer count from public.bookings")).rows[0].count).toBe(1);
  expect(result.collaborator_name).toBeNull(); expect(result.collaborator_avatar_url).toBeNull();
});
it("ignores forged duration, amount, currency and snapshot in a direct insertion", async () => {
  const r = await db.query<{ total_amount: number; currency: string; minutes: number; title: string }>(`insert into public.bookings(client_id,provider_id,provider_service_id,service_ids,service_snapshot,starts_at,ends_at,total_amount,currency,location_mode)
    values('${client}','${client}','${serviceA}',${ids},'[{"title":"forged"}]',${day}+time '09:00',${day}+time '09:01',1,'EUR','salon')
    returning total_amount,currency,extract(epoch from ends_at-starts_at)/60 minutes,service_snapshot->0->>'title' title`);
  expect(r.rows[0]).toMatchObject({ total_amount: 15000, currency: "XOF", title: "Visage" });
  expect(Number(r.rows[0].minutes)).toBe(75);
});
it("rejects duplicate, missing, mixed-establishment and mixed-currency services", async () => {
  for (const selection of [`array['${serviceA}','${serviceA}']::uuid[]`, `array['${serviceA}',null]::uuid[]`, `array['${serviceA}','${serviceC}']::uuid[]`]) {
    await expectFailure(() => db.query(`select public.get_multi_service_availability(${selection},${day})`), "22023");
  }
  await db.exec(`update public.provider_services set currency='EUR' where id='${serviceB}'`);
  await expectFailure(slots, "22023");
});
it("does not fit the bundle around an interruption after the first service", async () => {
  await db.exec(`insert into public.business_closures values('${business}',${day}+time '10:00',${day}+time '10:30')`);
  expect((await slots()).slots.some(s => s.slot_start.includes("09:00"))).toBe(false);
  await expectFailure(() => create(), "23P01");
  expect((await db.query<{ count: number }>("select count(*)::integer count from public.bookings")).rows[0].count).toBe(0);
});
it("chooses only a collaborator qualified for every service for the full block", async () => {
  await db.exec("update public.businesses set team_booking_enabled=true");
  const available = await slots();
  expect(available.people.map(p => p.collaborator_id)).toEqual([personB]);
  expect(available.slots.every(s => s.collaborator_id === personB)).toBe(true);
  const booked = await create(); expect(booked.collaborator_name).toBe("Lisa");
});
it("refuses an explicitly selected person qualified only for the first service", async () => {
  await db.exec("update public.businesses set team_booking_enabled=true");
  await expectFailure(() => create("09:00", personA), "23P01");
});
it("includes cleaning buffer and rejects a second overlapping composite booking", async () => {
  await db.exec("update public.businesses set team_booking_enabled=true");
  await create("09:00", personB);
  await expectFailure(() => create("10:00", personB), "23P01");
  expect((await slots()).slots.some(s => s.slot_start.includes("10:30"))).toBe(true);
  expect((await slots()).slots.some(s => s.slot_start.includes("12:00"))).toBe(false);
});
it("freezes contracted service snapshots even after catalog changes", async () => {
  const booked = await create();
  await db.exec(`update public.provider_services set price_amount=99999,duration_minutes=90 where id='${serviceB}'`);
  const row = (await db.query<{ total_amount: number; services: { price_amount: number }[] }>(`select total_amount,service_snapshot services from public.bookings where id='${booked.id}'`)).rows[0];
  expect(row.total_amount).toBe(15000); expect(row.services[1].price_amount).toBe(5000);
  await db.exec(`select set_config('test.user','${owner}',true)`);
  await expectFailure(() => db.exec(`update public.bookings set service_snapshot='[]',status='confirmed' where id='${booked.id}'`), "42501");
});
it("rejects unauthorized and unsupported contract inputs", async () => {
  await db.exec(`select set_config('test.user','${owner}',true)`);
  await expectFailure(() => db.query(`insert into public.bookings(client_id,provider_service_id,service_ids,starts_at,location_mode)
    values('${client}','${serviceA}',${ids},${day}+time '09:00','salon')`), "42501");
  await db.exec(`select set_config('test.user','${client}',true)`);
  await expectFailure(() => db.query(`select public.create_multi_service_booking(${ids},${day}+time '09:00',null,'client_address')`), "22023");
});
it("keeps privileged helpers private and the creation endpoint authenticated", async () => {
  const r = await db.query<{ allowed: boolean }>(`select has_function_privilege('anon','public.create_multi_service_booking(uuid[],timestamptz,uuid,text,text,text,uuid,uuid[])','execute') allowed
    union all select has_function_privilege('authenticated','booking_private.prepare_multi_booking(public.bookings)','execute')
    union all select has_function_privilege('anon','booking_private.multi_service_quote(uuid[],uuid[],text)','execute')`);
  expect(r.rows.every(x => !x.allowed)).toBe(true);
});

it("enforces on-site-only payments below every financial RPC", async () => {
  const booked = await create();
  await expectFailure(() => db.exec(`insert into public.payments(booking_id,payment_method) values('${booked.id}','wave')`), "23514");
  await db.exec(`insert into public.payments(booking_id,payment_method) values('${booked.id}','on_site')`);
  await expectFailure(() => db.exec(`update public.payments set payment_method='card' where booking_id='${booked.id}'`), "23514");
});

it("applies the all-service contract to client report listings and staff reassignment candidates", async () => {
  await db.exec("update public.businesses set team_booking_enabled=true");
  const booked = await create("09:00", personB);
  const before = await db.query(`select * from booking_private.client_reschedule_slots('${booked.id}',${day})`);
  expect(before.rows.length).toBeGreaterThan(0);
  await db.exec(`delete from public.collaborator_services where collaborator_id='${personB}' and provider_service_id='${serviceB}'`);
  expect((await db.query(`select * from booking_private.client_reschedule_slots('${booked.id}',${day})`)).rows).toHaveLength(0);
  await db.exec(`select set_config('test.user','${owner}',true)`);
  expect((await db.query(`select * from public.get_reassignment_candidates('${booked.id}')`)).rows).toHaveLength(0);
});
it("shows contracted names and reports revoked extra-service skills in the manager agenda", async () => {
  await db.exec("update public.businesses set team_booking_enabled=true");
  await create("09:00", personB);
  await db.exec(`select set_config('test.user','${owner}',true);delete from public.collaborator_services where collaborator_id='${personB}' and provider_service_id='${serviceB}'`);
  const agenda = (await db.query<{ result: { service_title: string; assignment_conflict: boolean }[] }>(`select public.get_team_agenda('${business}',${day},1) result`)).rows[0].result;
  expect(agenda[0]).toMatchObject({ service_title: "Visage + Manucure", assignment_conflict: true });
});
it("uses participant RLS for multi-service appointment snapshots", async () => {
  await db.exec("set local role authenticated");
  const booked = await create();
  expect((await db.query(`select service_snapshot from public.bookings where id='${booked.id}'`)).rows).toHaveLength(1);
  await db.exec(`select set_config('test.user','${personA}',true)`);
  expect((await db.query(`select service_snapshot from public.bookings where id='${booked.id}'`)).rows).toHaveLength(0);
});

it("includes required option amounts and elapsed durations from the actual server quote", async () => {
  await db.exec(`insert into public.service_options(id,provider_service_id,is_active,is_required,price_amount,duration_minutes) values('${personA}','${serviceB}',true,true,2500,15)`);
  const quote = await slots(); expect(quote.totalAmount).toBe(17500); expect(quote.durationMinutes).toBe(90);
  const result = await create(); expect(result.total_amount).toBe(17500);
  const row = (await db.query<{ base_amount: number; options_amount: number; ids: string[] }>(`select base_amount,options_amount,
    array(select jsonb_array_elements_text(service_snapshot->1->'selected_option_ids')) as ids from public.bookings where id='${result.id}'`)).rows[0];
  expect(row).toMatchObject({ base_amount: 15000, options_amount: 2500, ids: [personA] });
});
it("supports the actual owner status lifecycle without weakening immutable bundle fields", async () => {
  const result = await create();
  await db.exec(`select set_config('test.user','${owner}',true);set local role authenticated`);
  for (const status of ['confirmed','in_progress','completed']) {
    await db.exec(`update public.bookings set status='${status}' where id='${result.id}'`);
  }
  const row = (await db.query<{ status: string; total_amount: number }>(`select status,total_amount from public.bookings where id='${result.id}'`)).rows[0];
  expect(row).toEqual({ status: 'completed', total_amount: 15000 });
});
it("reports the composite appointment through the actual authenticated client RPC", async () => {
  const result = await create();
  await db.exec("set local role authenticated");
  await db.query(`select public.reschedule_client_booking('${result.id}',${day}+time '10:00')`);
  const row = (await db.query<{ minutes: number; total_amount: number; snapshot_count: number }>(`select extract(epoch from ends_at-starts_at)/60 as minutes,total_amount,
    jsonb_array_length(service_snapshot) as snapshot_count from public.bookings where id='${result.id}'`)).rows[0];
  expect(Number(row.minutes)).toBe(75); expect(row.total_amount).toBe(15000); expect(row.snapshot_count).toBe(2);
});
it("validates every service during actual owner reassignment and owner report", async () => {
  await db.exec("update public.businesses set team_booking_enabled=true");
  const result = await create("09:00", personB);
  await db.exec(`select set_config('test.user','${owner}',true);set local role authenticated`);
  await expectFailure(() => db.query(`select public.reassign_booking_collaborator('${result.id}','${personA}','Changement équipe')`), "23P01");
  await db.exec("reset role");
  await db.exec(`insert into public.collaborator_services values('${personA}','${serviceB}');set local role authenticated`);
  await db.query(`select public.reassign_booking_collaborator('${result.id}','${personA}','Changement équipe')`);
  await db.query(`select public.reschedule_owned_booking('${result.id}',${day}+time '10:00')`);
  expect((await db.query<{ collaborator_id: string }>(`select collaborator_id from public.bookings where id='${result.id}'`)).rows[0].collaborator_id).toBe(personA);
});

it("applies optional variants only to their own service and freezes their historical contract", async () => {
  await db.exec(`insert into public.service_options(id,provider_service_id,is_active,is_required,price_amount,duration_minutes) values('${personA}','${serviceB}',true,false,3000,15)`);
  const available = (await db.query<{ result: { totalAmount: number; durationMinutes: number } }>(`select public.get_multi_service_availability(${ids},${day},1,array['${personA}']::uuid[]) result`)).rows[0].result;
  expect(available).toMatchObject({ totalAmount: 18000, durationMinutes: 90 });
  const result = (await db.query<{ result: Created }>(`select public.create_multi_service_booking(${ids},${day}+time '09:00',target_option_ids=>array['${personA}']::uuid[]) result`)).rows[0].result;
  expect(result.total_amount).toBe(18000); expect(result.services[1].price_amount).toBe(8000);
  await db.exec(`select set_config('test.user','${owner}',true)`);
  await expectFailure(() => db.exec(`update public.bookings set selected_option_ids='{}',status='confirmed' where id='${result.id}'`), "42501");
});
it("rejects variants belonging to an unselected service and oversized option selections", async () => {
  await db.exec(`insert into public.service_options(id,provider_service_id,is_active,is_required,price_amount,duration_minutes) values('${personA}','${serviceC}',true,false,3000,15)`);
  await expectFailure(() => db.query(`select public.get_multi_service_availability(${ids},${day},1,array['${personA}']::uuid[])`), "22023");
  await expectFailure(() => db.query(`select public.get_multi_service_availability(${ids},${day},1,array_fill('${personA}'::uuid,array[33]))`), "22023");
});

it("books a single service variant with extended server duration through the same composite contract", async () => {
  await db.exec(`insert into public.service_options(id,provider_service_id,is_active,is_required,price_amount,duration_minutes,name) values('${personA}','${serviceA}',true,false,2000,30,'Cheveux longs')`);
  const r = (await db.query<{ result: Created }>(`select public.create_multi_service_booking(array['${serviceA}']::uuid[],${day}+time '09:00',target_option_ids=>array['${personA}']::uuid[]) result`)).rows[0].result;
  expect(r.total_amount).toBe(12000); expect(Date.parse(r.ends_at)-Date.parse(r.starts_at)).toBe(75*60_000);
  expect(r.services[0].title).toBe('Visage (Cheveux longs)');
  await expectFailure(() => db.query(`select public.get_multi_service_availability('{}'::uuid[],${day})`), '22023');
});

it("preserves the richer existing mono-service production pricing path", async () => {
  const row = (await db.query<{ total_amount: number; minutes: number; service_ids: null }>(`insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,total_amount,currency,location_mode)
    values('${client}','${owner}','${serviceA}',${day}+time '09:00',${day}+time '09:01',1,'EUR','salon') returning total_amount,extract(epoch from ends_at-starts_at)/60 minutes,service_ids`)).rows[0];
  expect(row.total_amount).toBe(10000); expect(Number(row.minutes)).toBe(45); expect(row.service_ids).toBeNull();
});

it("reproduces and fixes the original late-evening New York mono-service day mismatch", async () => {
  expect(beforeTimezoneFix).toBe('23P01');
  await db.exec(`create or replace function booking_private.provider_timezone(uuid,uuid) returns text language sql as $$select 'America/New_York'::text$$;
    update public.business_hours set opens_at='20:00',closes_at='23:30'`);
  const r = await db.query<{ local_time: string }>(`insert into public.bookings(client_id,provider_id,provider_service_id,starts_at,ends_at,total_amount,currency,location_mode)
    values('${client}','${owner}','${serviceA}',(${day}+time '22:00') at time zone 'America/New_York',(${day}+time '22:01') at time zone 'America/New_York',1,'EUR','salon')
    returning (starts_at at time zone 'America/New_York')::time::text local_time`);
  expect(r.rows[0].local_time).toBe('22:00:00');
});
it("searches a named qualified collaborator before a team-wide cap can hide her slots", async () => {
  await db.exec(`update public.businesses set team_booking_enabled=true;
    create or replace function public.get_team_available_slots(target_provider_service_id uuid,from_date date default current_date,days integer default 1)
    returns table(slot_start timestamptz,collaborator_id uuid,display_name text,title text,avatar_url text,specialties text[])
    language sql stable security definer set search_path='' as $$select null::timestamptz,null::uuid,null::text,null::text,null::text,null::text[] where false$$`);
  const r = (await db.query<{ result: { slots: { collaborator_id: string }[] } }>(`select public.get_multi_service_availability(${ids},${day},14,'{}'::uuid[],'${personB}') result`)).rows[0].result;
  expect(r.slots.length).toBeGreaterThan(0); expect(r.slots.every(s => s.collaborator_id===personB)).toBe(true);
  const wrong = (await db.query<{ result: { slots: unknown[] } }>(`select public.get_multi_service_availability(${ids},${day},14,'{}'::uuid[],'${personA}') result`)).rows[0].result;
  expect(wrong.slots).toHaveLength(0);
});

it("provides duration-aware mobile single-service variant availability without inventing a travel final price", async () => {
  await db.exec(`update public.provider_profiles set service_mode='mobile';
    update public.provider_services set location_modes=array['client_address'],home_price_amount=12000,travel_fee_amount=1000 where id='${serviceA}';
    insert into public.service_options(id,provider_service_id,is_active,is_required,price_amount,duration_minutes,name) values('${personA}','${serviceA}',true,false,2000,30,'Cheveux longs')`);
  const r = (await db.query<{ result: { totalAmount: number; durationMinutes: number; distanceTravelPending: boolean } }>(`select public.get_multi_service_availability(array['${serviceA}']::uuid[],${day},1,array['${personA}']::uuid[],null,'client_address') result`)).rows[0].result;
  expect(r).toMatchObject({ totalAmount: 15000, durationMinutes: 75, distanceTravelPending: true });
  await expectFailure(() => db.query(`select public.get_multi_service_availability(${ids},${day},1,'{}'::uuid[],null,'client_address')`), '22023');
});

it("preserves the production team-agenda timezone boundary and its JSON field names", async () => {
  await db.exec(`create or replace function booking_private.provider_timezone(uuid,uuid) returns text language sql as $$select 'America/New_York'::text$$;
    update public.business_hours set opens_at='20:00',closes_at='23:30'`);
  const created = (await db.query<{ result: Created }>(`select public.create_multi_service_booking(${ids},(${day}+time '22:00') at time zone 'America/New_York') result`)).rows[0].result;
  await db.exec(`select set_config('test.user','${owner}',true)`);
  const rows = (await db.query<{ result: { id: string; starts_at: string; service_title: string; client_name: string; assignment_conflict: boolean }[] }>(`select public.get_team_agenda('${business}',${day},1) result`)).rows[0].result;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: created.id, service_title: 'Visage + Manucure', client_name: 'Client', assignment_conflict: false });
  expect(Date.parse(rows[0].starts_at)).toBe(Date.parse(created.starts_at));
});
