import type { Coordinates } from "./location";
import { validSearchRadius } from "./inspiration-search";

const knownRegions = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/** Reject unknown regions before passing URL or catalogue data to Intl. */
export function inspirationCountryCode(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "ZZ") return "";
  try {
    return knownRegions.of(code) ? code : "";
  } catch { return ""; }
}

export function inspirationCountryLabel(value: string, locale: string): string {
  const code = inspirationCountryCode(value);
  if (!code) return "";
  try { return new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(code) ?? code; }
  catch { return code; }
}

function historyPosition(state: unknown): Coordinates | null {
  if (!state || typeof state !== "object" || !("mataInspirationPosition" in state)) return null;
  const position = state.mataInspirationPosition;
  if (!position || typeof position !== "object" || !("latitude" in position) || !("longitude" in position)) return null;
  const { latitude, longitude } = position;
  return typeof latitude === "number" && typeof longitude === "number"
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

/** Parse both the initial URL and every Back/Forward entry using the same rules. */
export function readInspirationSearchUrl(search: string, state: unknown) {
  const params = new URLSearchParams(search);
  return {
    query: (params.get("q") ?? "").slice(0, 120),
    categoryId: (params.get("categoryId") ?? "").slice(0, 128),
    legacyCategory: (params.get("category") ?? "").slice(0, 100),
    countryCode: inspirationCountryCode(params.get("country")),
    providerId: (params.get("providerId") ?? "").slice(0, 128),
    radiusKm: validSearchRadius(Number(params.get("radius"))),
    position: historyPosition(state),
    zone: (params.get("zone") ?? "").slice(0, 120),
    open: params.get("search") === "1" && params.get("applied") !== "1",
  };
}

/** Keep framework-owned history keys; personal coordinates never enter the URL. */
export function inspirationSearchHistoryState(state: unknown, position: Coordinates | null): Record<string, unknown> {
  const next: Record<string, unknown> = state && typeof state === "object" && !Array.isArray(state) ? { ...state } : {};
  if (position) next.mataInspirationPosition = { ...position };
  else delete next.mataInspirationPosition;
  return next;
}
