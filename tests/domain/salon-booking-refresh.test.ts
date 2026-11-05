import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { latestRefresh } from "../../lib/ui/latest-refresh";
import { loadSalonBookings } from "../../lib/domain/salon-bookings";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("salon background refresh", () => {
  it("keeps the newest response when obsolete requests finish last", async () => {
    const first = deferred<string[]>(), second = deferred<string[]>();
    const received = vi.fn(), error = vi.fn();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const updates = latestRefresh<string[]>(read, received, error);
    const oldRequest = updates.refresh(), newRequest = updates.refresh();
    expect(read.mock.calls[0][0].aborted).toBe(true);
    second.resolve(["new booking"]); await newRequest;
    first.resolve(["obsolete booking"]); await oldRequest;
    expect(received.mock.calls).toEqual([[["new booking"]]]);
    expect(error).not.toHaveBeenCalled();
  });
  it("preserves loaded appointments on failure and recovers on a later refresh", async () => {
    let visible = ["existing booking"];
    const error = vi.fn();
    const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(["updated booking"]);
    const updates = latestRefresh<string[]>(read, value => { visible = value; }, error);
    await updates.refresh(); expect(visible).toEqual(["existing booking"]); expect(error).toHaveBeenCalledOnce();
    await updates.refresh(); expect(visible).toEqual(["updated booking"]);
  });
  it("discards data and errors after leaving or changing salon", async () => {
    const pending = deferred<string[]>(); const received = vi.fn(), error = vi.fn();
    const read = vi.fn().mockReturnValue(pending.promise);
    const updates = latestRefresh<string[]>(read, received, error);
    const request = updates.refresh(); updates.stop();
    expect(read.mock.calls[0][0].aborted).toBe(true);
    pending.reject(new Error("cancelled")); await request; await updates.refresh();
    expect(read).toHaveBeenCalledOnce(); expect(received).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it("requests only the chosen salon without excluding pending bookings or local dates", async () => {
    let sent: URL | undefined;
    const client = createClient("https://test.invalid", "public-test-key", { auth: { persistSession: false }, global: { fetch: async input => {
      sent = new URL(String(input));
      return Response.json([{ id: "pending-booking", status: "pending" }]);
    } } });
    const data = await loadSalonBookings(client, "salon-A", new AbortController().signal);
    expect(sent?.searchParams.get("business_id")).toBe("eq.salon-A");
    expect(sent?.searchParams.has("status")).toBe(false);
    expect(sent?.searchParams.has("starts_at")).toBe(false);
    expect(sent?.searchParams.get("limit")).toBe("200");
    expect(data[0].status).toBe("pending");
  });
});
