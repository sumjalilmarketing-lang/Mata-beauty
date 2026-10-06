import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validDispatchRequest } from "../../lib/email/dispatch-auth";

describe("transactional worker authentication", () => {
  const now = 1791244800000, secret = "test-only-dispatch-key";
  function signed(timestamp: number, key = secret) {
    return new Headers({ "x-mata-dispatch-time": String(timestamp), "x-mata-dispatch-signature": createHmac("sha256", key).update(`mata-notifications:${timestamp}`).digest("hex") });
  }
  it("accepts a current signature without transmitting the reusable credential", () => {
    expect(validDispatchRequest(signed(now / 1000), secret, now)).toBe(true);
  });
  it("rejects absent, invalid, expired and future signatures", () => {
    for (const headers of [new Headers(), signed(now / 1000, "wrong"), signed(now / 1000 - 91), signed(now / 1000 + 91), new Headers({ authorization: `Bearer ${secret}` })]) expect(validDispatchRequest(headers, secret, now)).toBe(false);
    expect(validDispatchRequest(signed(now / 1000), undefined, now)).toBe(false);
  });
});
