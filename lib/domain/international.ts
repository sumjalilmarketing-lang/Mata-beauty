/** Markets whose billing currencies are represented by the current app model. */
export const SUPPORTED_COUNTRIES = [
  { code: "SN", name: "Sénégal" }, { code: "CI", name: "Côte d’Ivoire" },
  { code: "ML", name: "Mali" }, { code: "BF", name: "Burkina Faso" },
  { code: "BJ", name: "Bénin" }, { code: "TG", name: "Togo" },
  { code: "NE", name: "Niger" }, { code: "FR", name: "France" },
  { code: "BE", name: "Belgique" }, { code: "ES", name: "Espagne" },
  { code: "DE", name: "Allemagne" }, { code: "IT", name: "Italie" },
  { code: "NL", name: "Pays-Bas" }, { code: "PT", name: "Portugal" },
  { code: "IE", name: "Irlande" }, { code: "LU", name: "Luxembourg" },
  { code: "US", name: "États-Unis" }, { code: "GB", name: "Royaume-Uni" },
  { code: "CA", name: "Canada" },
] as const;

export const SUPPORTED_LANGUAGES = [
  { code: "fr", label: "Français" }, { code: "en", label: "English" },
  { code: "es", label: "Español" },
] as const;

export const SUPPORTED_CURRENCIES = ["XOF", "EUR", "USD", "GBP", "CAD"] as const;

/** Explicit IANA choices; large countries require the user to choose their local zone. */
export const SUPPORTED_TIME_ZONES = [
  "Africa/Dakar", "Africa/Abidjan", "Africa/Bamako", "Africa/Ouagadougou",
  "Africa/Porto-Novo", "Africa/Lome", "Africa/Niamey",
  "Europe/Paris", "Europe/Brussels", "Europe/Madrid", "Europe/Berlin",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Lisbon", "Europe/Dublin",
  "Europe/Luxembourg", "Europe/London",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Vancouver",
] as const;
