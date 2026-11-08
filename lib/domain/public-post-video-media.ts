const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicPostVideoMedia = {
  videoUrl: string;
  thumbnailUrl: string | null;
};

export type PublicPostVideoResult =
  | { status: "ready"; media: PublicPostVideoMedia }
  | { status: "not_found" }
  | { status: "unavailable" };

export type PrivateVideoFeedRow = {
  post_type?: string;
  video_url: string;
  thumbnail_url: string | null;
  media_urls?: string[];
  media_items?: readonly { media_type: string; bucket_id: string }[];
};

/** Private storage is also used for photos; a bucket URL is not a video type. */
export function postUsesVideoMedia(postType: string | undefined, mediaTypes: readonly string[]): boolean {
  return postType === "video" || mediaTypes.includes("video") || (!postType && mediaTypes.length === 0);
}

/** Keep private Storage URLs out of the initial feed payload and sign them only when the card becomes active. */
export function deferPrivateVideoUntilActive<T extends PrivateVideoFeedRow>(row: T): T {
  const privateItems = (row.media_items ?? []).filter((item) => ["provider-social-media", "social-videos", "social-thumbnails"].includes(item.bucket_id));
  if (!postUsesVideoMedia(row.post_type, privateItems.map((item) => item.media_type))) return row;
  return { ...row, video_url: "", thumbnail_url: null, media_urls: [] };
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Requests a fresh, server-signed URL for one already-public video post. */
export async function fetchPublicPostVideoResult(
  postId: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicPostVideoResult> {
  if (!UUID_PATTERN.test(postId)) return { status: "not_found" };

  try {
    const response = await fetcher(`/api/public/social-posts/${encodeURIComponent(postId)}/media`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return { status: "not_found" };
    if (!response.ok) return { status: "unavailable" };

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return { status: "unavailable" };
    const media = payload as { videoUrl?: unknown; thumbnailUrl?: unknown };
    if (!isHttpsUrl(media.videoUrl)) return { status: "unavailable" };
    if (media.thumbnailUrl !== null && media.thumbnailUrl !== undefined && !isHttpsUrl(media.thumbnailUrl)) return { status: "unavailable" };

    return {
      status: "ready",
      media: {
        videoUrl: media.videoUrl,
        thumbnailUrl: typeof media.thumbnailUrl === "string" ? media.thumbnailUrl : null,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function fetchPublicPostVideoMedia(postId: string, fetcher: typeof fetch = fetch): Promise<PublicPostVideoMedia | null> {
  const result = await fetchPublicPostVideoResult(postId, fetcher);
  return result.status === "ready" ? result.media : null;
}
