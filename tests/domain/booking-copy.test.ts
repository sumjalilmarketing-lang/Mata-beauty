import { describe, expect, it } from "vitest";
import { bookingText, applicationLocale } from "@/lib/domain/booking-copy";
import { feedText } from "@/lib/domain/feed-copy";
import { formatWallDate } from "@/lib/domain/time-zone";

describe("international booking copy", () => {
  it("keeps French and resolves regional English and Spanish locales", () => {
    expect(applicationLocale("es-MX")).toBe("es-ES");
    expect(applicationLocale("en-GB")).toBe("en-US");
    expect(applicationLocale("unsupported")).toBe("fr-FR");
    expect(bookingText("Confirmer · ", "fr-SN")).toBe("Confirmer · ");
    expect(bookingText("Confirmer · ", "en-GB")).toBe("Confirm · ");
    expect(bookingText("Confirmer · ", "es-MX")).toBe("Confirmar · ");
  });
  it("translates booking failures and the no-real-money message", () => {
    expect(bookingText("Aucun créneau publié ce jour. Essayez une autre date.", "es")).toBe("No hay horas publicadas para este día. Prueba otra fecha.");
    expect(bookingText("Aucun débit aujourd’hui", "en")).toBe("No charge today");
    expect(bookingText("Paiement de démonstration · aucun argent réel.", "es")).toContain("sin dinero real");
    expect(feedText("Réserver", "es-ES")).toBe("Reservar");
    expect(feedText("Commentaires", "es")).toBe("Comentarios");
  });
  it("formats a calendar day independently from the browser timezone", () => {
    expect(formatWallDate("2026-11-02", "en-US")).toMatch(/Mon.*Nov.*2/);
    expect(formatWallDate("2026-11-02", "es-ES")).toContain("nov");
  });
});
