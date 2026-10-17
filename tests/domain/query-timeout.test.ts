import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryTimeoutError, withQueryTimeout } from "../../lib/domain/query-timeout";

describe("withQueryTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the query result before the deadline", async () => {
    await expect(withQueryTimeout(async (signal) => {
      expect(signal.aborted).toBe(false);
      return "loaded";
    }, 100)).resolves.toBe("loaded");
  });

  it("aborts and rejects a query that exceeds its deadline", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const pending = withQueryTimeout((signal) => {
      requestSignal = signal;
      return new Promise<string>(() => undefined);
    }, 50);
    const rejection = expect(pending).rejects.toBeInstanceOf(QueryTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
  });

  it("cancels when its parent component is unmounted", async () => {
    const parent = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const pending = withQueryTimeout((signal) => {
      requestSignal = signal;
      return new Promise<string>(() => undefined);
    }, 1_000, parent.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    parent.abort();
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
  });
});
