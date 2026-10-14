import { describe, expect, it } from "vitest";
import { classifyRpcReadiness } from "../../lib/messaging/rpc-readiness";

describe("messaging RPC readiness", () => {
  it("distinguishes missing migrations from access denial and transient errors", () => {
    expect(classifyRpcReadiness("PGRST202")).toBe("missing");
    expect(classifyRpcReadiness("42883")).toBe("missing");
    expect(classifyRpcReadiness("42501")).toBe("denied");
    expect(classifyRpcReadiness("08006")).toBe("error");
    expect(classifyRpcReadiness(undefined)).toBe("error");
  });
});
