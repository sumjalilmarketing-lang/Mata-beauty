import { describe, expect, it } from "vitest";
import { allowedPushEndpoint, pushPayload, pushSubscriptionInput } from "../../lib/push/policy";

describe("web push trust boundaries", () => {
  it("accepts supported browser transports and refuses SSRF/credentials/ports", () => {
    for (const host of ["fcm.googleapis.com", "web.push.apple.com", "updates.push.services.mozilla.com"]) expect(allowedPushEndpoint(`https://${host}/endpoint`)).toBe(true);
    for (const endpoint of ["http://fcm.googleapis.com/a", "https://127.0.0.1/a", "https://fcm.googleapis.com.evil.example/a", "https://user@fcm.googleapis.com/a", "https://web.push.apple.com:8443/a", "https://web.push.apple.com/a#x"]) expect(allowedPushEndpoint(endpoint)).toBe(false);
  });
  it("requires browser encryption material", () => {
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://web.push.apple.com/a", keys: { auth: "a".repeat(22), p256dh: "b".repeat(87) } }).success).toBe(true);
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://web.push.apple.com/a", keys: { auth: "short", p256dh: "invalid" } }).success).toBe(false);
  });
  it("keeps private appointment details off the lock screen", () => {
    const result = pushPayload({ id: "notification", kind: "booking_status_changed", data: { status: "confirmed", client_name: "Private person", body: "Private address", href: "https://evil.example" } }, false);
    expect(result.body).toBe("Votre réservation est confirmée.");
    expect(result.url).toBe("/app/notifications");
    expect(result.silent).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Private");
  });
  it("opens the recipient's role-specific booking destination", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const result = pushPayload({ id, kind: "booking_assignment", data: { booking_id: id, href: `/staff/bookings#booking-${id}` } }, true);
    expect(result.url).toBe(`/staff/bookings#booking-${id}`);
    expect(result.silent).toBe(false);
  });
});
