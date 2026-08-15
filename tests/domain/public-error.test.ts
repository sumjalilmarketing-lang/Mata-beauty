import { describe, expect, it } from "vitest";
import { publicErrorMessage } from "../../lib/ui/public-error";

describe("publicErrorMessage", () => {
  it("maps booking conflicts without exposing SQL", () => {
    expect(publicErrorMessage({ code: "23P01", message: "exclusion constraint bookings_no_overlap" })).toBe("Ce créneau vient d’être réservé. Choisissez-en un autre.");
  });

  it("maps RLS failures without exposing policy details", () => {
    const result = publicErrorMessage({ code: "42501", message: "new row violates row-level security policy profiles_update" });
    expect(result).toBe("Vous n’êtes pas autorisé à effectuer cette action.");
    expect(result).not.toMatch(/row-level|policy|profiles/i);
  });

  it("uses a controlled fallback for unknown backend errors", () => {
    expect(publicErrorMessage({ message: "select * from auth.users" }, "Action indisponible.")).toBe("Action indisponible.");
  });
});
