import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("isolates quarantine even with an older broad policy, blocks inactive users and enforces upload quota",async()=>{
 const db=new PGlite();const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create schema auth;create schema media_security;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,updated_at timestamptz default now());
 create table public.profiles(id uuid,is_suspended boolean default false,account_status text default 'active');
 create table public.provider_profiles(profile_id uuid);
 create table public.quota(uid uuid primary key,count integer);
 create function public.consume_financial_rate_limit(text,text,integer,integer) returns boolean language sql as $$with counter as(insert into public.quota values(auth.uid(),1) on conflict(uid) do update set count=quota.count+1 returning count) select count <= $3 from counter$$;
 alter table storage.objects enable row level security;create policy older_broad on storage.objects for all using(true) with check(true);
 grant usage on schema storage,auth to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;grant select on provider_profiles to authenticated;
 insert into profiles(id) values('${a}'),('${b}');insert into provider_profiles values('${a}'),('${b}');`);
 await db.exec(await readFile('supabase/migrations/20261108095155_studio_server_preparation.sql','utf8'));
 await db.exec(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${a}',true)`);
 const path=`${a}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/input`;
 for(let i=0;i<10;i++) await db.query("insert into storage.objects(bucket_id,name,owner_id) values('studio-video-inputs',$1,$2)",[path,a]);
 await db.exec('savepoint denied');await expect(db.query("insert into storage.objects(bucket_id,name,owner_id) values('studio-video-inputs',$1,$2)",[path,a])).rejects.toMatchObject({code:'42501'});await db.exec('rollback to denied');
 await db.exec(`select set_config('request.jwt.claim.sub','${b}',true)`);
 expect((await db.query("select * from storage.objects where bucket_id='studio-video-inputs'")).rows).toEqual([]);
 await expect(db.query("insert into storage.objects(bucket_id,name,owner_id) values('studio-video-inputs',$1,$2)",[path,a])).rejects.toThrow();
 await db.exec('rollback;begin;');await db.query("update profiles set is_suspended=true where id=$1",[a]);
 await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${a}',true)`);
 await expect(db.query("insert into storage.objects(bucket_id,name,owner_id) values('studio-video-inputs',$1,$2)",[path,a])).rejects.toThrow();
 await db.exec('rollback');
 expect((await db.query("select public from storage.buckets")).rows).toEqual([{public:false}]);
 } finally {await db.close();}
},30000);
