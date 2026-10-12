export type NotificationItem = { id: string; title: string; body: string; kind: string; data: Record<string, unknown>; read_at: string | null; created_at: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationDestination(item: Pick<NotificationItem, "kind" | "data">): string | null {
  const href = item.data?.href;
  // Conversation/message identifiers are validated independently; keep the exact
  // private destination without accepting arbitrary query parameters or URLs.
  if (typeof href === "string" && /^\/(?:app|pro|salon|staff)\/messages\?conversation=[0-9a-f-]{36}(?:&message=[0-9a-f-]{36})?$/.test(href)) {
    const target = new URL(href, "https://mata-beauty.com");
    if (uuid.test(target.searchParams.get("conversation") ?? "") && (!target.searchParams.has("message") || uuid.test(target.searchParams.get("message") ?? ""))) return href;
  }
  // Never follow arbitrary URLs from legacy notification data.
  if (typeof href === "string" && /^\/(?:app|pro|salon|staff|onboarding|moderation|admin)(?:\/[a-z-]+)?(?:\?(?:dossier|booking|conversation)=[0-9a-f-]{36})?(?:#booking-[0-9a-f-]{36})?$/.test(href)) return href;
  const postId = item.data?.post_id;
  const conversationId = item.data?.conversation_id;
  if (typeof conversationId === "string" && uuid.test(conversationId)) {
    const messageId = item.data?.message_id;
    return `/app/messages?conversation=${conversationId}${typeof messageId === "string" && uuid.test(messageId) ? `&message=${messageId}` : ""}`;
  }
  if (["social_moderation", "publication_completed"].includes(item.kind)) return "/pro/videos";
  if (typeof postId === "string" && uuid.test(postId)) return `/posts/${postId}`;
  if (["professional_application", "provider_status"].includes(item.kind)) return item.data.status === "approved" ? "/pro" : "/app/application";
  const bookingId = item.data?.booking_id;
  if (typeof bookingId === "string" && uuid.test(bookingId)) return `${item.kind === "booking_created" ? "/pro" : "/app"}/bookings#booking-${bookingId}`;
  if (item.kind === "welcome") return "/app/profile";
  return null;
}
