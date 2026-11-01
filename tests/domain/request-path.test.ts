import { describe, expect, it } from "vitest";
import { isMalformedRequestPath } from "@/lib/domain/request-path";

describe("request path rejection", () => {
  it.each(["/%5C%5C%5C", "/\\", "/%255c", "/%00", "/%0a", "/%7f", "/%ZZ"])("rejects %s", path => {
    expect(isMalformedRequestPath(path)).toBe(true);
  });
  it.each(["/", "/auth/confirm", "/service/123", "/legal/confidentialite", "/salons/%C3%A9l%C3%A9gance", "/100%25"])("preserves %s", path => {
    expect(isMalformedRequestPath(path)).toBe(false);
  });
});
