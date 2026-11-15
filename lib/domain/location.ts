export type Coordinates = { latitude: number; longitude: number };

export function normalizedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesSearch(query: string, text: string) {
  const vocabulary: Record<string, string> = {
    barber: "barbier", barbers: "barbier", barbiers: "barbier",
    coiffeur: "coiffure", coiffeurs: "coiffure", coiffeuse: "coiffure", coiffeuses: "coiffure",
    onglerie: "ongles", tresse: "tresses", hommes: "homme", femmes: "femme",
  };
  const words = (value: string) => normalizedSearch(value).split(" ").map(term => vocabulary[term] ?? term);
  const haystack = words(text).join(" ");
  return words(query).filter((term) => term && !["a", "au", "aux", "de", "des", "du", "en", "pres", "moi"].includes(term)).every((term) => haystack.includes(term));
}

export function distanceKm(origin: Coordinates, destination: Coordinates | null | undefined): number | null {
  if (!destination || ![origin.latitude, origin.longitude, destination.latitude, destination.longitude].every(Number.isFinite)
    || Math.abs(origin.latitude) > 90 || Math.abs(destination.latitude) > 90 || Math.abs(origin.longitude) > 180 || Math.abs(destination.longitude) > 180) return null;
  const radians = Math.PI / 180;
  const latitude = (destination.latitude - origin.latitude) * radians;
  const longitude = (destination.longitude - origin.longitude) * radians;
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(origin.latitude * radians) * Math.cos(destination.latitude * radians) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function formatDistance(kilometres: number) {
  return kilometres < 1 ? `${Math.round(kilometres * 1000 / 50) * 50} m` : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(kilometres)} km`;
}

/** ISO 3166-1 country and territory suggestions, independent from the number of salons on MATA Beauty. */
const isoCountryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const frenchRegionNames = new Intl.DisplayNames(["fr"], { type: "region" });
const allCountrySuggestions = isoCountryCodes
  .map((code) => ({ code, name: frenchRegionNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

/** Free text always remains possible: suggestions are guidance, never a country whitelist for search. */
export function worldwideCountrySuggestions(input: string, limit = 20): string[] {
  const query = normalizedSearch(input);
  const aliases: Record<string, string> = { usa: "US", us: "US", uk: "GB", england: "GB" };
  if (!query) {
    const recommended = ["SN", "FR", "BE", "ES", "US", "CI", "MA", "CA", "GB", "NG"];
    return recommended.map(code => allCountrySuggestions.find(item => item.code === code)!.name);
  }
  const matches = allCountrySuggestions.filter(({ code, name }) =>
    normalizedSearch(name).includes(query) || code.toLowerCase() === query || aliases[query] === code,
  );
  return matches.sort((a, b) => {
    const aPrefix = normalizedSearch(a.name).startsWith(query) || a.code.toLowerCase() === query || aliases[query] === a.code;
    const bPrefix = normalizedSearch(b.name).startsWith(query) || b.code.toLowerCase() === query || aliases[query] === b.code;
    return Number(bPrefix) - Number(aPrefix) || a.name.localeCompare(b.name, "fr");
  }).slice(0, Math.max(0, limit)).map(item => item.name);
}
