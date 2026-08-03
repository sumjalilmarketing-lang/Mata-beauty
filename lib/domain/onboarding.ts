export type ProfessionalOnboardingInput = Readonly<{
  businessName: string;
  bio: string;
  city: string;
  address: string;
  languages: readonly string[];
  cancellationPolicy: string;
}>;

export function calculateProfessionalOnboardingProgress(input: ProfessionalOnboardingInput) {
  let progress = input.businessName.trim().length >= 2 ? 25 : 10;
  if (input.bio.trim().length >= 40) progress += 25;
  if (input.city.trim().length >= 2 && input.address.trim().length >= 4) progress += 25;
  if (input.languages.length > 0 && input.cancellationPolicy.trim().length >= 20) progress += 25;
  return Math.min(progress, 100);
}

export function canSubmitProfessionalOnboarding(input: ProfessionalOnboardingInput) {
  return calculateProfessionalOnboardingProgress(input) === 100;
}
