import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
let db: PGlite;
const uid = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", post = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema media_security;create schema booking_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.posts(id uuid primary key,author_id uuid,status text,visibility text,share_count bigint default 0);
 create table public.post_shares(post_id uuid,profile_id uuid,session_hash text,unique(post_id,session_hash));
 create table public.video_views(post_id uuid,viewer_id uuid,session_hash text,watched_ms integer,completed boolean,view_day date default current_date,unique(post_id,session_hash,view_day));
 create table public.post_booking_clicks(post_id uuid,profile_id uuid,session_hash text,unique(post_id,session_hash));
 create table public.social_profile_visits(provider_id uuid,source_post_id uuid,visitor_id uuid,session_hash text,unique(source_post_id,session_hash));
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 create table public.provider_documents(id uuid default gen_random_uuid(),provider_id uuid,storage_path text,status text);
 alter table public.provider_documents enable row level security;
 create policy own_docs on public.provider_documents for all to authenticated using(provider_id=auth.uid()) with check(provider_id=auth.uid());
 create table public.booking_reviews(booking_id uuid,type text,reviewer_id uuid);
 create table public.profiles(id uuid primary key,account_status text,is_suspended boolean);
 create table public.businesses(id uuid primary key,owner_id uuid,archived_at timestamptz);
 create table public.collaborators(id uuid primary key,business_id uuid,profile_id uuid,is_active boolean,archived_at timestamptz);
 create table booking_private.collaborator_access(profile_id uuid,collaborator_id uuid,business_id uuid,revoked_at timestamptz,permissions text[]);
 create table public.bookings(id uuid primary key,status text,client_id uuid,provider_id uuid,business_id uuid,collaborator_id uuid);
 create function auth.jwt()returns jsonb language sql stable as $$select jsonb_build_object('role',case current_setting('role') when 'none' then 'service_role' else current_setting('role') end)$$;
 create function public.has_admin_permission(text)returns boolean language sql stable as $$select false$$;
 grant usage on schema auth,storage to authenticated,service_role;
 grant select,insert,update,delete on storage.objects,public.provider_documents to authenticated;`);
 const financial = await readFile("supabase/migrations/20260804120000_bank_grade_payment_hardening.sql", "utf8");
 await db.exec(financial.slice(financial.indexOf("create table if not exists public.financial_rate_limits"),financial.indexOf("create table if not exists public.reconciliation_runs")));
 await db.exec(financial.slice(financial.indexOf("create or replace function public.consume_financial_rate_limit("),financial.indexOf("create or replace function public.initialize_payment_v2(")));
 const staff=await readFile("supabase/migrations/20261015001940_salon_collaborator_access.sql","utf8");
 await db.exec(staff.slice(staff.indexOf("create or replace function booking_private.active_staff_permission("),staff.indexOf("revoke all on function booking_private.active_staff_permission")));
 const reviews=await readFile("supabase/migrations/20261104170000_booking_feedback.sql","utf8");
 await db.exec(reviews.slice(reviews.indexOf("create function booking_private.can_review_booking("),reviews.indexOf("revoke all on function booking_private.can_review_booking")));
 const docs=await readFile("supabase/migrations/20261005202610_finalize_professional_application_workflow.sql","utf8");
 await db.exec("alter table provider_documents add column kind text default 'identity',add column rejection_reason text,add column reviewed_by uuid,add column reviewed_at timestamptz");
 await db.exec(docs.slice(docs.indexOf("create or replace function public.protect_document_review_fields()"),docs.indexOf("create or replace function public.sync_professional_application_authorization()")));
 await db.exec("create trigger protect_document_fields before insert or update on public.provider_documents for each row execute function public.protect_document_review_fields()");
 await db.exec(await readFile("supabase/migrations/20261108111742_general_audit_integrity.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec(`begin;insert into posts values('${post}','${uid}','published','public',0)`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
 await db.exec(`insert into profiles values('${uid}','active',false),('${other}','active',false),('55555555-5555-4555-8555-555555555555','active',false);
 insert into businesses values('${post}','${uid}',null);insert into collaborators values('${post}','${post}','${other}',true,null);
 insert into booking_private.collaborator_access values('${other}','${post}','${post}',null,array['bookings.manage']);
 insert into bookings values('${post}','completed','55555555-5555-4555-8555-555555555555','${uid}','${post}','${post}');`);
});
afterEach(async()=>{await db.exec("rollback");});
async function denied(sql:string,code="42501"){await db.exec("savepoint denied");await expect(db.exec(sql)).rejects.toMatchObject({code});await db.exec("rollback to savepoint denied;release savepoint denied");}
it("shares a 300/hour UID ceiling across all four metrics despite rotating hashes",async()=>{
 await db.exec("set local role authenticated");
 for(let i=0;i<305;i++){
  const hash=i.toString(16).padStart(64,"0");
  if(i%4===0)await db.query("select record_video_view($1,$2,2000,false)",[post,hash]);
  if(i%4===1)await db.query("select record_post_share($1,$2)",[post,hash]);
  if(i%4===2)await db.query("select record_post_booking_click($1,$2)",[post,hash]);
  if(i%4===3)await db.query("select record_social_profile_visit($1,$2,$3)",[uid,post,hash]);
 }
 await db.exec("reset role");
 expect((await db.query<{n:number}>("select ((select count(*) from video_views)+(select count(*) from post_shares)+(select count(*) from post_booking_clicks)+(select count(*) from social_profile_visits))::int n")).rows[0].n).toBe(300);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);await db.exec("set local role authenticated");
 expect((await db.query("select record_post_share($1,repeat('f',64)) n",[post])).rows[0]).toEqual({n:76});
});
it("revokes anonymous direct RPCs and client dispatcher access",async()=>{
 for(const signature of ["record_post_share(uuid,text)","record_video_view(uuid,text,integer,boolean)","record_post_booking_click(uuid,text)","record_social_profile_visit(uuid,uuid,text)"]){
  expect((await db.query("select has_function_privilege('anon',$1,'execute') allowed",[signature])).rows[0]).toEqual({allowed:false});
 }
 expect((await db.query("select has_function_privilege('authenticated','record_anonymous_social_metric(text,text,text,uuid,uuid,integer,boolean)','execute') allowed")).rows[0]).toEqual({allowed:false});
});
it("caps anonymous IP rotation attacks and the global budget",async()=>{
 await db.query("select set_config('request.jwt.claim.sub','',true)");await db.exec("set local role service_role");
 const call="select count(*)::int n from generate_series(1,305) i where (record_anonymous_social_metric('record_post_share',repeat('a',64),md5(i::text)||md5(i::text),'"+post+"')->>'accepted')::boolean";
 expect((await db.query(call)).rows[0]).toEqual({n:300});
 await db.exec("reset role;update financial_rate_limits set counter=9999 where scope='social_metric_anon_global';set local role service_role");
 expect((await db.query("select record_anonymous_social_metric('record_post_share',repeat('b',64),repeat('b',64),$1)->>'accepted' accepted",[post])).rows[0]).toEqual({accepted:"true"});
 expect((await db.query("select record_anonymous_social_metric('record_post_share',repeat('c',64),repeat('c',64),$1)->>'accepted' accepted",[post])).rows[0]).toEqual({accepted:"false"});
});
it("preserves deduplication and never reveals a private post share count",async()=>{
 await db.exec("set local role authenticated");
 for(let i=0;i<2;i++)expect((await db.query("select record_post_share($1,repeat('a',64)) n",[post])).rows[0]).toEqual({n:1});
 await db.exec("reset role;update posts set visibility='private';set local role authenticated");
 expect((await db.query("select record_post_share($1,repeat('b',64)) n",[post])).rows[0]).toEqual({n:null});
});
it.each(["pending","approved","rejected"])("freezes referenced %s objects, including rename, delete, recreation and doc unlinking",async status=>{
 const path=`${uid}/document.pdf`;
 await db.query("insert into storage.objects(bucket_id,name)values('provider-documents',$1)",[path]);
 await db.query("insert into provider_documents(provider_id,storage_path,status)values($1,$2,$3)",[uid,path,status]);
 await db.exec("set local role authenticated");
 await denied(`update storage.objects set metadata='{"size":12}' where name='${path}'`);
 await denied(`update storage.objects set name='${uid}/moved.pdf' where name='${path}'`);
 await denied(`update storage.objects set bucket_id='avatars' where name='${path}'`);
 await denied(`delete from storage.objects where name='${path}'`);
 await denied(`insert into storage.objects(bucket_id,name)values('provider-documents','${path}')`);
 await denied(`update provider_documents set storage_path='${uid}/other.pdf'`);
 await db.exec("delete from provider_documents;reset role");
 expect((await db.query("select count(*)::int n from provider_documents")).rows[0]).toEqual({n:1});
});
it("allows new paths, orphan cleanup, and review status changes",async()=>{
 await db.exec(`insert into storage.objects(bucket_id,name)values('provider-documents','${uid}/new.pdf'),('provider-documents','${uid}/orphan.pdf');set local role authenticated`);
 await db.exec(`insert into provider_documents(provider_id,storage_path,status)values('${uid}','${uid}/new.pdf','pending');delete from storage.objects where name='${uid}/orphan.pdf';reset role;update provider_documents set status='approved'`);
 expect((await db.query("select status from provider_documents")).rows[0]).toEqual({status:"approved"});
});
it("shares only a review submission flag with an authorized colleague",async()=>{
 await db.exec(`insert into booking_reviews values('${post}','provider_to_client','${uid}');set local role authenticated`);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
 expect((await db.query("select booking_review_submission_state($1,'provider_to_client') done",[post])).rows[0]).toEqual({done:true});
 await denied(`select booking_review_submission_state('44444444-4444-4444-8444-444444444444','provider_to_client')`);
});

it("enforces real client, owner, assigned-staff, revoked-staff and suspension rules on review flags",async()=>{
 await db.exec("set local role authenticated");
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",["55555555-5555-4555-8555-555555555555"]);
 expect((await db.query("select booking_review_submission_state($1,'client_to_provider') done",[post])).rows[0]).toEqual({done:false});
 await denied(`select booking_review_submission_state('${post}','provider_to_client')`);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
 expect((await db.query("select booking_review_submission_state($1,'provider_to_client') done",[post])).rows[0]).toEqual({done:false});
 await db.exec("reset role;update booking_private.collaborator_access set revoked_at=now();set local role authenticated");
 await denied(`select booking_review_submission_state('${post}','provider_to_client')`);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
 await db.exec("reset role;update profiles set is_suspended=true;set local role authenticated");
 await denied(`select booking_review_submission_state('${post}','provider_to_client')`);
});
it("keeps the real document review guard and privileged erasure order working",async()=>{
 const path=`${uid}/new.pdf`;
 await db.query("insert into storage.objects(bucket_id,name)values('provider-documents',$1)",[path]);
 await db.exec("set local role authenticated");
 await db.query("insert into provider_documents(provider_id,storage_path,status)values($1,$2,'approved')",[uid,path]);
 await db.exec("reset role");expect((await db.query("select status from provider_documents")).rows[0]).toEqual({status:"pending"});
 await db.exec("update provider_documents set status='approved';set local role authenticated");
 await denied("update provider_documents set status='rejected'", "P0001");
 await db.exec("reset role;delete from provider_documents;delete from storage.objects");
 expect((await db.query("select count(*)::int n from storage.objects")).rows[0]).toEqual({n:0});
});
