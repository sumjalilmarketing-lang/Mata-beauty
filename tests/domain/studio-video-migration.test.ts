import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';

it('removes duration typmods/caps and preserves dependent views, ACLs and invoker isolation', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create table posts(id integer, duration_seconds numeric(6,2) constraint posts_duration_seconds_check check(duration_seconds between 1 and 90),aspect_ratio numeric(5,3) constraint posts_aspect_ratio_check check(aspect_ratio between .4 and 1.8));
   create table social_post_media(duration_seconds numeric(6,2) constraint social_post_media_duration_seconds_check check(duration_seconds is null or duration_seconds between 1 and 90));
   alter table posts enable row level security;
   create view social_feed with(security_invoker=true) as select * from posts;
   create view launch_social_feed with(security_invoker=true) as select * from social_feed;
   grant select on social_feed,launch_social_feed to anon,authenticated;
   create function create_video_post(target_duration_seconds numeric,target_aspect_ratio numeric) returns numeric language plpgsql as $$ begin if target_duration_seconds not between 1 and 90 or target_aspect_ratio not between 0.4 and 1.8 then raise exception 'invalid'; end if;return target_duration_seconds; end $$;
   revoke all on function create_video_post(numeric,numeric) from public; grant execute on function create_video_post(numeric,numeric) to authenticated;
  `);
  await db.exec(await readFile('supabase/migrations/20261107131212_studio_video_without_duration_cap.sql','utf8'));
  await db.exec('insert into posts values(1,20000,2.4); insert into social_post_media values(20000)');
  expect((await db.query('select duration_seconds from launch_social_feed')).rows).toEqual([{duration_seconds:'20000'}]);
  expect((await db.query('select create_video_post(20000,2.4) as duration')).rows).toEqual([{duration:'20000'}]);
  const grants=await db.query("select has_table_privilege('anon','social_feed','select') as feed, has_table_privilege('anon','launch_social_feed','select') as launch, has_function_privilege('anon','create_video_post(numeric,numeric)','execute') as rpc");
  expect(grants.rows).toEqual([{feed:true,launch:true,rpc:false}]);
  const views=await db.query<{reloptions:string[]}>( "select reloptions from pg_class where oid in ('social_feed'::regclass,'launch_social_feed'::regclass)");
  for(const row of views.rows)expect(row.reloptions).toEqual(['security_invoker=true']);
  for(const duration of ['0','-1',"'NaN'::numeric","'Infinity'::numeric"]) {
   await expect(db.exec(`insert into posts values(2,${duration},1)`)).rejects.toThrow();
   await expect(db.exec(`select create_video_post(${duration},1)`)).rejects.toThrow();
  }
 } finally { await db.close(); }
},30000);
