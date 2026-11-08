/** Log only fixed stage labels: never Storage URLs, tokens, filenames or user data. */
export function logStudioFailure(operation: "prepare-video" | "validate-video", error: unknown) {
  const stages = new Set(["Profile unavailable", "Provider unavailable", "Source unavailable", "Source inaccessible", "Unexpected storage host", "Output upload unavailable", "Preview unavailable", "Snapshot unavailable", "Download unavailable", "Attestation unavailable"]);
  const stage = error instanceof Error && stages.has(error.message) ? error.message : "unexpected_failure";
  console.error(JSON.stringify({ event: "studio_failure", operation, stage, code: "STUDIO_SERVICE_UNAVAILABLE" }));
}
