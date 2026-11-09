import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
let beforeFix: { overlap: boolean; overrun: boolean };
const owner = "11111111-1111-4111-8111-111111111111";
const service = "22222222-2222-4222-8222-222222222222";
const booking = "33333333-3333-4333-8333-333333333333";
const business = "44444444-4444-4444-8444-444444444444";
const other = "55555555-5555-4555-8555-555555555555";
const day = "(current_date+7)";
const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

async function available(start: string, end: string) {
  const result = await db.query<{ available: boolean }>(`select booking_private.owner_booking_slot_available(
    '${booking}', ${day}+time '${start}', ${day}+time '${end}') as available`);
  return result.rows[0].available;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema booking_private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.user',true),'')::uuid
    $$;
    create table public.profiles(id uuid primary key,account_status text,is_suspended boolean);
    create table public.provider_profiles(profile_id uuid primary key,status text);
    create table public.businesses(id uuid primary key,owner_id uuid,status text,is_active boolean,archived_at timestamptz);
    create table public.provider_services(id uuid primary key,provider_id uuid,business_id uuid,duration_minutes integer,
      is_active boolean,archived_at timestamptz,status text);
    create table public.availability_rules(provider_id uuid,weekday smallint,starts_at time,ends_at time,
      slot_interval_minutes integer,valid_from date,valid_until date);
    create table public.business_hours(business_id uuid,weekday smallint,opens_at time,closes_at time,is_closed boolean);
    create table public.availability_exceptions(provider_id uuid,starts_at timestamptz,ends_at timestamptz,is_available boolean);
    create table public.business_closures(business_id uuid,starts_at timestamptz,ends_at timestamptz);
    create table public.bookings(id uuid primary key,provider_id uuid,provider_service_id uuid,business_id uuid,
      collaborator_id uuid,starts_at timestamptz,ends_at timestamptz,resource_busy_until timestamptz,status text);
    create function booking_private.provider_timezone(uuid,uuid) returns text language sql as $$select 'Africa/Dakar'::text$$;
    create function booking_private.minimum_booking_notice() returns integer language sql as $$select 60$$;
    create function booking_private.can_assign(uuid,uuid,timestamptz,timestamptz,uuid) returns boolean language sql as $$select false$$;
    grant usage on schema booking_private,auth to anon,authenticated;
    select set_config('test.user','${owner}',false);
    insert into public.profiles values('${owner}','active',false);
    insert into public.provider_profiles values('${owner}','approved');
    insert into public.businesses values('${business}','${owner}','approved',true,null);
    insert into public.provider_services values('${service}','${owner}','${business}',30,true,null,'published');
    insert into public.business_hours select '${business}',extract(dow from ${day})::smallint,'09:00','13:00',false;
    insert into public.bookings values('${booking}','${owner}','${service}','${business}',null,
      ${day}+time '09:00',${day}+time '10:30',${day}+time '10:30','confirmed');
  `);
  const slotsSql = await migration("20261031062239_dst_safe_independent_slots.sql");
  const localFunction = slotsSql.slice(slotsSql.indexOf("create or replace function booking_private.local_schedule_slots"), slotsSql.indexOf("create or replace function booking_private.independent_slots"));
  await db.exec(localFunction);
  await db.exec(await migration("20261031180040_enforce_nonteam_business_hours.sql"));
  const ownerSql = await migration("20261104171000_owner_booking_reschedule.sql");
  await db.exec(ownerSql.slice(ownerSql.indexOf("create function booking_private.owner_booking_slot_available"), ownerSql.indexOf("do $patch$")));
  beforeFix = { overlap: await available("09:30", "11:00"), overrun: await available("12:30", "14:00") };
  await db.exec(await migration("20261109121051_independent_reschedule_historical_interval.sql"));
}, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

it("reproduces both historical defects using the actual previous migration functions", () => {
  expect(beforeFix).toEqual({ overlap: false, overrun: true });
});
it("ignores only its own old booking when moving into a partially overlapping range", async () => {
  expect(await available("09:30", "11:00")).toBe(true);
});
it("rejects a historical duration extending beyond closing after the service was shortened", async () => {
  expect(await available("12:30", "14:00")).toBe(false);
  expect(await available("11:30", "13:00")).toBe(true);
});
it("does not unnecessarily adopt a longer newly configured service duration", async () => {
  await db.exec(`update public.provider_services set duration_minutes=180`);
  expect(await available("11:30", "13:00")).toBe(true);
});
it("still rejects a different active booking and permits an exactly adjacent range", async () => {
  await db.exec(`insert into public.bookings values('${other}','${owner}','${service}','${business}',null,
    ${day}+time '11:00',${day}+time '11:30',${day}+time '11:30','confirmed')`);
  expect(await available("10:00", "11:30")).toBe(false);
  expect(await available("09:30", "11:00")).toBe(true);
});
it("checks closures over the entire preserved duration", async () => {
  await db.exec(`insert into public.business_closures values('${business}',${day}+time '11:00',${day}+time '11:30')`);
  expect(await available("10:00", "11:30")).toBe(false);
});
it("checks provider exceptions over the entire preserved duration", async () => {
  await db.exec(`insert into public.availability_exceptions values('${owner}',${day}+time '11:00',${day}+time '11:30',false)`);
  expect(await available("10:00", "11:30")).toBe(false);
});
it("includes the contracted cleanup buffer when checking closing", async () => {
  await db.exec(`update public.bookings set resource_busy_until=ends_at+interval '30 minutes'`);
  expect(await available("11:30", "13:00")).toBe(false);
  expect(await available("11:00", "12:30")).toBe(true);
});
it("preserves ownership, publication, grid alignment and contracted duration checks", async () => {
  expect(await available("09:45", "11:15")).toBe(false);
  expect(await available("10:00", "10:30")).toBe(false);
  await db.exec(`select set_config('test.user','${other}',true)`);
  expect(await available("09:30", "11:00")).toBe(false);
  await db.exec(`select set_config('test.user','${owner}',true);update public.provider_services set status='draft'`);
  expect(await available("09:30", "11:00")).toBe(false);
});
it("applies the configured notice and salon closure to the reschedule", async () => {
  await db.exec(`create or replace function booking_private.minimum_booking_notice() returns integer language sql as $$select 11520$$`);
  expect(await available("09:30", "11:00")).toBe(false);
  await db.exec(`create or replace function booking_private.minimum_booking_notice() returns integer language sql as $$select 60$$;
    update public.business_hours set is_closed=true`);
  expect(await available("09:30", "11:00")).toBe(false);
});
it("does not expose the new privileged helper to anonymous or authenticated callers", async () => {
  const permissions = await db.query<{ role_name: string; allowed: boolean }>(`select role_name,
    has_function_privilege(role_name,'booking_private.independent_reschedule_slots(uuid,uuid,date,integer,uuid)','EXECUTE') as allowed
    from (values('anon'),('authenticated')) roles(role_name)`);
  expect(permissions.rows.every(row => !row.allowed)).toBe(true);
  await db.exec("set local role authenticated");
  await expect(db.query(`select * from booking_private.independent_reschedule_slots('${owner}','${service}',current_date,90,'${booking}')`))
    .rejects.toMatchObject({ code: "42501" });
});
