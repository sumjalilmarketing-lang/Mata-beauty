import { describe, expect, it } from "vitest";
import { calculateProfessionalOnboardingProgress, canSubmitProfessionalOnboarding } from "../../lib/domain/onboarding";

const complete = {
  businessName: "Mata Studio",
  bio: "Une présentation professionnelle suffisamment détaillée pour la validation.",
  city: "Dakar",
  address: "12 rue des Almadies",
  languages: ["fr", "wo"],
  cancellationPolicy: "Annulation sans frais plus de vingt-quatre heures avant.",
} as const;

describe("professional onboarding", () => {
  it("reaches 100 only when every required group is complete", () => {
    expect(calculateProfessionalOnboardingProgress(complete)).toBe(100);
    expect(canSubmitProfessionalOnboarding(complete)).toBe(true);
  });

  it("keeps an incomplete draft below submission threshold", () => {
    const draft = { ...complete, address: "", cancellationPolicy: "" };
    expect(calculateProfessionalOnboardingProgress(draft)).toBe(50);
    expect(canSubmitProfessionalOnboarding(draft)).toBe(false);
  });
});
