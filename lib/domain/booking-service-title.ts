import { z } from "zod";

const snapshotSchema = z.array(z.object({ title: z.string().trim().min(1).max(500) })).min(1).max(8);

/** Prefer the immutable appointment contract over today's editable catalogue. */
export function bookingServiceTitle(snapshot: unknown, fallback = "Prestation beauté"): string {
  const parsed = snapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data.map(service => service.title).join(" + ") : fallback;
}
