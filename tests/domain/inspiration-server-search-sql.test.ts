import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const provider = "11111111-1111-4111-8111-111111111111";
const service = "22222222-2222-4222-8222-222222222222";
const category = "33333333-3333-4333-8333-333333333333";
const business = "44444444-4444-4444-8444-444444444444";
const post = "99999999-9999-4999-8999-999999999999";
const signature = "public.search_inspiration_feed(text,uuid,text,uuid,text,double precision,double precision,integer,timestamptz,uuid,integer)";

async function search(args = "") {
  return (await db.query<{ id: string; published_at: string }>(`select id,published_at::text as published_at from public.search_inspiration_feed(${args})`)).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.posts(id uuid primary key,author_id uuid,provider_service_id uuid,caption text,
      business_name text,service_title text,city text,hashtags text[],published_at timestamptz,is_visible boolean default true);
    create table public.provider_profiles(profile_id uuid,business_name text,city text,country_code text,latitude double precision,longitude double precision);
    create table public.businesses(id uuid,name text,area text,city text,address text,country_code text,latitude double precision,longitude double precision);
    create table public.provider_services(id uuid,provider_id uuid,business_id uuid,service_id uuid,title text);
    create table public.services(id uuid,category_id uuid);
    create table public.categories(id uuid,name text);
    alter table public.posts enable row level security;
    create policy visible_posts on public.posts for select to anon,authenticated using(is_visible);
    create view public.social_feed with(security_invoker=true) as
      select id,author_id,provider_service_id,caption,business_name,service_title,city,hashtags,published_at from public.posts;
    grant usage on schema public to anon,authenticated,service_role;
    grant select on all tables in schema public to anon,authenticated,service_role;
    insert into public.provider_profiles values('${provider}','Élégance Dakar','Dakar','SN',14.74,-17.51);
    insert into public.businesses values('${business}','Élégance Almadies','Almadies','Dakar','Rue des Tresses','SN',14.74,-17.51);
    insert into public.categories values('${category}','Coiffure');
    insert into public.services values('${category}','${category}');
    insert into public.provider_services values('${service}','${provider}','${business}','${category}','Tresses');
    insert into public.posts(id,author_id,caption,business_name,service_title,city,hashtags,published_at)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        '00000000-0000-4000-8000-000000000001','Sans correspondance','Autre créateur','Manucure','Paris','{}',now()-make_interval(mins=>n)
      from generate_series(1,15) n;
    insert into public.posts values('${post}','${provider}','${service}','Nattes élégantes','Élégance Dakar','Tresses','Dakar',array['coiffure'],now()-interval '1 day',true);
  `);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261109145148_server_filtered_inspiration_search.sql", import.meta.url), "utf8"));
}, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

it("finds a matching publication beyond the first eight unfiltered clips in one bounded request", async () => {
  const first = await db.query<{ id: string }>("select id from public.social_feed order by published_at desc,id desc limit 8");
  expect(first.rows.some(row => row.id === post)).toBe(false);
  expect((await search("target_query=>'tresses'")).map(row => row.id)).toEqual([post]);
});

it("combines exact category, country, provider and current salon location", async () => {
  const args = `target_category_id=>'${category}',target_country_code=>'SN',target_provider_id=>'${provider}',target_zone=>'Almadies'`;
  expect((await search(args)).map(row => row.id)).toEqual([post]);
  expect(await search(args.replace("Almadies", "Plateau"))).toEqual([]);
  expect(await search(args.replace("SN", "FR"))).toEqual([]);
});

it("normalizes French accents, aliases and country names without SQL or wildcard interpolation", async () => {
  expect((await search("target_query=>'elegance coiffeuse senegal'")).map(row => row.id)).toEqual([post]);
  expect((await search("target_query=>'élégance'")).map(row => row.id)).toEqual([post]);
  expect(await search("target_query=>'tresses OR 1=1'")).toEqual([]);
  expect((await search("target_query=>'tresse'")).map(row => row.id)).toEqual([post]);
});

it("keeps precise geographic semantics and rejects malformed filters", async () => {
  expect((await search("target_latitude=>14.74,target_longitude=>-17.51,target_radius_km=>2")).map(row => row.id)).toEqual([post]);
  expect(await search("target_latitude=>48.85,target_longitude=>2.35,target_radius_km=>2")).toEqual([]);
  for (const args of ["target_latitude=>91,target_longitude=>0", "target_latitude=>0", "page_size=>1000", "target_radius_km=>99", "before_id=>'00000000-0000-4000-8000-000000000001'"]) {
    await db.exec("savepoint invalid");
    await expect(search(args)).rejects.toMatchObject({ code: "22023" });
    await db.exec("rollback to savepoint invalid");
  }
});

it("uses a deterministic two-column cursor for identical publication dates", async () => {
  await db.exec("update public.posts set published_at='2026-11-09T12:00:00Z'");
  const first = await search("page_size=>8");
  const cursor = first.at(-1)!;
  const next = await search(`page_size=>8,before_published_at=>'${cursor.published_at}',before_id=>'${cursor.id}'`);
  expect(first).toHaveLength(8);
  expect(next).toHaveLength(8);
  expect(new Set([...first, ...next].map(row => row.id)).size).toBe(16);
});

it("preserves caller RLS instead of exposing a hidden matching publication", async () => {
  await db.exec(`update public.posts set is_visible=false where id='${post}';set local role anon`);
  expect(await search("target_query=>'tresses'")).toEqual([]);
});

it("does not use SECURITY DEFINER or grant the RPC to arbitrary new roles", async () => {
  const result = await db.query<{ prosecdef: boolean; anon_allowed: boolean }>(`select prosecdef,
    has_function_privilege('anon','${signature}','EXECUTE') as anon_allowed from pg_proc where oid='${signature}'::regprocedure`);
  expect(result.rows).toEqual([{ prosecdef: false, anon_allowed: true }]);
  await db.exec("create role unrelated");
  const allowed = await db.query<{ allowed: boolean }>(`select has_function_privilege('unrelated','${signature}','EXECUTE') as allowed`);
  expect(allowed.rows[0].allowed).toBe(false);
});
