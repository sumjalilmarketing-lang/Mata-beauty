import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
const owner = "11111111-1111-4111-8111-111111111111";
const post = "22222222-2222-4222-8222-222222222222";
const prefix = `${owner}/${post}/`;
const id = "33333333-3333-4333-8333-333333333333";
const coverId = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema storage; create schema media_security;
 create table storage.objects(id uuid primary key,bucket_id text,name text,owner_id text,updated_at timestamptz default now(),metadata jsonb);
 create table public.posts(id uuid primary key,author_id uuid,post_type text,video_url text,thumbnail_url text,duration_seconds numeric,aspect_ratio numeric,status text);
 create table public.social_post_media(post_id uuid,media_type text,bucket_id text,storage_path text,thumbnail_path text,duration_seconds numeric);
 create function media_security.object_path(bucket text,path text) returns text language sql immutable as $$select case when path like 'https://%' then nullif(split_part(path,'/'||bucket||'/',2),'') else path end$$;
 insert into storage.objects(id,bucket_id,name,owner_id,metadata) values(gen_random_uuid(),'provider-social-media','legacy/video.mp4','legacy','{"size":100}');
 insert into public.posts(id,author_id,post_type,video_url) values(gen_random_uuid(),'11111111-1111-4111-8111-111111111111','video','https://example.com/storage/v1/object/public/provider-social-media/legacy/video.mp4');
 grant insert,update on public.posts,public.social_post_media to authenticated;
 grant usage on schema storage to authenticated; grant update,select on storage.objects to authenticated;`);
 await db.exec(await readFile(new URL("../../supabase/migrations/20261108082501_validate_studio_video_bytes.sql", import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
 await db.exec("begin");
 for (const [objectId, name] of [[id,"video.mp4"],[coverId,"thumbnail.jpg"]]) await db.query(`insert into storage.objects(id,bucket_id,name,owner_id,metadata) values($1,'provider-social-media',$2,$3,'{"size":100}')`, [objectId, prefix+name, owner]);
});
afterEach(async () => { await db.exec("rollback"); });
async function attest(objectId=id, name="video.mp4", kind="video", stamp?: string) {
 const snapshot = await db.query<{updated_at:string}>("select updated_at::text from storage.objects where id=$1",[objectId]);
 return db.query("select public.attest_studio_upload($1,$2,$3,$4,100,$5,$6,$7,$8)",[owner,prefix+name,objectId,stamp??snapshot.rows[0].updated_at,"a".repeat(64),kind,kind==="video"?2:null,kind==="video"?0.666:null]);
}
async function publish() {
 return db.query("insert into public.posts(id,author_id,post_type,video_url,thumbnail_url,duration_seconds,aspect_ratio) values($1,$2,'video',$3,$4,89,1)",[post,owner,"https://example.com/storage/v1/object/public/provider-social-media/"+prefix+"video.mp4","https://example.com/storage/v1/object/public/provider-social-media/"+prefix+"thumbnail.jpg"]);
}
async function rejected(action:()=>Promise<unknown>,code="42501") {
 await db.exec("savepoint denied");
 await expect(action()).rejects.toMatchObject({code});
 await db.exec("rollback to savepoint denied; release savepoint denied");
}
it("rejects direct publication without byte validation and requires both media",async()=>{
 await rejected(publish);
 await attest();
 await rejected(publish);
});
it("accepts validated owner media and replaces spoofed duration with server metadata",async()=>{
 await attest(); await attest(coverId,"thumbnail.jpg","thumbnail");
 await db.exec("set local role authenticated");
 await publish();
 await db.exec("reset role");
 expect((await db.query("select duration_seconds::float as duration,aspect_ratio::float as ratio from posts where id='22222222-2222-4222-8222-222222222222'")).rows).toEqual([{duration:2,ratio:0.666}]);
});
it("denies anonymous/authenticated attestation APIs",async()=>{
 for (const role of ["anon","authenticated"]) {
  await db.exec(`set local role ${role}`);
  await rejected(()=>db.query("select public.get_studio_upload_snapshot($1,$2)",[owner,prefix+"video.mp4"]));
  await rejected(()=>attest());
  await db.exec("reset role");
 }
});
it("rejects a stale snapshot and forbids overwrite after successful validation",async()=>{
 await rejected(()=>attest(id,"video.mp4","video","2000-01-01T00:00:00Z"));
 await attest();
 await db.exec("set local role authenticated");
 await rejected(()=>db.query("update storage.objects set metadata='{}' where id=$1",[id]));
});
it("does not allow deletion/recreation to inherit a previous validation",async()=>{
 await attest(); await attest(coverId,"thumbnail.jpg","thumbnail");
 await db.query("delete from storage.objects where id=$1",[id]);
 await rejected(()=>db.query("insert into storage.objects(id,bucket_id,name,owner_id,metadata) values(gen_random_uuid(),'provider-social-media',$1,$2,'{\"size\":100}')",[prefix+"video.mp4",owner]));
 await rejected(publish);
});
it("also guards direct video media insertion and ownership",async()=>{
 await rejected(()=>db.query("insert into social_post_media(post_id,media_type,bucket_id,storage_path,thumbnail_path) values($1,'video','provider-social-media',$2,$3)",[post,prefix+"video.mp4",prefix+"thumbnail.jpg"]));
 await rejected(()=>db.query("select public.attest_studio_upload($1,$2,$3,now(),100,$4,'video',2,0.666)",[post,prefix+"video.mp4",id,"a".repeat(64)]));
});

it("preserves historical videos but prevents overwriting or recreating their original paths",async()=>{
 await rejected(()=>db.query("update storage.objects set metadata='{}' where name='legacy/video.mp4'"));
 await db.query("delete from storage.objects where name='legacy/video.mp4'");
 await rejected(()=>db.query("insert into storage.objects(id,bucket_id,name,owner_id,metadata) values(gen_random_uuid(),'provider-social-media','legacy/video.mp4','legacy','{}')"));
});

it("blocks moving a fresh object onto a deleted validated or historical path",async()=>{
 await attest();
 await db.query("delete from storage.objects where id=$1 or name='legacy/video.mp4'",[id]);
 await db.query("insert into storage.objects(id,bucket_id,name,owner_id,metadata) values(gen_random_uuid(),'provider-social-media','fresh/video.mp4',$1,'{}')",[owner]);
 for (const target of [prefix+"video.mp4","legacy/video.mp4"]) {
  await rejected(()=>db.query("update storage.objects set name=$1 where name='fresh/video.mp4'",[target]));
 }
});
