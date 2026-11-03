import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { escapeCrmSearch } from "@/lib/domain/crm";

const ids={a:"11111111-1111-4111-8111-111111111111",b:"22222222-2222-4222-8222-222222222222",boss:"33333333-3333-4333-8333-333333333333",finance:"44444444-4444-4444-8444-444444444444",support:"55555555-5555-4555-8555-555555555555",client:"66666666-6666-4666-8666-666666666666"};
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(await readFile(new URL("../fixtures/crm/bootstrap.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../fixtures/crm/rbac.sql",import.meta.url),"utf8"));
  await db.exec("create policy provider_read on public.provider_profiles for select to authenticated using(status='approved' or profile_id=auth.uid() or public.has_admin_permission('providers.read'));");
  await db.exec(await readFile(new URL("../../supabase/migrations/20261103112737_commercial_crm.sql",import.meta.url),"utf8"));
},60000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec("begin");});
afterEach(async()=>{await db.exec("rollback");});
async function actor(id:string,aal="aal2") {await db.exec("set local role authenticated");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:"authenticated",aal})]);}
async function denied(sql:string,params:unknown[]=[],code="42501") {
  await db.exec("savepoint expected_denial");let error:unknown;
  try{await db.query(sql,params);}catch(value){error=value;}
  await db.exec("rollback to savepoint expected_denial;release savepoint expected_denial");
  expect(error).toMatchObject({code});
}
async function lead(name="Salon test") {return (await db.query<{id:string;version:number;assigned_to:string;created_by:string}>("insert into public.crm_leads(name) values($1) returning id,version,assigned_to,created_by",[name])).rows[0];}
it("denies anonymous, finance, support, client and AAL1 writes",async()=>{
  await db.exec("set local role anon");await denied("select * from public.crm_leads");
  for(const id of [ids.finance,ids.support,ids.client]){await actor(id);await denied("insert into public.crm_leads(name) values('Forbidden')");expect((await db.query("select * from public.crm_leads")).rows).toHaveLength(0);}
  await actor(ids.a,"aal1");await denied("insert into public.crm_leads(name) values('MFA required')");
});
it("stamps authorship, preserves history and restricts cross-agent reads/writes",async()=>{
  await actor(ids.a);const created=await lead();expect(created.assigned_to).toBe(ids.a);expect(created.created_by).toBe(ids.a);
  expect((await db.query("select kind,actor_name from public.crm_activities where lead_id=$1",[created.id])).rows).toEqual([{kind:"created",actor_name:"Commercial A"}]);
  await denied("insert into public.crm_leads(name,assigned_to) values('Spoofed',$1)",[ids.b]);
  await actor(ids.b);expect((await db.query("select id from public.crm_leads where id=$1",[created.id])).rows).toHaveLength(0);
  expect((await db.query("update public.crm_leads set name='Stolen' where id=$1 returning id",[created.id])).rows).toHaveLength(0);
  await denied("insert into public.crm_activities(lead_id,kind,body) values($1,'note','Wrong agent')",[created.id]);
  expect((await db.query("select id from public.crm_activities where lead_id=$1",[created.id])).rows).toHaveLength(0);
});
it("allows only Super Admin to reassign to an active commercial, and transfers history access",async()=>{
  await actor(ids.a);const created=await lead();await denied("update public.crm_leads set assigned_to=$1 where id=$2",[ids.b,created.id]);
  await denied("select public.crm_assign_lead($1,1,$2)",[created.id,ids.b]);
  await actor(ids.boss);await denied("select public.crm_assign_lead($1,1,$2)",[created.id,ids.finance],"22023");
  await db.query("select public.crm_assign_lead($1,1,$2)",[created.id,ids.b]);
  await actor(ids.a);expect((await db.query("select id from public.crm_leads where id=$1",[created.id])).rows).toHaveLength(0);
  await denied("insert into public.crm_activities(lead_id,kind,body) values($1,'call','Old owner')",[created.id]);
  await actor(ids.b);expect((await db.query("select assigned_to,created_by,version from public.crm_leads where id=$1",[created.id])).rows).toEqual([{assigned_to:ids.b,created_by:ids.a,version:2}]);
  expect((await db.query("select kind from public.crm_activities where lead_id=$1 order by kind",[created.id])).rows).toEqual([{kind:"assigned"},{kind:"created"}]);
});
it("rejects stale updates and stale reassignment",async()=>{
  await actor(ids.a);const created=await lead();
  expect((await db.query("update public.crm_leads set stage='contacted' where id=$1 and version=1 returning version",[created.id])).rows).toEqual([{version:2}]);
  expect((await db.query("update public.crm_leads set name='Stale' where id=$1 and version=1 returning id",[created.id])).rows).toHaveLength(0);
  await actor(ids.boss);await denied("select public.crm_assign_lead($1,1,$2)",[created.id,ids.b],"40001");
});
it("keeps immutable activity history and prevents forged system events",async()=>{
  await actor(ids.a);const created=await lead();
  await db.query("insert into public.crm_activities(lead_id,kind,body) values($1,'call','Rendez-vous convenu')",[created.id]);
  await denied("insert into public.crm_activities(lead_id,kind,body) values($1,'assigned','Forged assignment')",[created.id]);
  await denied("insert into public.crm_activities(lead_id,kind,body,actor_name) values($1,'note','Spoofed','Boss')",[created.id]);
  await denied("delete from public.crm_activities where lead_id=$1",[created.id]);
  await denied("update public.crm_activities set body='Changed' where lead_id=$1",[created.id]);
  expect((await db.query<{n:number}>("select count(*)::int as n from public.crm_activities where lead_id=$1",[created.id])).rows[0].n).toBe(2);
});
it("archives without deletion, blocks notes while archived, and permits restoration",async()=>{
  await actor(ids.a);const created=await lead();
  await db.query("update public.crm_leads set archived_at=now() where id=$1",[created.id]);
  await denied("insert into public.crm_activities(lead_id,kind,body) values($1,'note','Archived')",[created.id]);
  await denied("delete from public.crm_leads where id=$1",[created.id]);
  await db.query("update public.crm_leads set archived_at=null where id=$1",[created.id]);
  expect((await db.query<{kind:string}>("select kind from public.crm_activities where lead_id=$1 order by kind",[created.id])).rows.map(r=>r.kind)).toEqual(["archived","created","restored"]);
});
it("counts all authorized leads and literal searches beyond the list page size",async()=>{
  await actor(ids.a);await db.exec("insert into public.crm_leads(name,next_follow_up_at) select 'Prospect '||n,now()-interval '1 day' from generate_series(1,151) n");
  const metrics=(await db.query<{m:{total:number;due:number;stages:Record<string,number>}}>("select public.crm_metrics() as m")).rows[0].m;
  expect(metrics).toEqual({total:151,due:151,stages:{new:151}});
  await lead("Salon 50%_test");
  expect((await db.query<{m:{total:number}}>("select public.crm_metrics($1,false) as m",["%_test"])).rows[0].m.total).toBe(1);
  expect((await db.query("select name from public.crm_leads where search_text ilike $1",[`%${escapeCrmSearch("%_test")}%`])).rows).toEqual([{name:"Salon 50%_test"}]);
  await actor(ids.b);expect((await db.query<{m:{total:number}}>("select public.crm_metrics() as m")).rows[0].m.total).toBe(0);
});
it("removes data access immediately on role revocation or account suspension",async()=>{
  await actor(ids.a);await lead();await db.exec("reset role; update public.admin_user_roles set is_active=false where user_id='11111111-1111-4111-8111-111111111111'");
  await actor(ids.a);expect((await db.query("select id from public.crm_leads")).rows).toHaveLength(0);await denied("select public.crm_metrics()");
  await db.exec("reset role;update public.admin_user_roles set is_active=true where user_id='11111111-1111-4111-8111-111111111111';update public.profiles set account_status='disabled' where id='11111111-1111-4111-8111-111111111111'");
  await actor(ids.a);expect((await db.query("select id from public.crm_leads")).rows).toHaveLength(0);await denied("insert into public.crm_leads(name) values('Disabled')");
});
it("links an existing dossier without approving it and allows FK cleanup on deletion",async()=>{
  await db.exec("insert into public.provider_profiles values('77777777-7777-4777-8777-777777777777','Salon candidat','Dakar','draft')");
  await actor(ids.a);const created=await lead();
  expect((await db.query("select business_name from public.crm_find_professionals('candidat')")).rows).toEqual([{business_name:"Salon candidat"}]);
  await db.query("update public.crm_leads set linked_provider_id='77777777-7777-4777-8777-777777777777',stage='won' where id=$1",[created.id]);
  expect((await db.query("select status from public.provider_profiles")).rows).toEqual([{status:"draft"}]);
  await db.exec("reset role;select set_config('request.jwt.claims','{}',true);delete from public.provider_profiles where profile_id='77777777-7777-4777-8777-777777777777'");
  expect((await db.query("select linked_provider_id from public.crm_leads where id=$1",[created.id])).rows).toEqual([{linked_provider_id:null}]);
});

it("excludes closed and archived leads from due reminders and enforces field constraints",async()=>{
  await actor(ids.a);const created=await lead();
  await db.query("update public.crm_leads set next_follow_up_at=now()-interval '1 day',stage='won' where id=$1",[created.id]);
  expect((await db.query<{m:{due:number}}>("select public.crm_metrics() as m")).rows[0].m.due).toBe(0);
  await db.query("update public.crm_leads set stage='new',archived_at=now() where id=$1",[created.id]);
  expect((await db.query<{m:{total:number;due:number}}>("select public.crm_metrics('',true) as m")).rows[0].m).toMatchObject({total:1,due:0});
  await denied("insert into public.crm_leads(name,phone) values('Bad phone','<script>')",[],"23514");
  await denied("insert into public.crm_leads(name,stage) values('Lost','lost')",[],"23514");
});
