import { describe, expect, it } from "vitest";
import { calculateProfessionalOnboardingProgress, canSubmitProfessionalOnboarding, countReceivedProfessionalDocuments } from "../../lib/domain/onboarding";

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

  it("requires four distinct required document types", () => {
    expect(countReceivedProfessionalDocuments([])).toBe(0);
    expect(countReceivedProfessionalDocuments(Array.from({ length: 4 }, () => ({ kind: "identity", status: "approved" })))).toBe(1);
    expect(countReceivedProfessionalDocuments([{ kind: "other", status: "approved" }])).toBe(0);
  });
  it("counts documents awaiting review without claiming they are approved", () => {
    const documents = ["identity", "business_registration", "qualification", "address_proof"].map(kind => ({ kind, status: "pending" }));
    expect(countReceivedProfessionalDocuments(documents)).toBe(4);
  });
  it("requires replacement of a rejected latest version", () => {
    const documents = [{ kind: "identity", status: "rejected" }, { kind: "identity", status: "approved" }, { kind: "qualification", status: "pending" }];
    expect(countReceivedProfessionalDocuments(documents)).toBe(1);
    expect(countReceivedProfessionalDocuments([{ kind: "identity", status: "unknown" }])).toBe(0);
  });
});
