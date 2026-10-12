import { z } from "zod";

export const quoteStatuses = ["draft", "sent", "accepted", "declined", "expired", "cancelled"] as const;
export const quoteStatusLabels: Record<(typeof quoteStatuses)[number], string> = {
  draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", declined: "Refusé", expired: "Expiré", cancelled: "Annulé",
};
export const conversationQuoteSchema = z.object({
  id: z.uuid(), conversation_id: z.uuid(), provider_id: z.uuid(), client_id: z.uuid(), provider_service_id: z.uuid(),
  service_title: z.string(), provider_name: z.string().nullable().optional(), description: z.string(), conditions: z.string(),
  base_amount: z.number().int().nonnegative(), options_amount: z.number().int().nonnegative(), total_amount: z.number().int().nonnegative(),
  currency: z.literal("XOF"), base_duration_minutes: z.number().int().min(15).max(720), duration_minutes: z.number().int().min(15).max(720),
  valid_until: z.iso.datetime({ offset: true }), status: z.enum(quoteStatuses), version: z.number().int().positive(),
  location_modes: z.array(z.enum(["salon", "client_address"])), fixed_travel_fee_amount: z.number().int().nonnegative(),
  booking_id: z.uuid().nullable(),
});
export type ConversationQuote = z.infer<typeof conversationQuoteSchema>;
export const quoteSlotSchema = z.object({
  slot_start: z.iso.datetime({ offset: true }), collaborator_id: z.uuid().nullable(), display_name: z.string().nullable(),
});
export const quoteAvailabilitySchema = z.object({
  quote: conversationQuoteSchema, teamEnabled: z.boolean(), slots: z.array(quoteSlotSchema),
});
export const quoteBookingSchema = z.object({
  id: z.uuid().nullable().optional(), client_id: z.uuid(), provider_id: z.uuid(), conversation_quote_id: z.uuid(),
  starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }),
  status: z.string(), total_amount: z.number().int().nonnegative(), currency: z.literal("XOF"),
  location_mode: z.enum(["salon", "client_address"]), appointment_address: z.string().nullable(),
  collaborator_id: z.uuid().nullable(), collaborator_name: z.string().nullable().optional(),
  distance_travel_fee_amount: z.number().int().nonnegative().optional(),
});
export const quoteBookingResultSchema = z.object({
  quote: conversationQuoteSchema, booking: quoteBookingSchema, payment_status: z.literal("not_initiated"),
});
export type QuoteBooking = z.infer<typeof quoteBookingSchema>;
export type QuoteSlot = z.infer<typeof quoteSlotSchema>;

export function quoteCanBeBooked(quote: Pick<ConversationQuote, "status" | "valid_until" | "booking_id">, now: number) {
  return quote.status === "accepted" && !quote.booking_id && Date.parse(quote.valid_until) > now;
}
export function quoteMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: currency === "XOF" ? 0 : 2 }).format(amount);
}
export function quoteDuration(booking: Pick<QuoteBooking, "starts_at" | "ends_at">) {
  return Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000);
}

