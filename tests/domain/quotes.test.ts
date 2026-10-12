import { describe, expect, it } from "vitest";
import { conversationQuoteSchema, quoteBookingResultSchema, quoteCanBeBooked, quoteDuration } from "../../lib/domain/quotes";

const quote = {
  id: "d5c9cf4a-3185-4b29-91a2-d755cbf36df2", conversation_id: "bed9c152-6b55-498c-9d91-485670b4a372",
  provider_id: "9ca6c328-d367-42ec-9c9b-43d5fb3ca9c2", client_id: "cb09c0df-99c3-4bfb-8977-daf2288929e9",
  provider_service_id: "f7c92364-6c52-466d-a00a-01e5357b611b", service_title: "Tresses", description: "Tresses personnalisées",
  conditions: "", base_amount: 12000, options_amount: 1500, total_amount: 13500, currency: "XOF",
  base_duration_minutes: 75, duration_minutes: 90, valid_until: "2026-10-15T18:00:00+00:00",
  status: "accepted", version: 3, location_modes: ["salon"], fixed_travel_fee_amount: 0, booking_id: null,
};
describe("Contrat de devis reçu du serveur", () => {
  it("accepte une durée et un montant final différents du catalogue", () => {
    const actual = conversationQuoteSchema.parse(quote);
    expect(actual.total_amount).toBe(13500); expect(actual.duration_minutes).toBe(90);
  });
  it("refuse une devise de marché non ouvert et un montant fractionnaire", () => {
    expect(conversationQuoteSchema.safeParse({ ...quote, currency: "EUR" }).success).toBe(false);
    expect(conversationQuoteSchema.safeParse({ ...quote, total_amount: 13500.5 }).success).toBe(false);
  });
  it("n'autorise ni expiré, ni déjà réservé, ni simplement envoyé", () => {
    const actual = conversationQuoteSchema.parse(quote), before = Date.parse("2026-10-14T00:00:00Z");
    expect(quoteCanBeBooked(actual, before)).toBe(true);
    expect(quoteCanBeBooked(actual, Date.parse(actual.valid_until))).toBe(false);
    expect(quoteCanBeBooked({ ...actual, status: "sent" }, before)).toBe(false);
    expect(quoteCanBeBooked({ ...actual, booking_id: quote.id }, before)).toBe(false);
  });
  it("calcule la durée du rendez-vous persistant sans reprendre le catalogue", () => {
    expect(quoteDuration({ starts_at: "2026-10-16T10:00:00Z", ends_at: "2026-10-16T11:30:00Z" })).toBe(90);
  });
  it("n'accepte jamais une réussite financière annoncée par une conversion de devis", () => {
    const booking = { id: "4a4a7c09-128f-443c-9fc5-558b8790b1d9", client_id: quote.client_id, provider_id: quote.provider_id,
      conversation_quote_id: quote.id, starts_at: "2026-10-16T10:00:00Z", ends_at: "2026-10-16T11:30:00Z",
      status: "pending", total_amount: 13500, currency: "XOF", location_mode: "salon", appointment_address: "Adresse QA",
      collaborator_id: null };
    expect(quoteBookingResultSchema.safeParse({ quote, booking, payment_status: "not_initiated" }).success).toBe(true);
    expect(quoteBookingResultSchema.safeParse({ quote, booking, payment_status: "paid" }).success).toBe(false);
  });
});

