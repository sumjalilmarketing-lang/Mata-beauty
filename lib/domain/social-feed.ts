export type FeedSignals = Readonly<{
  id: string;
  authorId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  saveCount: number;
  commentCount: number;
}>;

export function socialFeedScore(post: FeedSignals, now = Date.now()) {
  const ageHours = Math.max(0, (now - new Date(post.publishedAt).getTime()) / 3_600_000);
  const engagement = post.likeCount * 2 + post.saveCount * 3 + post.commentCount * 2;
  const quality = engagement / Math.max(20, post.viewCount);
  return Math.max(0, 72 - ageHours) + Math.log1p(engagement) * 8 + quality * 20;
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
