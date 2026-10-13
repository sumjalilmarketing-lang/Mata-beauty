import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261013130000_salon_collaborator_access.sql", import.meta.url), "utf8");
const collaboratorAclHotfix = readFileSync(new URL("../../supabase/migrations/20261013175002_harden_collaborator_api_privileges.sql", import.meta.url), "utf8");
const apiRoute = readFileSync(new URL("../../app/api/salon/invitations/route.ts", import.meta.url), "utf8");
const acceptRoute = readFileSync(new URL("../../app/api/salon/invitations/accept/route.ts", import.meta.url), "utf8");
const workspaceServer = readFileSync(new URL("../../lib/auth/workspace-server.ts", import.meta.url), "utf8");
const teamUi = readFileSync(new URL("../../app/team-management.tsx", import.meta.url), "utf8");

describe("salon collaborator access migration security", () => {
  it("prepares the independent ACL fix without widening access to internal columns", () => {
    expect(collaboratorAclHotfix).toContain("revoke all privileges on table public.collaborators from public, anon, authenticated");
    expect(collaboratorAclHotfix).toContain("revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I)");
    const publicFields = collaboratorAclHotfix.match(/grant select \(([\s\S]*?)\) on table public\.collaborators to anon, authenticated/i)?.[1] ?? "";
    expect(publicFields).toContain("display_name");
    expect(publicFields).not.toMatch(/profile_id|internal_role|staff_permissions/);
    expect(collaboratorAclHotfix).toContain("grant update (");
    expect(collaboratorAclHotfix).not.toMatch(/drop policy|drop column|delete from public\.collaborators/i);
  });

  it("moves permissions and invitation credentials to the non-API private schema", () => {
    expect(migration).not.toMatch(/alter table public\.collaborators\s+add column if not exists staff_permissions/i);
    expect(migration).not.toMatch(/alter table public\.business_invitations\s+add column if not exists token_hash/i);
    expect(migration).toContain("create table if not exists booking_private.collaborator_access");
    expect(migration).toContain("create table if not exists booking_private.business_invitation_secrets");
    expect(migration).toContain("create table if not exists booking_private.business_invitation_events");
    expect(migration).toContain("revoke all on schema booking_private from public,anon,authenticated");
    expect(migration).toContain("alter table booking_private.collaborator_access enable row level security");
    expect(migration).toContain("alter table booking_private.business_invitation_secrets enable row level security");
    expect(migration).toContain("drop column if exists staff_permissions");
    expect(migration).toContain("drop column if exists token_hash");
    expect(migration).toContain("alter table public.collaborators drop column if exists internal_role");
  });

  it("grants only public collaborator fields to the PostgREST roles", () => {
    expect(migration).toContain("revoke all on public.collaborators from public,anon,authenticated");
    const selectFields = migration.match(/grant select\(([^)]+)\) on public\.collaborators to anon,authenticated/i)?.[1]?.split(",") ?? [];
    expect(selectFields).toContain("display_name");
    expect(selectFields).not.toContain("profile_id");
    expect(selectFields).not.toContain("internal_role");
    expect(selectFields).not.toContain("staff_permissions");
    expect(migration).toMatch(/grant update\(display_name,title,avatar_url,is_bookable,is_active,archived_at,first_name,public_last_name,specialties,buffer_minutes\) on public\.collaborators to authenticated/);
    const updateFields = migration.match(/grant update\(([^)]+)\) on public\.collaborators to authenticated/i)?.[1]?.split(",") ?? [];
    expect(updateFields).not.toContain("profile_id");
    expect(updateFields).not.toContain("internal_role");
    expect(updateFields).not.toContain("staff_permissions");
    expect(migration).toContain("public.collaborator_has_permission(business_id,collaborator_id,'bookings.read')");
    expect(migration).toContain("public.collaborator_has_permission(b.business_id,b.collaborator_id,'clients.read')");
  });

  it("restricts privileged RPC execution and checks invitation single use and verified email", () => {
    expect(migration).toContain("grant execute on function public.current_collaborator_access() to authenticated");
    expect(migration).toContain("grant execute on function public.owner_list_collaborator_access(uuid) to authenticated");
    expect(migration).toContain("grant execute on function public.lookup_business_invitation(text) to service_role");
    expect(migration).toContain("grant execute on function public.accept_business_invitation(uuid,text,uuid) to service_role");
    expect(migration).toContain("u.email_confirmed_at is not null");
    expect(migration).toContain("for update");
    expect(migration).toContain("update booking_private.business_invitation_secrets set token_hash=null where invitation_id=target_invitation_id");
    expect(migration).toContain("now()+interval '48 hours'");
  });

  it("prepares SQL checks for internal-column reads, writes, and preserved row policies", async () => {
    const sql = readFileSync(new URL("../../supabase/tests/collaborator_access_privacy.sql", import.meta.url), "utf8");
    expect(sql).toContain("has_column_privilege('anon','public.collaborators','profile_id','update')");
    expect(sql).toContain("column_name='internal_role'");
    expect(sql).toContain("has_table_privilege('anon','public.collaborators','truncate')");
    expect(sql).toContain("active collaborators public read");
    expect(sql).toContain("business owners manage collaborators");
  });

  it("keeps browser and server code away from private permission columns and raw invitation credentials", () => {
    expect(workspaceServer).toContain('rpc("current_collaborator_access")');
    expect(teamUi).toContain('rpc("owner_list_collaborator_access"');
    expect(apiRoute).toContain('rpc("create_business_invitation"');
    expect(apiRoute).toContain('rpc("mark_business_invitation_sent"');
    expect(apiRoute).not.toMatch(/from\("business_invitations"\)\.update/);
    expect(acceptRoute).toContain('rpc("lookup_business_invitation"');
    expect(acceptRoute).toContain('rpc("accept_business_invitation"');
    expect(acceptRoute).not.toMatch(/from\("business_invitations"\)/);
  });
});
