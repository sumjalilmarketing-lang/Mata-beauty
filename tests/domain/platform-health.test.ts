import { describe, expect, it } from "vitest";
import { loadPlatformHealth, measuredCount, measuredDeliveries } from "../../lib/admin/platform-health";

const sources = {
  server: async () => true,
  bookings24h: async () => 17,
  uploads24h: async () => 3,
  criticalAlerts: async () => 0,
  deliveries: async () => ({ notifications24h: 8, pending: 1, sent: 6, failed: 0, needsReview: 1 }),
};

describe("platform health partial failures", () => {
  it("keeps independent measurements when one API is unavailable", async () => {
    const result = await loadPlatformHealth({ ...sources, criticalAlerts: async () => { throw new Error("relation missing"); } });
    expect(result).toEqual({ server: true, bookings24h: 17, uploads24h: 3, criticalAlerts: null, deliveries: await sources.deliveries() });
  });
  it("ends a hanging request and never substitutes zero", async () => {
    const result = await loadPlatformHealth({ ...sources, bookings24h: () => new Promise<number>(() => {}) }, 5);
    expect(result.bookings24h).toBeNull();
    expect(result.uploads24h).toBe(3);
  });
  it("distinguishes an observed incident from an unreachable probe", async () => {
    expect((await loadPlatformHealth({ ...sources, server: async () => false })).server).toBe(false);
    expect((await loadPlatformHealth({ ...sources, server: async () => { throw new Error("offline"); } })).server).toBeNull();
  });
  it("accepts measured zero but rejects absent, failed or malformed counts", () => {
    expect(measuredCount({ count: 0, error: null })).toBe(0);
    expect(() => measuredCount({ count: null, error: null })).toThrow();
    expect(() => measuredCount({ count: 0, error: { code: "42501" } })).toThrow();
    expect(() => measuredDeliveries({ notifications24h: 0 })).toThrow();
  });
});
