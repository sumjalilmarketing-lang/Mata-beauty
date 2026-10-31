import { describe, expect, it } from "vitest";
import { assertIsolatedAcceptanceTargets, ISOLATED_SUPABASE_URL, ISOLATED_PREVIEW_URL } from "../../scripts/isolated-acceptance-targets.mjs";

describe("destructive acceptance target isolation", () => {
  it("accepts only the dedicated international test pair", () => {
    expect(() => assertIsolatedAcceptanceTargets({ url: ISOLATED_SUPABASE_URL, previewUrl: ISOLATED_PREVIEW_URL + "/" })).not.toThrow();
  });
  it.each([
    undefined, "https://qjdwxdbvrxedyfolnpol.supabase.co", "https://kazlvtxkbsdhbfvtqqdp.supabase.co",
    ISOLATED_SUPABASE_URL + ".evil.test", ISOLATED_SUPABASE_URL + "/rest/v1", ISOLATED_SUPABASE_URL + "?project=other",
  ])("rejects another or unspecified database before any client is made: %s", (url) => {
    expect(() => assertIsolatedAcceptanceTargets({ url, previewUrl: ISOLATED_PREVIEW_URL })).toThrow(/base internationale isolée/);
  });
  it.each([undefined, "https://mata-beauty.com", "https://mata-beauty.vercel.app", "https://mata-beauty-l18cdvvn6-africrm.vercel.app", ISOLATED_PREVIEW_URL + "?redirect=production"])("rejects an unspecified or unverified deployment: %s", (previewUrl) => {
    expect(() => assertIsolatedAcceptanceTargets({ url: ISOLATED_SUPABASE_URL, previewUrl })).toThrow(/alias Preview/);
  });
});
