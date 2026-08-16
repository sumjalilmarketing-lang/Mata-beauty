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

export function matchesSocialFeedFilter(filter: SocialFeedFilter, post: { city: string; serviceTitle: string | null; hashtags: string[] }, nearbyCity = "Dakar") {
  if (filter === "Pour toi" || filter === "Tendances") return true;
  if (filter === "Près de moi") return post.city.toLocaleLowerCase("fr").includes(nearbyCity.toLocaleLowerCase("fr"));
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
