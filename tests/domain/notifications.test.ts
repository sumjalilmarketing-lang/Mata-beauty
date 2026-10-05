import { describe, expect, it } from "vitest";
import { notificationDestination } from "../../lib/domain/notifications";
describe("private notification destinations", () => {
  it("rejects external URLs and executable schemes", () => {
    for (const href of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/app/../redirect", "/app?next=https://evil.example"]) expect(notificationDestination({ kind: "unknown", data: { href } })).toBeNull();
  });
  it("keeps the dossier and booking context", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    for (const href of [`/onboarding?dossier=${id}`, `/pro/bookings#booking-${id}`, `/app/messages?booking=${id}`]) expect(notificationDestination({ kind: "event", data: { href } })).toBe(href);
  });
  it("opens the application or approved professional space", () => {
    expect(notificationDestination({ kind: "professional_application", data: { status: "approved" } })).toBe("/pro");
    expect(notificationDestination({ kind: "professional_application", data: { status: "additional_information_required" } })).toBe("/app/application");
  });
});
