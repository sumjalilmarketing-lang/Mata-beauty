export type FeedSignals = Readonly<{
  id: string;
  authorId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  saveCount: number;
  commentCount: number;
  shareCount?: number;
  bookingClicks?: number;
  bookings?: number;
  specialtyAffinity?: number;
  proximityScore?: number;
  availableSoon?: boolean;
  followed?: boolean;
}>;

export const socialFeedFilters = ["Pour toi", "Près de moi", "Tendances", "Make-up", "Barbier", "Tresses", "Perruques", "Ongles", "Coiffure", "Soins"] as const;
export type SocialFeedFilter = (typeof socialFeedFilters)[number];

export function matchesSocialFeedFilter(filter: SocialFeedFilter, post: { city: string; serviceTitle: string | null; hashtags: string[] }, nearbyCity = "") {
  if (filter === "Pour toi" || filter === "Tendances") return true;
  if (filter === "Près de moi") return Boolean(nearbyCity.trim()) && post.city.toLocaleLowerCase("fr").includes(nearbyCity.toLocaleLowerCase("fr"));
  const haystack = `${post.serviceTitle ?? ""} ${post.hashtags.join(" ")}`.toLocaleLowerCase("fr");
  const aliases: Record<Exclude<SocialFeedFilter, "Pour toi" | "Tendances" | "Près de moi">, string[]> = {
    Tresses: ["tresse", "braid", "knotless"], "Make-up": ["make-up", "makeup", "maquillage"], Barbier: ["barbier", "barber"],
    Ongles: ["ongle", "nail", "manucure"], Perruques: ["perruque", "wig", "lace"], Coiffure: ["coiffure", "cheveu", "hair"], Soins: ["soin", "spa", "visage", "massage"],
  };
  return aliases[filter].some((term) => haystack.includes(term));
}

export function socialFeedScore(post: FeedSignals, now = Date.now()) {
  const ageHours = Math.max(0, (now - new Date(post.publishedAt).getTime()) / 3_600_000);
  const engagement = post.likeCount * 2 + post.saveCount * 3 + post.commentCount * 2 + (post.shareCount ?? 0) * 2.5;
  const quality = engagement / Math.max(20, post.viewCount);
  const conversion = (post.bookings ?? 0) * 9 + Math.min(12, (post.bookingClicks ?? 0) * 1.5);
  const personal = (post.specialtyAffinity ?? 0) * 8 + (post.proximityScore ?? 0) * 6 + (post.followed ? 10 : 0);
  const availability = post.availableSoon ? 8 : 0;
  return Math.max(0, 72 - ageHours) + Math.log1p(engagement) * 8 + quality * 20 + conversion + personal + availability;
}

export function diversifyFeed<T extends FeedSignals>(posts: readonly T[], now = Date.now()) {
  const remaining = [...posts].sort((a, b) => socialFeedScore(b, now) - socialFeedScore(a, now));
  const result: T[] = [];
  while (remaining.length) {
    const previous = result.at(-1)?.authorId;
    const index = remaining.findIndex((post) => post.authorId !== previous);
    result.push(remaining.splice(index < 0 ? 0 : index, 1)[0]);
  }
  return result;
}

export const discoveryTopics = {
  tresses: ["tresse", "braid", "knotless"],
  barbier: ["barbier", "barber", "barbe", "coupe homme"],
  coiffure: ["coiffure", "cheveu", "hair", "locks"],
  perruques: ["perruque", "wig", "lace"],
  maquillage: ["maquillage", "makeup", "make-up"],
  ongles: ["ongle", "nail", "manucure", "pedicure"],
  spa: ["spa", "hammam", "sauna"],
  massage: ["massage", "massages", "relaxation"],
  soins: ["soin", "soins", "visage", "facial"],
} as const;
export type DiscoveryTopic = keyof typeof discoveryTopics;

/** Content interests only: no gender, identity or inferred sensitive attributes. */
export function videoTopics(text: string): DiscoveryTopic[] {
  const words = new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []);
  const normalized = [...words].join(" ");
  return (Object.keys(discoveryTopics) as DiscoveryTopic[]).filter(topic => discoveryTopics[topic].some(term => term.includes(" ") ? normalized.includes(term) : words.has(term) || words.has(`${term}s`)));
}

export function videoInterestAffinity(text: string, interests: ReadonlySet<DiscoveryTopic>): number {
  return videoTopics(text).some(topic => interests.has(topic)) ? 1 : 0;
}

/** Reserve one slot in five for a recent, low-exposure creator when available. */
export function discoverFeed<T extends FeedSignals>(posts: readonly T[], now = Date.now()): T[] {
  const remaining = diversifyFeed(posts, now);
  const result: T[] = [];
  while (remaining.length) {
    const previous = result.at(-1)?.authorId;
    const discoverySlot = result.length % 5 === 2;
    let index = discoverySlot ? remaining.findIndex(post => post.authorId !== previous && post.viewCount < 100 && now - Date.parse(post.publishedAt) <= 72 * 3_600_000) : -1;
    if (index < 0) index = remaining.findIndex(post => post.authorId !== previous);
    result.push(remaining.splice(index < 0 ? 0 : index, 1)[0]);
  }
  return result;
}
