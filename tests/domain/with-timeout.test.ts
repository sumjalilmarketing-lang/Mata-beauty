import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestTimeoutError, withTimeout } from "@/lib/domain/with-timeout";

describe("withTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("returns a result that completes before the deadline", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve("loaded"), 1000)).resolves.toBe("loaded");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts the caller and reports a deadline when work stalls", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const operation = new Promise<string>(() => undefined);
    const result = withTimeout(operation, 1000, onTimeout);
    const rejected = expect(result).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(1000);
    await rejected;

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
