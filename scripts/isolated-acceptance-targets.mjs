import assert from "node:assert/strict";

export const ISOLATED_SUPABASE_URL = "https://skrrfronlhoddtgxvezu.supabase.co";
export const ISOLATED_PREVIEW_URL = "https://mata-beauty-git-codex-global-test-preview-20261031-africrm.vercel.app";

/** @param {{ url?: string, previewUrl?: string }} targets */
export function assertIsolatedAcceptanceTargets({ url, previewUrl }) {
  // Exact origins only: no alternate project, custom domain, userinfo, path,
  // query string or caller-controlled host suffix can redirect this test suite.
  assert.equal(url?.replace(/\/$/, ""), ISOLATED_SUPABASE_URL, "Recette refusée : base internationale isolée requise");
  assert.equal(previewUrl?.replace(/\/$/, ""), ISOLATED_PREVIEW_URL, "Recette refusée : alias Preview international isolé requis");
}
