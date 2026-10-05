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
