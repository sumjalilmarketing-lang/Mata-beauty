import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const user = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const source = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

beforeAll(async () => {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
    create function public.admin_mfa_required() returns boolean language sql stable as $$select coalesce(current_setting('request.mfa_required',true),'false')::boolean$$;
    create table public.profiles(id uuid primary key, role text, account_status text, is_suspended boolean);
    create table public.admin_roles(id text primary key, key text, is_active boolean);
    create table public.admin_user_roles(user_id uuid, role_id text, is_active boolean, revoked_at timestamptz);
    create table public.admin_role_permissions(role_id text, permission_key text);
    create table public.private_cases(id integer primary key);
    insert into public.private_cases values(1);
    alter table public.private_cases enable row level security;
    grant select on public.private_cases to authenticated;
    create policy internal_cases on public.private_cases to authenticated using(public.admin_mfa_required() = false);
  `);
  const legacy = await source("20261006010731_enforce_professional_approval_and_admin_mfa.sql");
  await db.exec(legacy.slice(legacy.indexOf("create or replace function public.is_super_admin()"), legacy.indexOf("-- Keep the current context shape")));
  await db.exec(await source("20261006015600_enforce_active_admin_membership.sql"));
  await db.exec("drop policy internal_cases on public.private_cases; create policy internal_cases on public.private_cases to authenticated using(public.has_admin_permission('cases.read'));");
  await actor();
  await db.query("insert into public.profiles values($1,'admin','disabled',false)", [user]);
  await db.exec("insert into public.admin_roles values('super','super_admin',true); insert into public.admin_role_permissions values('super','cases.read');");
  await db.query("insert into public.admin_user_roles values($1,'super',true,null)", [user]);
  expect(await rights()).toEqual({ admin: true, super: true, permission: true });
  await db.exec(await source("20261109143532_enforce_active_internal_authorization.sql"));
}, 60000);

afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("reset role; update public.profiles set account_status='active',is_suspended=false; update public.admin_roles set is_active=true; update public.admin_user_roles set is_active=true,revoked_at=null;");
  await actor();
});
async function actor(mfa = false, id = user) {
  await db.query("select set_config('request.user_id',$1,false),set_config('request.mfa_required',$2,false)", [id, String(mfa)]);
}
async function rights() {
  return (await db.query<{ admin: boolean; super: boolean; permission: boolean }>("select public.is_admin() as admin,public.is_super_admin() as super,public.has_admin_permission('cases.read') as permission")).rows[0];
}
const denied = { admin: false, super: false, permission: false };
describe("active internal account authorization", () => {
  it("retains the active verified administrator's permissions", async () => {
    expect(await rights()).toEqual({ admin: true, super: true, permission: true });
  });
  it.each(["disabled", "deleted", "suspended", "email_unverified", "phone_unverified", "unknown"])("denies a %s account with a still-valid verified session", async status => {
    await db.query("update public.profiles set account_status=$1", [status]);
    expect(await rights()).toEqual(denied);
    await db.exec("set role authenticated");
    expect((await db.query("select * from public.private_cases")).rows).toEqual([]);
  });
  it("denies a null account status", async () => {
    await db.exec("update public.profiles set account_status=null");
    expect(await rights()).toEqual(denied);
  });
  it.each(["update public.profiles set is_suspended=true", "update public.admin_user_roles set is_active=false", "update public.admin_user_roles set revoked_at=now()", "update public.admin_roles set is_active=false"])("retains the existing guard: %s", async sql => {
    await db.exec(sql);
    expect(await rights()).toEqual(denied);
  });
  it("still requires MFA", async () => {
    await actor(true);
    expect(await rights()).toEqual(denied);
  });
  it("never assigns another user's membership to a caller", async () => {
    await actor(false, "aaaaaaaa-aaaa-4aaa-8aaa-000000000002");
    expect(await rights()).toEqual(denied);
  });
  it("keeps delegated permission scope without super administrator privileges", async () => {
    await db.exec("update public.admin_roles set key='finance_agent'");
    expect(await rights()).toEqual({ admin: true, super: false, permission: true });
    expect((await db.query<{ allowed: boolean }>("select public.has_admin_permission('users.delete') as allowed")).rows[0].allowed).toBe(false);
  });
});
