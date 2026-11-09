import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
let disclosedBeforeFix = false;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const service = "33333333-3333-4333-8333-333333333333";
const business = "44444444-4444-4444-8444-444444444444";
const day = "(current_date+7)";
const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema booking_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.profiles(id uuid primary key,account_status text,is_suspended boolean);
    create table public.provider_profiles(profile_id uuid primary key,status text);
    create table public.businesses(id uuid primary key,owner_id uuid,status text,is_active boolean,archived_at timestamptz,team_booking_enabled boolean);
    create table public.provider_services(id uuid primary key,provider_id uuid,business_id uuid,duration_minutes integer,is_active boolean,archived_at timestamptz,status text);
    create table public.availability_rules(provider_id uuid,weekday smallint,starts_at time,ends_at time,slot_interval_minutes integer,valid_from date,valid_until date);
    create table public.business_hours(business_id uuid,weekday smallint,opens_at time,closes_at time,is_closed boolean);
    create table public.availability_exceptions(id uuid primary key default gen_random_uuid(),provider_id uuid,starts_at timestamptz,ends_at timestamptz,is_available boolean,reason text);
    create table public.business_closures(business_id uuid,starts_at timestamptz,ends_at timestamptz);
    create table public.bookings(id uuid primary key,provider_id uuid,starts_at timestamptz,ends_at timestamptz,resource_busy_until timestamptz,status text);
    create function booking_private.provider_timezone(uuid,uuid) returns text language sql as $$select 'Africa/Dakar'::text$$;
    create function public.get_team_available_slots(uuid,date,integer) returns table(slot_start timestamptz) language sql as $$select null::timestamptz where false$$;
    grant usage on schema public,auth to anon,authenticated;
    grant select on public.availability_exceptions to anon,authenticated;
    grant insert,update,delete on public.availability_exceptions to authenticated;
    alter table public.availability_exceptions enable row level security;
    create policy "exceptions public read" on public.availability_exceptions for select using(true);
    create policy "exceptions owner write" on public.availability_exceptions for all using(provider_id=auth.uid()) with check(provider_id=auth.uid());
    insert into public.profiles values('${owner}','active',false);
    insert into public.provider_profiles values('${owner}','approved');
    insert into public.businesses values('${business}','${owner}','approved',true,null,false);
    insert into public.provider_services values('${service}','${owner}','${business}',30,true,null,'published');
    insert into public.business_hours select '${business}',extract(dow from ${day})::smallint,'09:00','12:00',false;
    insert into public.availability_exceptions(provider_id,starts_at,ends_at,is_available,reason)
      values('${owner}',${day}+time '10:00',${day}+time '11:00',false,'Rendez-vous médical confidentiel');
    set role anon;
  `);
  disclosedBeforeFix = (await db.query<{ reason: string }>("select reason from public.availability_exceptions")).rows[0]?.reason === "Rendez-vous médical confidentiel";
  await db.exec("reset role");
  const dst = await migration("20261031062239_dst_safe_independent_slots.sql");
  await db.exec(dst.slice(dst.indexOf("create or replace function booking_private.local_schedule_slots"), dst.indexOf("create or replace function booking_private.independent_slots")));
  await db.exec(await migration("20261031180040_enforce_nonteam_business_hours.sql"));
  const available = await migration("20261031173823_enforce_international_booking_availability.sql");
  await db.exec(available.slice(available.indexOf("create or replace function public.get_available_slots"), available.indexOf("-- Runs after server price/duration normalization")));
  await db.exec(await migration("20261109130832_private_availability_exceptions.sql"));
}, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

it("reproduces public reason disclosure before the migration", () => {
  expect(disclosedBeforeFix).toBe(true);
});
it.each(["anon", "authenticated"])("hides all raw exception fields from %s third parties", async role => {
  await db.exec(`select set_config('test.user','${other}',true);set local role ${role}`);
  expect((await db.query("select provider_id,starts_at,ends_at,reason from public.availability_exceptions")).rows).toEqual([]);
});
it("preserves owner reads and updates without allowing reassignment", async () => {
  await db.exec(`select set_config('test.user','${owner}',true);set local role authenticated`);
  expect((await db.query("select reason from public.availability_exceptions")).rows).toEqual([{ reason: "Rendez-vous médical confidentiel" }]);
  await db.exec("update public.availability_exceptions set reason='Indisponible'");
  expect((await db.query("select reason from public.availability_exceptions")).rows).toEqual([{ reason: "Indisponible" }]);
  await db.exec("savepoint rejected");
  await expect(db.exec(`update public.availability_exceptions set provider_id='${other}'`)).rejects.toMatchObject({ code: "42501" });
  await db.exec("rollback to rejected;release rejected");
});
it("continues returning public free slots with the real private calendar query", async () => {
  await db.exec("set local role anon");
  const result = await db.query<{ slot_start: string }>(`select * from public.get_available_slots('${owner}','${service}',${day},1)`);
  const starts = result.rows.map(row => new Date(row.slot_start).toISOString().slice(11, 16));
  expect(starts).toEqual(["09:00", "09:30", "11:00", "11:30"]);
  expect(Object.keys(result.rows[0])).toEqual(["slot_start"]);
  expect(JSON.stringify(result.rows)).not.toContain("confidentiel");
});
