import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stories = readFileSync(new URL("../../supabase/migrations/20261013190000_social_stories_v2.sql", import.meta.url), "utf8");
const requests = readFileSync(new URL("../../supabase/migrations/20261013191000_conversation_message_requests.sql", import.meta.url), "utf8");
const storiesRoute = readFileSync(new URL("../../app/api/stories/route.ts", import.meta.url), "utf8");
const cleanup = readFileSync(new URL("../../lib/messaging/cleanup.ts", import.meta.url), "utf8");
const conversationUi = readFileSync(new URL("../../app/conversation-messages.tsx", import.meta.url), "utf8");
const assignment = readFileSync(new URL("../../supabase/migrations/20261013192000_conversation_assignment_audit.sql", import.meta.url), "utf8");

describe("social messaging V2 security contracts", () => {
  it("keeps Story media private and metadata access column-scoped", () => {
    expect(stories).toContain("alter table public.professional_stories enable row level security");
    expect(stories).toContain("grant select (id, provider_id, provider_service_id, caption, content_type, size_bytes, duration_seconds, published_at, expires_at)");
    expect(stories).toContain("revoke all on public.professional_stories from public, anon, authenticated");
    expect(stories).toContain("values ('professional-stories', 'professional-stories', false");
    expect(stories).toContain("status = 'published' and expires_at > now()");
    expect(stories).toContain("p.status = 'approved'");
    expect(stories).toContain("grant execute on function public.list_active_professional_stories(integer) to service_role");
    expect(stories).toContain("from public, anon, authenticated");
  });

  it("limits Stories to approved owners and validates media before publishing", () => {
    expect(storiesRoute).toContain('provider.data?.status !== "approved"');
    expect(storiesRoute).toContain("validateMessageMedia(Buffer.from(await download.data.arrayBuffer()), story.content_type)");
    expect(storiesRoute).toContain("validated.duration > 15");
    expect(storiesRoute).toContain("createSignedUrl(row.storage_path, 300)");
    expect(storiesRoute).toContain("createSignedUploadUrl(sourcePath");
    expect(storiesRoute).toContain("hasTrustedOrigin(request)");
    expect(cleanup).toContain('eq("status", "published").lte("expires_at", now)');
    expect(cleanup).toContain('eq("status", "pending").lt("created_at", abandonedBefore)');
  });

  it("keeps direct requests in conversations and makes acceptance/rejection server-side", () => {
    expect(requests).toContain("add column request_status text not null default 'accepted'");
    expect(requests).toContain("insert into public.conversations(client_id,provider_id,request_status,requested_by)");
    expect(requests).toContain("request_state='pending'");
    expect(requests).toContain("new.sender_id is distinct from requester");
    expect(requests).toContain("where c.id=target_conversation_id and c.provider_id=auth.uid()");
    expect(requests).toContain("request_status='pending'");
    expect(requests).toContain("'request_status',c.request_status,'requested_by',c.requested_by");
    expect(requests).toContain("'message_request_'||next_state");
    expect(requests).toContain("grant execute on function public.respond_to_message_request(uuid,boolean) to authenticated");
    expect(requests).toContain("grant execute on function public.list_my_message_requests() to authenticated");
    expect(conversationUi).toContain("summary?.request_status === \"pending\"");
    expect(conversationUi).toContain("summary?.request_status === \"declined\"");
  });

  it("limits conversation assignment to salon owners and reuses booking audit", () => {
    expect(assignment).toContain("business.owner_id=auth.uid()");
    expect(assignment).toContain("'messages.read'=any(a.staff_permissions)");
    expect(assignment).toContain("public.reassign_booking_collaborator(selected_booking.id,target_collaborator_id");
    expect(assignment).toContain("booking_private.can_assign(selected_booking.provider_service_id");
    expect(assignment).toContain("schedule conflicts, assignment audit rows and client notifications");
    expect(assignment).toContain("grant execute on function public.owner_assign_conversation(uuid,uuid) to authenticated");
  });
});
