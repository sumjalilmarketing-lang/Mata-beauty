import { z } from "zod";
import { notificationDestination } from "../domain/notifications";

// Browser-provided endpoints are still untrusted: never turn push into SSRF.
export function allowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname === "web.push.apple.com");
  } catch { return false; }
}
export const pushSubscriptionInput = z.object({
  endpoint: z.string().max(2048).refine(allowedPushEndpoint),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }),
  sound: z.boolean().default(true),
});
export function pushPayload(item: { id: string; kind: string; data: Record<string, unknown> }, sound: boolean) {
  return {
    title: "Mata Beauty",
    body: item.kind === "booking_created" ? "Vous avez reçu une nouvelle réservation." : item.kind === "booking_assignment" ? "Votre planning a été mis à jour." : ["booking_reminder", "appointment_reminder"].includes(item.kind) ? "Vous avez un rendez-vous à venir." : item.data.status === "confirmed" ? "Votre réservation est confirmée." : ["cancelled_by_client", "cancelled_by_provider"].includes(String(item.data.status)) ? "Une réservation a été annulée." : "Une réservation a été mise à jour. Ouvrez Mata Beauty pour consulter les détails.",
    url: notificationDestination(item) ?? "/app/notifications",
    tag: `mata-${item.id}`,
    silent: !sound,
  };
}
