const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicPostVideoMedia = {
  videoUrl: string;
  thumbnailUrl: string | null;
};

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Requests a fresh, server-signed URL for one already-public video post. */
export async function fetchPublicPostVideoMedia(
  postId: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicPostVideoMedia | null> {
  if (!UUID_PATTERN.test(postId)) return null;

  try {
    const response = await fetcher(`/api/public/social-posts/${encodeURIComponent(postId)}/media`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return null;
    const media = payload as { videoUrl?: unknown; thumbnailUrl?: unknown };
    if (!isHttpsUrl(media.videoUrl)) return null;
    if (media.thumbnailUrl !== null && media.thumbnailUrl !== undefined && !isHttpsUrl(media.thumbnailUrl)) return null;

    return {
      videoUrl: media.videoUrl,
      thumbnailUrl: typeof media.thumbnailUrl === "string" ? media.thumbnailUrl : null,
    };
  } catch {
    return null;
  }
}
