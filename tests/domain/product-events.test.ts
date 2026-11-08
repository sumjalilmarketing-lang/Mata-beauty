import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordProductEvent } from "@/lib/analytics/product-events";
import { analyticsSessionHash, recordSessionMetric } from "@/lib/analytics/session-metric";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { analyticsChoice, setAnalyticsChoice } from "@/lib/analytics/consent";

beforeEach(() => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  vi.stubGlobal("window", Object.assign(new EventTarget(), { sessionStorage: storage, localStorage: storage }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  setAnalyticsChoice("accepted");
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("optional product analytics", () => {
  it("does not create a measurement identifier or send metrics without a choice", async () => {
    window.localStorage.removeItem("mata-analytics-choice-v1");
    const rpc = vi.fn();
    await expect(recordProductEvent({ rpc } as unknown as SupabaseClient, "search")).resolves.toBe(false);
    expect(window.sessionStorage.getItem("mata-analytics-session")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("expires old consent and fails closed on malformed or future choices", () => {
    for (const value of ["broken", JSON.stringify({ choice: "accepted", savedAt: Date.now() - 180 * 86400000 }), JSON.stringify({ choice: "accepted", savedAt: Date.now() + 60000 })]) {
      window.localStorage.setItem("mata-analytics-choice-v1", value);
      expect(analyticsChoice()).toBeNull();
    }
  });

  it("withdraws consent, clears identifiers and aborts in-flight telemetry", async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const rpc = vi.fn();
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("Withdrawn")), { once: true }); started();
    }));
    const pending = recordProductEvent({ rpc } as unknown as SupabaseClient, "search");
    await ready;
    setAnalyticsChoice("rejected");
    await expect(pending).resolves.toBe(false);
    expect(analyticsChoice()).toBe("rejected");
    expect(window.sessionStorage.getItem("mata-analytics-session")).toBeNull();
    expect(window.sessionStorage.getItem("mata-feed-session")).toBeNull();
    rpc.mockClear();
    vi.mocked(fetch).mockClear();
    await recordProductEvent({ rpc } as unknown as SupabaseClient, "search");
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("disables measurement for this page if the choice cannot be saved", () => {
    vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: { getItem: () => JSON.stringify({ choice: "accepted", savedAt: Date.now() }), setItem: () => { throw new Error("Quota"); }, removeItem: () => { throw new Error("Denied"); } } }));
    expect(setAnalyticsChoice("rejected")).toBe(false);
    expect(analyticsChoice()).toBeNull();
  });
  it("does not reject or send a metric when browser storage is forbidden", async () => {
    const localStorage = window.localStorage;
    vi.stubGlobal("window", { localStorage, get sessionStorage() { throw new DOMException("Storage denied", "SecurityError"); } });
    const rpc = vi.fn();
    await expect(recordProductEvent({ rpc } as unknown as SupabaseClient, "booking_started")).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not propagate a failed analytics request to the user action", async () => {
    const rpc = vi.fn();
    vi.mocked(fetch).mockRejectedValue(new Error("Analytics unavailable"));
    await expect(recordProductEvent({ rpc } as unknown as SupabaseClient, "booking_started")).resolves.toBe(false);
  });

  it("skips tracking when the session cannot be stored", async () => {
    const localStorage = window.localStorage;
    vi.stubGlobal("window", { localStorage, sessionStorage: { getItem: () => null, setItem: () => { throw new DOMException("Full", "QuotaExceededError"); } } });
    await expect(analyticsSessionHash("test")).resolves.toBeNull();
  });

  it("sends a reusable hashed session and only scalar product properties", async () => {
    const client = { rpc: vi.fn() } as unknown as SupabaseClient;
    await expect(recordProductEvent(client, "search", { count: 2, nested: { ignored: true } })).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/analytics/product-event", expect.objectContaining({ credentials: "same-origin", method: "POST" }));
    const first = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string) as { target_session_hash: string; target_properties: Record<string, unknown> };
    expect(first.target_session_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.target_properties).toEqual({ count: 2 });
    await recordProductEvent(client, "search");
    const second = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string) as { target_session_hash: string };
    expect(second.target_session_hash).toBe(first.target_session_hash);
  });

  it("does not start a request after its page has exited", async () => {
    const rpc = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(recordSessionMetric({ rpc } as unknown as SupabaseClient, "record_video_view", {}, "test", controller.signal)).resolves.toEqual({ ok: false, data: null });
    expect(rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels in-flight telemetry when the page exits", async () => {
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const rpc = vi.fn();
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }); notifyStarted();
    }));
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
    const rpc = vi.fn();
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("Timed out")), { once: true }); notifyStarted();
    }));
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

it("preserves the server share count without exposing direct anonymous RPC access", async () => {
 vi.mocked(fetch).mockResolvedValue(Response.json({data:42})); const rpc=vi.fn();
 await expect(recordSessionMetric({rpc} as unknown as SupabaseClient,"record_post_share",{target_post_id:"post"})).resolves.toEqual({ok:true,data:42});
 expect(rpc).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledWith("/api/analytics/social-metric",expect.objectContaining({credentials:"same-origin"}));
});
