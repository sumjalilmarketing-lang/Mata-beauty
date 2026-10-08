export function publicProfessionalName(name: string | null | undefined) {
  const value = name?.trim();
  return value && !/^(?:@?(?:provider|profile|user)[-_]|[0-9a-f]{8}-[0-9a-f-]{27,}$)/i.test(value)
    ? value : "Professionnel beauté";
}

export function feedPrice(amount: number | null, currency: string | null, locale = "fr") {
  if (amount === null || !Number.isFinite(amount) || amount < 0 || !currency || !/^[A-Z]{3}$/.test(currency)) return null;
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code" }).format(amount); }
  catch { return null; }
}
