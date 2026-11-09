import { z } from "zod";
import { bookingAvailabilitySchema } from "./booking-availability";

export const bookableServiceSchema = z.object({
  id: z.uuid(), title: z.string().min(1), duration_minutes: z.number().int().min(15).max(720),
  price_amount: z.number().int().nonnegative(), currency: z.enum(["XOF", "EUR", "USD", "GBP", "CAD"]),
  business_id: z.uuid().nullable().optional(), deposit_percentage: z.number().min(0).max(60).optional(),
});
export type BookableService = z.infer<typeof bookableServiceSchema>;

export const multiServiceAvailabilitySchema = bookingAvailabilitySchema.and(z.object({
  totalAmount: z.number().int().nonnegative(), durationMinutes: z.number().int().min(15).max(720),
  currency: bookableServiceSchema.shape.currency, services: z.array(bookableServiceSchema).min(1).max(8),
}));

export const multiServiceConfirmationSchema = z.object({
  id: z.uuid(), starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }),
  total_amount: z.number().int().nonnegative(), currency: bookableServiceSchema.shape.currency,
  collaborator_name: z.string().nullable(), collaborator_avatar_url: z.string().nullable(),
  services: z.array(bookableServiceSchema).min(1).max(8),
});

/** Display preview only: the booking RPC recalculates all amounts independently. */
export function previewServiceSelection(services: readonly BookableService[]) {
  if (!services.length || services.length > 8 || new Set(services.map(service => service.id)).size !== services.length) throw new Error("Sélection de soins invalide.");
  const first = services[0];
  if (services.some(service => service.currency !== first.currency || (service.business_id ?? null) !== (first.business_id ?? null))) throw new Error("Choisissez des soins du même établissement et dans la même devise.");
  const durationMinutes = services.reduce((sum, service) => sum + service.duration_minutes, 0);
  const totalAmount = services.reduce((sum, service) => sum + service.price_amount, 0);
  if (durationMinutes > 720 || !Number.isSafeInteger(totalAmount)) throw new Error("Cette sélection dépasse la durée ou le montant autorisé.");
  return { title: services.map(service => service.title).join(" + "), durationMinutes, totalAmount, currency: first.currency };
}
