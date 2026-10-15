import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/20261015001940_salon_collaborator_access.sql", import.meta.url), "utf8").toLowerCase();
const invitationRoute = readFileSync(new URL("../../app/api/salon/team/route.ts", import.meta.url), "utf8");

describe("salon collaborator security migration (static contract checks)", () => {
  it("separates private roles and permissions from public collaborator presentation", () => {
    expect(sql).toContain("create table booking_private.collaborator_access");
    expect(sql).toContain("create or replace view public.collaborators_public with (security_invoker=true)");
    expect(sql).toContain("revoke all on public.collaborators from public, anon, authenticated");
    expect(sql).toContain("revoke %s (%i) on table public.collaborators from anon,authenticated");
    expect(sql).toMatch(/grant select \(id,business_id,display_name,title,avatar_url,is_bookable,is_active,created_at,updated_at,archived_at,first_name,public_last_name,specialties,buffer_minutes\)\s+on public\.collaborators to anon, authenticated/);
    expect(sql).not.toMatch(/grant\s+select\s*\([^)]*(profile_id|internal_role|commercial_permissions)[^)]*\)\s+on public\.collaborators/i);
    expect(sql).toContain("revoke all on public.business_invitations from public, anon, authenticated");
    expect(invitationRoute).toContain("NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== \"true\"");
  });

  it("stores only a one-way invitation hash and enforces owner, verified-email, expiry and one-use checks", () => {
    expect(sql).toContain("token_hash text not null unique");
    expect(sql).toContain("now()+interval '48 hours'");
    expect(sql).toContain("for update of i,s");
    expect(sql).toContain("u.email_confirmed_at is not null");
    expect(sql).toContain("i.expires_at<=now()");
    expect(sql).toContain("delete from booking_private.business_invitation_secrets where invitation_id=invitation.id");
    expect(sql).toContain("booking_private.is_active_business_owner(target_business_id)");
    expect(invitationRoute).toContain("randomBytes(32)");
    expect(invitationRoute).toContain("createHash(\"sha256\")");
    expect(invitationRoute).not.toContain("console.log(token");
  });

  it("limits legacy booking conversations to assigned staff permissions without creating a second messaging model", () => {
    expect(sql).toContain("booking_private.active_staff_permission(auth.uid(),b.collaborator_id,'messages.read')");
    expect(sql).toContain("booking_private.active_staff_permission(auth.uid(),b.collaborator_id,'messages.reply')");
    expect(sql).toContain("delete from public.conversation_members cm using public.conversations cv,public.bookings b");
    expect(sql).toContain("create or replace function public.ensure_booking_conversation");
    expect(sql).toContain("create or replace function public.get_staff_services()");
    expect(sql).not.toContain("messaging_private");
    expect(sql).not.toContain("social_stories_v2");
  });

  it("releases no SECURITY DEFINER RPC to anonymous callers", () => {
    for (const signature of [
      "owner_list_business_invitations(uuid)", "owner_list_collaborator_access(uuid)",
      "create_business_invitation(uuid,text,text,text[],text)", "accept_business_invitation(text)",
      "revoke_business_collaborator_access(uuid,uuid)", "fail_business_invitation_delivery(uuid)", "list_staff_message_bookings()",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public,anon`);
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated`);
    }
  });
});
