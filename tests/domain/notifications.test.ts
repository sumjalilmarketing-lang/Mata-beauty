import { describe, expect, it } from "vitest";
import { normalizeNotificationSpace, notificationBadgeAfterRead, notificationDestination, notificationVisibleInSpace } from "../../lib/domain/notifications";

describe("notification badge", () => {
  it("decrements immediately for one newly read item and never goes below zero", () => {
    expect(notificationBadgeAfterRead(3, 1)).toBe(2);
    expect(notificationBadgeAfterRead(0, 1)).toBe(0);
  });

  it("clears after all notifications are marked read", () => {
    expect(notificationBadgeAfterRead(8, null)).toBe(0);
  });
});
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

describe("workspace-scoped notifications", () => {
  const item = (kind: string, href?: string, data: Record<string, unknown> = {}) => ({ kind, data: { ...data, ...(href ? { href } : {}) } });

  it("keeps notifications in the workspace named by their safe internal destination", () => {
    expect(notificationVisibleInSpace(item("booking_status", "/app/bookings"), "client")).toBe(true);
    expect(notificationVisibleInSpace(item("booking_status", "/app/bookings"), "pro")).toBe(false);
    expect(notificationVisibleInSpace(item("booking_status", "/pro/bookings"), "pro")).toBe(true);
    expect(notificationVisibleInSpace(item("booking_assignment", "/salon/bookings"), "salon")).toBe(true);
    expect(notificationVisibleInSpace(item("booking_assignment", "/staff/bookings"), "staff")).toBe(true);
    expect(notificationVisibleInSpace(item("internal_access", "/admin/administrators"), "admin")).toBe(true);
    expect(notificationVisibleInSpace(item("support_ticket", "/support-agent/inbox"), "admin")).toBe(true);
    expect(notificationVisibleInSpace(item("support_ticket", "/support-agent/inbox"), "client")).toBe(false);
  });

  it("routes legacy role-specific kinds and retains unclassified events as shared", () => {
    expect(notificationVisibleInSpace(item("internal_access"), "admin")).toBe(true);
    expect(notificationVisibleInSpace(item("internal_access"), "client")).toBe(false);
    expect(notificationVisibleInSpace(item("publication_completed"), "pro")).toBe(true);
    expect(notificationVisibleInSpace(item("welcome"), "client")).toBe(true);
    expect(notificationVisibleInSpace(item("legacy_event"), "salon")).toBe(true);
    expect(notificationVisibleInSpace(item("legacy_event"), "client")).toBe(true);
  });

  it("keeps legacy booking status notices available to either participant without leaking them into other workspaces", () => {
    const notice = item("booking_status_changed", undefined, { booking_id: "123e4567-e89b-42d3-a456-426614174000" });
    expect(notificationVisibleInSpace(notice, "client")).toBe(true);
    expect(notificationVisibleInSpace(notice, "pro")).toBe(true);
    expect(notificationVisibleInSpace(notice, "salon")).toBe(false);
    expect(notificationVisibleInSpace(notice, "admin")).toBe(false);
    expect(notificationDestination(notice, "client")).toBe("/app/bookings#booking-123e4567-e89b-42d3-a456-426614174000");
    expect(notificationDestination(notice, "pro")).toBe("/pro/bookings#booking-123e4567-e89b-42d3-a456-426614174000");
    const invalidDestination = item("booking_status_changed", "https://example.invalid", { booking_id: "123e4567-e89b-42d3-a456-426614174000" });
    expect(notificationVisibleInSpace(invalidDestination, "pro")).toBe(true);
    expect(notificationVisibleInSpace(invalidDestination, "admin")).toBe(false);
  });

  it("normalizes app role and administrative workspace keys", () => {
    expect(normalizeNotificationSpace("provider")).toBe("pro");
    expect(normalizeNotificationSpace("finance")).toBe("admin");
    expect(normalizeNotificationSpace("salon")).toBe("salon");
    expect(notificationDestination(item("support_ticket", "/support-agent/inbox"))).toBe("/support-agent/inbox");
  });
});
