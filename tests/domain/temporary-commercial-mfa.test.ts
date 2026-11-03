import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
const db=new PGlite();
const user="aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const other="aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const source=(path:string)=>readFile(new URL('../../'+path,import.meta.url),'utf8');
beforeAll(async()=>{
 await db.exec(`create role authenticated;create schema auth;create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid()returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 create table auth.mfa_factors(user_id uuid,status text);create table public.profiles(id uuid primary key,role text,account_status text,is_suspended boolean);
 create table public.admin_roles(id text primary key,key text,is_active boolean default true);create table public.admin_user_roles(user_id uuid,role_id text,is_active boolean default true,revoked_at timestamptz,requires_mfa boolean default true);
 create table public.department_teams(manager_id uuid,department text,is_active boolean default true);
 alter table public.admin_user_roles enable row level security;grant select,update on public.admin_user_roles to authenticated;
 insert into public.admin_roles(id,key)select x,x from unnest(array['commercial_manager','commercial_agent','finance_manager','finance_agent','support_manager','support_agent','super_admin'])x;`);
 await db.exec(await source('supabase/migrations/20261007173000_require_mfa_for_legacy_internal_access.sql'));
 await db.exec(await source('supabase/migrations/20261103173937_temporary_commercial_mfa_suspension.sql'));
},60000);
afterAll(()=>db.close());
beforeEach(async()=>{
 await db.exec("reset role;truncate public.admin_user_roles,public.profiles,public.department_teams,auth.mfa_factors;");
 await db.query("insert into public.profiles values($1,'admin','active',false),($2,'admin','active',false)",[user,other]);
 await db.query("insert into public.admin_user_roles(user_id,role_id)values($1,'commercial_manager'),($2,'commercial_manager')",[user,other]);
 await db.query("insert into public.department_teams(manager_id,department)values($1,'commercial'),($2,'commercial')",[user,other]);
 await actor(user);
});
async function actor(id:string,aal='aal1'){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',aal})]);}
async function suspend(){await db.query("update public.admin_user_roles set mfa_suspended_until=now()+interval '24 hours',mfa_suspension_reason='Owner temporary request'where user_id=$1",[user]);}
async function required(){return(await db.query<{required:boolean}>('select public.admin_mfa_required() as required')).rows[0].required;}
describe('temporary individual MFA suspension',()=>{
 it('requires MFA by default even when legacy requires_mfa is false',async()=>{await db.exec('update public.admin_user_roles set requires_mfa=false');expect(await required()).toBe(true);});
 it('admits only the authorised manager and leaves other managers protected',async()=>{await suspend();expect(await required()).toBe(false);await actor(other);expect(await required()).toBe(true);});
 it('restores MFA after expiry or explicit withdrawal',async()=>{await suspend();await db.exec("update public.admin_user_roles set mfa_suspended_until=now()-interval '1 second'");expect(await required()).toBe(true);await suspend();await db.exec('update public.admin_user_roles set mfa_suspended_until=null');expect(await required()).toBe(true);});
 it('restores MFA immediately once a factor is verified',async()=>{await suspend();await db.query("insert into auth.mfa_factors values($1,'verified')",[user]);expect(await required()).toBe(true);});
 it.each(['commercial_agent','finance_manager','finance_agent','support_manager','support_agent','super_admin'])('never exempts %s',async role=>{await suspend();await db.query('update public.admin_user_roles set role_id=$1 where user_id=$2',[role,user]);expect(await required()).toBe(true);});
 it('restores MFA if another active role is assigned',async()=>{await suspend();await db.query("insert into public.admin_user_roles(user_id,role_id)values($1,'super_admin')",[user]);expect(await required()).toBe(true);});
 it('does not exempt a disabled account or disabled team',async()=>{await suspend();await db.query("update public.profiles set account_status='disabled'where id=$1",[user]);expect(await required()).toBe(true);await db.exec("update public.profiles set account_status='active';update public.department_teams set is_active=false");expect(await required()).toBe(true);});
 it('rejects an infinite deadline or missing justification',async()=>{await suspend();await db.exec("update public.admin_user_roles set mfa_suspended_until='infinity'");expect(await required()).toBe(true);await suspend();await db.exec("update public.admin_user_roles set mfa_suspension_reason=null");expect(await required()).toBe(true);});
 it('does not require a second challenge for a verified AAL2 session',async()=>{await actor(other,'aal2');expect(await required()).toBe(false);});
 it('cannot be self-enabled by an authenticated caller',async()=>{await db.exec('set role authenticated');expect((await db.query('update public.admin_user_roles set mfa_suspended_until=now()+interval \'1 day\'returning user_id')).rows).toEqual([]);await db.exec('reset role');expect(await required()).toBe(true);});
});
