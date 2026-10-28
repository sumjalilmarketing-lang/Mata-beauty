export type NotificationItem = { id: string; title: string; body: string; kind: string; data: Record<string, unknown>; read_at: string | null; created_at: string };
export type NotificationSpace = "client" | "pro" | "salon" | "staff" | "admin";
export function normalizeNotificationSpace(space?: string): NotificationSpace {
  if (space === "client" || space === "pro" || space === "provider" || space === "salon" || space === "staff") return space === "provider" ? "pro" : space;
  return "admin";
}

export function notificationBadgeAfterRead(current: number, changedCount: number | null): number {
  return changedCount === null ? 0 : Math.max(0, current - Math.max(0, changedCount));
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notificationSpace(item: Pick<NotificationItem, "kind" | "data">): NotificationSpace | "shared" | "booking_shared" {
  const explicitHref = item.data?.href;
  const extraAdminRoute = typeof explicitHref === "string" && /^\/(?:support|support-agent|finance|operations)(?:\/|$)/.test(explicitHref) ? explicitHref : null;
  // This legacy trigger sends the same event kind to both booking participants without a destination.
  // Keep it in the two participant spaces instead of misclassifying every event as a client notice.
  if (item.kind === "booking_status_changed" && typeof explicitHref !== "string") return "booking_shared";
  const destination = notificationDestination(item) ?? extraAdminRoute;
  const path = destination?.split(/[?#]/, 1)[0] ?? "";
  if (path === "/app" || path.startsWith("/app/")) return "client";
  if (path === "/pro" || path.startsWith("/pro/")) return "pro";
  if (path === "/salon" || path.startsWith("/salon/")) return "salon";
  if (path === "/staff" || path.startsWith("/staff/")) return "staff";
  if (["/admin", "/onboarding", "/moderation", "/support", "/support-agent", "/finance", "/operations"].some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return "admin";
  if (["internal_access", "professional_application", "provider_status", "social_moderation", "publication_completed"].includes(item.kind)) {
    return item.kind === "internal_access" ? "admin" : item.kind === "social_moderation" || item.kind === "publication_completed" ? "pro" : item.data.status === "approved" ? "pro" : "client";
  }
  return "shared";
}

export function notificationVisibleInSpace(item: Pick<NotificationItem, "kind" | "data">, space: NotificationSpace): boolean {
  const ownerSpace = notificationSpace(item);
  return ownerSpace === "shared" || ownerSpace === space || (ownerSpace === "booking_shared" && (space === "client" || space === "pro"));
}

export function notificationDestination(item: Pick<NotificationItem, "kind" | "data">, space?: NotificationSpace): string | null {
  const href = item.data?.href;
  // Never follow arbitrary URLs from legacy notification data.
  if (typeof href === "string" && /^\/(?:app|pro|salon|staff|onboarding|moderation|admin|support-agent|support|finance|operations)(?:\/[a-z-]+)?(?:\?(?:dossier|booking|conversation)=[0-9a-f-]{36})?(?:#booking-[0-9a-f-]{36})?$/.test(href)) return href;
  const postId = item.data?.post_id;
  if (["social_moderation", "publication_completed"].includes(item.kind)) return "/pro/videos";
  if (typeof postId === "string" && uuid.test(postId)) return `/posts/${postId}`;
  if (["professional_application", "provider_status"].includes(item.kind)) return item.data.status === "approved" ? "/pro" : "/app/application";
  const bookingId = item.data?.booking_id;
  if (typeof bookingId === "string" && uuid.test(bookingId)) {
    const bookingPath = item.kind === "booking_created" || (item.kind === "booking_status_changed" && space === "pro") ? "/pro" : "/app";
    return `${bookingPath}/bookings#booking-${bookingId}`;
  }
  if (item.kind === "welcome") return "/app/profile";
  return null;
}
