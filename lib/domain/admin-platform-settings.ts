export type PlatformSettingKey = "application" | "booking" | "support";

export type ApplicationSettings = {
  name: string;
  locale: string;
  country: string;
  currency: string;
  timezone: string;
};

export type BookingSettings = {
  minimum_notice_minutes: number;
  cancellation_window_hours: number;
};

export type SupportSettings = {
  email: string;
  phone: string;
};

export type PlatformSettingsMap = {
  application: ApplicationSettings;
  booking: BookingSettings;
  support: SupportSettings;
};
export type PlatformSettingValue = PlatformSettingsMap[PlatformSettingKey];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parsePlatformSetting(key: "application", value: unknown): ApplicationSettings | null;
export function parsePlatformSetting(key: "booking", value: unknown): BookingSettings | null;
export function parsePlatformSetting(key: "support", value: unknown): SupportSettings | null;
export function parsePlatformSetting(key: PlatformSettingKey, value: unknown): PlatformSettingValue | null;
export function parsePlatformSetting(key: PlatformSettingKey, value: unknown): PlatformSettingValue | null {
  if (!isRecord(value)) return null;

  if (key === "application") {
    const { name, locale, country, currency, timezone } = value;
    return isString(name) && isString(locale) && isString(country) && isString(currency) && isString(timezone)
      ? { name, locale, country, currency, timezone }
      : null;
  }

  if (key === "booking") {
    const { minimum_notice_minutes, cancellation_window_hours } = value;
    return isFiniteNumber(minimum_notice_minutes) && isFiniteNumber(cancellation_window_hours)
      ? { minimum_notice_minutes, cancellation_window_hours }
      : null;
  }

  const { email, phone } = value;
  return isString(email) && isString(phone) ? { email, phone } : null;
}

export function validatePlatformSetting(key: PlatformSettingKey, value: PlatformSettingValue): string | null {
  if (key === "application") {
    const settings = value as ApplicationSettings;
    if (!settings.name.trim() || settings.name.length > 80) return "Le nom de la plateforme doit contenir de 1 à 80 caractères.";
    if (!(["fr-SN", "en-SN"] as const).includes(settings.locale as "fr-SN" | "en-SN")) return "La langue sélectionnée n’est pas prise en charge.";
    if (settings.country !== "SN" || settings.currency !== "XOF" || settings.timezone !== "Africa/Dakar") return "La région, la devise ou le fuseau horaire sélectionné n’est pas pris en charge actuellement.";
    return null;
  }

  if (key === "booking") {
    const settings = value as BookingSettings;
    if (!Number.isInteger(settings.minimum_notice_minutes) || settings.minimum_notice_minutes < 0 || settings.minimum_notice_minutes > 43200) return "Le préavis doit être un nombre entier de 0 à 43 200 minutes.";
    if (!Number.isInteger(settings.cancellation_window_hours) || settings.cancellation_window_hours < 0 || settings.cancellation_window_hours > 8760) return "Le délai d’annulation doit être un nombre entier de 0 à 8 760 heures.";
    return null;
  }

  const settings = value as SupportSettings;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email.trim())) return "Saisissez une adresse e-mail de support valide.";
  if (settings.phone.length > 40 || (settings.phone.trim() && !/^\+?[0-9() .-]{7,40}$/.test(settings.phone.trim()))) return "Saisissez un numéro de téléphone valide au format international.";
  return null;
}

export function isPlatformSettingKey(value: string): value is PlatformSettingKey {
  return value === "application" || value === "booking" || value === "support";
}
