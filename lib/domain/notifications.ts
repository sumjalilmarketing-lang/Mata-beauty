export type NotificationItem = { id: string; title: string; body: string; kind: string; data: Record<string, unknown>; read_at: string | null; created_at: string };
export function notificationBadgeAfterRead(current: number, changedCount: number | null): number {
  return changedCount === null ? 0 : Math.max(0, current - Math.max(0, changedCount));
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationDestination(item: Pick<NotificationItem, "kind" | "data">): string | null {
  const href = item.data?.href;
  // Never follow arbitrary URLs from legacy notification data.
  if (typeof href === "string" && /^\/(?:app|pro|salon|staff|onboarding|moderation|admin)(?:\/[a-z-]+)?(?:\?(?:dossier|booking|conversation)=[0-9a-f-]{36})?(?:#booking-[0-9a-f-]{36})?$/.test(href)) return href;
  const postId = item.data?.post_id;
  if (["social_moderation", "publication_completed"].includes(item.kind)) return "/pro/videos";
  if (typeof postId === "string" && uuid.test(postId)) return `/posts/${postId}`;
  if (["professional_application", "provider_status"].includes(item.kind)) return item.data.status === "approved" ? "/pro" : "/app/application";
  const bookingId = item.data?.booking_id;
  if (typeof bookingId === "string" && uuid.test(bookingId)) return `${item.kind === "booking_created" ? "/pro" : "/app"}/bookings#booking-${bookingId}`;
  if (item.kind === "welcome") return "/app/profile";
  return null;
}
