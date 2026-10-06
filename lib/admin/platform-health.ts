export type DeliveryHealth = { notifications24h: number; pending: number; sent: number; failed: number; needsReview: number };
export type PlatformHealth = { server: boolean | null; bookings24h: number | null; uploads24h: number | null; criticalAlerts: number | null; deliveries: DeliveryHealth | null };
export const unavailableHealth: PlatformHealth = { server: null, bookings24h: null, uploads24h: null, criticalAlerts: null, deliveries: null };

export function measuredCount(result: { count: number | null; error: unknown }): number {
  if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error("Mesure indisponible");
  return result.count;
}

export function measuredDeliveries(value: unknown): DeliveryHealth {
  if (!value || typeof value !== "object") throw new Error("Mesure indisponible");
  const data = value as Record<string, unknown>;
  const count = (key: string) => {
    const value = data[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Mesure indisponible");
    return value;
  };
  return { notifications24h: count("notifications24h"), pending: count("pending"), sent: count("sent"), failed: count("failed"), needsReview: count("needsReview") };
}

/** One unavailable dependency must not erase the measurements from other sources. */
export async function loadPlatformHealth(sources: { [K in keyof PlatformHealth]: () => Promise<NonNullable<PlatformHealth[K]>> }, timeoutMs = 12_000): Promise<PlatformHealth> {
  async function measure<T>(source: () => Promise<T>): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(source), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Délai dépassé")), timeoutMs); })]);
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  const [server, bookings24h, uploads24h, criticalAlerts, deliveries] = await Promise.all([
    measure(sources.server), measure(sources.bookings24h), measure(sources.uploads24h), measure(sources.criticalAlerts), measure(sources.deliveries),
  ]);
  return { server, bookings24h, uploads24h, criticalAlerts, deliveries };
}
