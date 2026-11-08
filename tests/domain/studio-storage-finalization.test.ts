import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect,it } from 'vitest';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
it('accepts the Storage service finalizer without a user sub while preserving ownership, eligibility and owner quota',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema storage;create schema media_security;
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid,is_suspended boolean,account_status text);
 create table public.provider_profiles(profile_id uuid);
 create table public.quota(key text primary key,count integer);
 create function public.consume_financial_rate_limit(text,text,integer,integer)returns boolean language sql as $$with c as(insert into public.quota values($2,1)on conflict(key)do update set count=quota.count+1 returning count)select count<=$3 from c$$;
 create table storage.objects(bucket_id text,name text,owner_id text);
 create function media_security.guard_studio_source()returns trigger language plpgsql as $$begin return new;end$$;
 create trigger guard before insert on storage.objects for each row execute function media_security.guard_studio_source();
 grant usage on schema storage,auth to anon,authenticated,service_role;grant insert on storage.objects to anon,authenticated,service_role;
 insert into profiles values('${a}',false,'active'),('${b}',true,'active');insert into provider_profiles values('${a}'),('${b}');`);
 await db.exec(await readFile('supabase/migrations/20261108103240_studio_source_storage_finalization.sql','utf8'));
 const path=`${a}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/input`;
 const insert=(owner=a,name=path)=>db.query("insert into storage.objects values('studio-video-inputs',$1,$2)",[name,owner]);
 async function denied(action:()=>Promise<unknown>){await db.exec('savepoint denied');await expect(action()).rejects.toMatchObject({code:'42501'});await db.exec('rollback to savepoint denied;release savepoint denied');}
 await db.exec("begin;set local role service_role");
 // Reproduces Storage's final UpsertObject transaction: service role, owner set, no sub.
 for(let i=0;i<10;i++)await insert();
 await denied(()=>insert());
 await denied(()=>insert(b,`${b}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/input`));
 await denied(()=>insert(a,`${b}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/input`));
 await denied(()=>insert('not-a-uuid'));
 await db.exec('reset role');expect((await db.query('select key,count from quota')).rows).toEqual([{key:(await db.query<{hash:string}>("select md5($1) as hash",[a])).rows[0].hash,count:10}]);await db.exec('rollback');
 for(const role of ['anon','authenticated']){
  await db.exec(`begin;set local role ${role}`);await denied(()=>insert());
  await db.exec('rollback');
 }
 await db.exec(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${a}',true)`);
 await insert();await denied(()=>insert(b,`${b}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/input`));await db.exec('rollback');
 }finally{await db.close();}
},30000);
