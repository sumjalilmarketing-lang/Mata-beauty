import { describe, expect, it } from "vitest";
import { diversifyFeed, socialFeedScore, type FeedSignals } from "../../lib/domain/social-feed";

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
});
