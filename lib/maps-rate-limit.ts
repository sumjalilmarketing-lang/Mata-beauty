import { consumeRateLimit, jsonError } from "@/lib/payments/server";

// Reuse the existing durable database limiter across all server instances.
// Public address searches remain available without creating an account.
export async function limitMapsRequest(request: Request): Promise<Response | null> {
  if (process.env.NODE_ENV === "production" && !(process.env.PAYMENT_SECURITY_PEPPER || process.env.PAYMENT_WEBHOOK_SECRET)) {
    return jsonError("La recherche d’adresse est momentanément indisponible.", 503, "MAPS_LIMIT_UNAVAILABLE");
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    const allowed = await consumeRateLimit({ scope: "maps_ip", key: ip, limit: 60, windowSeconds: 60 });
    if (!allowed) return limited();
    const budget = await consumeRateLimit({ scope: "maps_global", key: "all", limit: 600, windowSeconds: 60 });
    return budget ? null : limited();
  } catch {
    return jsonError("La recherche d’adresse est momentanément indisponible.", 503, "MAPS_LIMIT_UNAVAILABLE");
  }
}

function limited() {
  const response = jsonError("Trop de recherches d’adresse. Réessayez dans une minute.", 429, "MAPS_RATE_LIMITED");
  response.headers.set("Retry-After", "60");
  return response;
}
