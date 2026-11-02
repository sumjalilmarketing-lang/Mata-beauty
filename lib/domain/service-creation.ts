export type ServiceDetails = { serviceId: string; title: string; durationMinutes: number; priceAmount: number };
export function serviceDetailsError(value: ServiceDetails): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.serviceId)) return "Choisissez une catégorie de prestation.";
  if (value.title.trim().length < 2 || value.title.trim().length > 120) return "Choisissez un nom de prestation de 2 à 120 caractères.";
  if (!Number.isInteger(value.durationMinutes) || value.durationMinutes < 15 || value.durationMinutes > 720) return "Choisissez une durée entière entre 15 et 720 minutes.";
  if (!Number.isInteger(value.priceAmount) || value.priceAmount < 0 || value.priceAmount > 10_000_000) return "Entrez un prix entier entre 0 et 10 000 000 dans la devise affichée.";
  return null;
}
export type ActivityLocation = { country_code: string | null; timezone: string | null; currency: string | null; region?: string | null };
export function activityLocationReady(value: ActivityLocation | null): boolean {
  return Boolean(value?.country_code?.trim() && value.timezone?.trim() && value.currency?.trim());
}
