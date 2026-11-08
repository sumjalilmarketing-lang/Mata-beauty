import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    create role visitor; create role author;
    create table posts(id uuid primary key,author_id text,status text,visibility text,published_at timestamptz,reported boolean default false);
    create table provider_services(id int primary key,provider_id text,status text,is_active boolean,archived_at timestamptz,title text);
    create table post_services(post_id uuid,provider_service_id int,is_primary boolean);
    alter table provider_services enable row level security;
    create policy services_read on provider_services for select using
      ((status='published' and is_active and archived_at is null) or current_user='author');
    grant select on posts,provider_services,post_services to visitor,author;
    create function social_post_not_strongly_reported(uuid) returns boolean language sql stable as
      'select not reported from public.posts where id=$1';
    create function is_public_social_post(target_post_id uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.posts post
        join public.post_services link on link.post_id=post.id and link.is_primary
        join public.provider_services service on service.id=link.provider_service_id and service.is_active
        where post.id=target_post_id and post.status='published' and post.visibility='public'
        and post.published_at is not null and post.published_at<=now()
        and public.social_post_not_strongly_reported(post.id));
    $$;
    revoke all on function is_public_social_post(uuid) from public;
    grant execute on function is_public_social_post(uuid) to author;
    create view social_feed with(security_invoker=true) as
      select p.id, ps.provider_service_id,svc.title
      from posts p join post_services ps on ps.post_id=p.id and ps.is_primary
      join provider_services svc on svc.id=ps.provider_service_id and svc.is_active
      where p.status='published' and p.visibility='public' and social_post_not_strongly_reported(p.id);
    grant select on social_feed to visitor,author;
    insert into provider_services values
      (1,'owner','draft',true,null,'Private draft'),
      (2,'owner','published',true,null,'Public service'),
      (3,'owner','paused',false,null,'Paused service'),
      (4,'owner','archived',false,now(),'Archived service');
    insert into posts select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'owner',
      case when i=5 then 'draft' else 'published' end,
      case when i=6 then 'followers' else 'public' end,
      case when i=8 then now()+interval '1 day' when i=9 then null else now() end,i=7
      from generate_series(1,9) i;
    insert into post_services select id,case when right(id::text,1)::int<=4 then right(id::text,1)::int else 2 end,true from posts;
  `);
  // Reproduce the reported mismatch without reading real user data.
  await db.exec("set role visitor");
  expect((await db.query("select count(*)::int as n from social_feed")).rows).toEqual([{ n: 3 }]);
  await db.exec("reset role");
  await db.exec(await readFile(new URL("../../supabase/migrations/20261108140854_studio_public_service_visibility.sql", import.meta.url), "utf8"));
}, 60000);
afterAll(() => db.close());

it.each(["visitor", "author"])("shows public videos to %s without disclosing private service details", async role => {
  await db.exec(`set role ${role}`);
  try {
    const { rows } = await db.query("select right(id::text,1) as post,provider_service_id,title from social_feed order by id");
    expect(rows).toEqual([
      { post: "1", provider_service_id: null, title: null },
      { post: "2", provider_service_id: 2, title: "Public service" },
      { post: "3", provider_service_id: null, title: null },
      { post: "4", provider_service_id: null, title: null },
    ]);
  } finally { await db.exec("reset role"); }
});

it("keeps direct draft service reads private and preserves media function grants", async () => {
  await db.exec("set role visitor");
  expect((await db.query("select id from provider_services order by id")).rows).toEqual([{ id: 2 }]);
  await db.exec("reset role");
  expect((await db.query("select has_function_privilege('visitor','is_public_social_post(uuid)','EXECUTE') as allowed")).rows).toEqual([{ allowed: false }]);
});

it("aligns media signing eligibility and feed visibility without publishing services", async () => {
  expect((await db.query("select right(id::text,1) as post from posts where is_public_social_post(id) order by id")).rows)
    .toEqual([1,2,3,4].map(i => ({ post: String(i) })));
  expect((await db.query("select status,is_active from provider_services where id=1")).rows)
    .toEqual([{ status: "draft", is_active: true }]);
});
