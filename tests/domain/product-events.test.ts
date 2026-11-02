import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordProductEvent } from "@/lib/analytics/product-events";
import { analyticsSessionHash, recordSessionMetric } from "@/lib/analytics/session-metric";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("optional product analytics", () => {
  it("does not reject or send a metric when browser storage is forbidden", async () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new DOMException("Storage denied", "SecurityError"); } });
    const rpc = vi.fn();
    await expect(recordProductEvent({ rpc } as unknown as SupabaseClient, "booking_started")).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not propagate a failed analytics request to the user action", async () => {
    const rpc = vi.fn(() => { throw new Error("Analytics unavailable"); });
    await expect(recordProductEvent({ rpc } as unknown as SupabaseClient, "booking_started")).resolves.toBe(false);
  });

  it("skips tracking when the session cannot be stored", async () => {
    vi.stubGlobal("window", { sessionStorage: { getItem: () => null, setItem: () => { throw new DOMException("Full", "QuotaExceededError"); } } });
    await expect(analyticsSessionHash("test")).resolves.toBeNull();
  });

  it("sends a reusable hashed session and only scalar product properties", async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: null, error: null });
    const rpc = vi.fn(() => ({ abortSignal }));
    const client = { rpc } as unknown as SupabaseClient;
    await expect(recordProductEvent(client, "search", { count: 2, nested: { ignored: true } })).resolves.toBe(true);
    const first = rpc.mock.calls[0] as unknown as [string, { target_session_hash: string; target_properties: Record<string, unknown> }];
    expect(first[1].target_session_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first[1].target_properties).toEqual({ count: 2 });
    await recordProductEvent(client, "search");
    expect((rpc.mock.calls[1] as unknown as [string, { target_session_hash: string }])[1].target_session_hash).toBe(first[1].target_session_hash);
  });

  it("does not start a request after its page has exited", async () => {
    const rpc = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(recordSessionMetric({ rpc } as unknown as SupabaseClient, "record_video_view", {}, "test", controller.signal)).resolves.toEqual({ ok: false, data: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cancels in-flight telemetry when the page exits", async () => {
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const rpc = vi.fn(() => ({ abortSignal: (signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      notifyStarted();
    }) }));
    const controller = new AbortController();
    const pending = recordSessionMetric({ rpc } as unknown as SupabaseClient, "record_video_view", {}, "test", controller.signal);
    await started;
    controller.abort();
    await expect(pending).resolves.toEqual({ ok: false, data: null });
  });

  it("bounds an unresponsive metric request to five seconds", async () => {
    vi.useFakeTimers();
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const rpc = vi.fn(() => ({ abortSignal: (signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Timed out")), { once: true });
      notifyStarted();
    }) }));
    const pending = recordSessionMetric({ rpc } as unknown as SupabaseClient, "record_video_view", {});
    await started;
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual({ ok: false, data: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats denied browser preferences as optional", () => {
    vi.stubGlobal("window", { get localStorage() { throw new DOMException("Denied", "SecurityError"); } });
    expect(readBrowserStorage("localStorage", "mata-theme")).toBeNull();
    expect(writeBrowserStorage("localStorage", "mata-theme", "dark")).toBe(false);
  });
});
