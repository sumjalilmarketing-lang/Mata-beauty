import { describe, expect, it } from "vitest";
import { diversifyFeed, matchesSocialFeedFilter, socialFeedScore, type FeedSignals } from "../../lib/domain/social-feed";

const now = new Date("2026-08-04T12:00:00Z").getTime();
const post = (id: string, authorId: string, hours: number, likes = 0): FeedSignals => ({
  id, authorId, publishedAt: new Date(now-hours*3_600_000).toISOString(), viewCount: 100,
  likeCount: likes, saveCount: 0, commentCount: 0,
});

describe("transparent social feed ranking", () => {
  it("favours recent engaged content", () => {
    expect(socialFeedScore(post("new", "a", 1, 20), now)).toBeGreaterThan(socialFeedScore(post("old", "b", 80, 0), now));
  });

  it("avoids consecutive creators when alternatives exist", () => {
    const ranked = diversifyFeed([post("a1", "a", 1, 30), post("a2", "a", 2, 25), post("b1", "b", 3, 1)], now);
    expect(ranked.map((item) => item.authorId)).toEqual(["a", "b", "a"]);
  });

  it("uses booking, proximity and availability signals without hiding fresh content", () => {
    const relevant = { ...post("relevant", "a", 8, 5), bookings: 2, proximityScore: 1, specialtyAffinity: 1, availableSoon: true };
    expect(socialFeedScore(relevant, now)).toBeGreaterThan(socialFeedScore(post("plain", "b", 8, 5), now));
  });

  it("filters categories and nearby providers from service data", () => {
    const item = { city: "Dakar — Almadies", serviceTitle: "Pose Lace Wig HD", hashtags: ["perruques", "dakar"] };
    expect(matchesSocialFeedFilter("Perruques", item)).toBe(true);
    expect(matchesSocialFeedFilter("Près de moi", item, "Dakar")).toBe(true);
    expect(matchesSocialFeedFilter("Ongles", item)).toBe(false);
  });
});
