import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const uid = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.product_events(id bigint generated always as identity primary key,profile_id uuid,session_hash text,event_name text,properties jsonb,occurred_at timestamptz default now());
    alter table public.product_events enable row level security;
  `);
  const financial = await readFile(new URL("../../supabase/migrations/20260804120000_bank_grade_payment_hardening.sql", import.meta.url), "utf8");
  await db.exec(financial.slice(financial.indexOf("create table if not exists public.financial_rate_limits"), financial.indexOf("create table if not exists public.reconciliation_runs")));
  await db.exec(financial.slice(financial.indexOf("create or replace function public.consume_financial_rate_limit("), financial.indexOf("create or replace function public.initialize_payment_v2(")));
  await db.exec(await readFile(new URL("../../supabase/migrations/20261108082514_harden_product_event_rate_limits.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate public.product_events,public.financial_rate_limits");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
});

it("caps authenticated NULL-session calls at 300, including repeated calls after denial", async () => {
  await db.exec("set role authenticated");
  const result = await db.query<{ accepted: number }>("select count(public.record_product_event('search','{}',null))::int as accepted from generate_series(1,501)");
  expect(result.rows[0].accepted).toBe(300);
  expect((await db.query("select public.record_product_event('search','{}',null) as id")).rows[0]).toEqual({ id: null });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int as count from public.product_events")).rows[0]).toEqual({ count: 300 });
});

it("cannot reset an account quota with rotated sessions; a second UID has its own quota", async () => {
  await db.exec("set role authenticated");
  const result = await db.query<{ accepted: number }>("select count(public.record_product_event('search','{}',md5(i::text)))::int as accepted from generate_series(1,305) i");
  expect(result.rows[0].accepted).toBe(300);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", ["22222222-2222-4222-8222-222222222222"]);
  expect((await db.query("select public.record_product_event('search','{}',null) is not null as accepted")).rows[0]).toEqual({ accepted: true });
});

it("reopens the quota only after its server-side window expires", async () => {
  await db.exec("insert into public.financial_rate_limits values('product_event_uid',md5('11111111-1111-4111-8111-111111111111'),clock_timestamp()-interval '2 hours',300,0); set role authenticated");
  expect((await db.query("select public.record_product_event('search','{}',null) is not null as accepted")).rows[0]).toEqual({ accepted: true });
});

it("revokes direct anonymous analytics and keeps trusted anonymous insertion service-only", async () => {
  const result = await db.query("select has_function_privilege('anon','public.record_product_event(text,jsonb,text)','execute') as direct,has_function_privilege('anon','public.record_anonymous_product_event(text,text,jsonb,text)','execute') as anon_ingress,has_function_privilege('authenticated','public.record_anonymous_product_event(text,text,jsonb,text)','execute') as auth_ingress,has_function_privilege('service_role','public.record_anonymous_product_event(text,text,jsonb,text)','execute') as server_ingress");
  expect(result.rows[0]).toEqual({ direct: false, anon_ingress: false, auth_ingress: false, server_ingress: true });
  await db.exec("set role anon");
  await expect(db.query("select public.record_product_event('search','{}',md5('x'))")).rejects.toMatchObject({ code: "42501" });
});

it("caps anonymous events per server IP key despite rotating session hashes", async () => {
  await db.exec("set role service_role");
  const result = await db.query<{ accepted: number }>("select count(public.record_anonymous_product_event(repeat('a',64),'search','{}',md5(i::text)))::int as accepted from generate_series(1,305) i");
  expect(result.rows[0].accepted).toBe(300);
});

it("applies a global anonymous ceiling even when both IP keys and session hashes rotate", async () => {
  await db.exec("insert into public.financial_rate_limits values('product_event_anon_global','global',clock_timestamp(),9999,0); set role service_role");
  const result = await db.query<{ accepted: number }>("select count(public.record_anonymous_product_event(md5(i::text)||md5(i::text),'search','{}',md5(i::text)))::int as accepted from generate_series(1,3) i");
  expect(result.rows[0].accepted).toBe(1);
});
