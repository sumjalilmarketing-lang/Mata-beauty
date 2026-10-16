export type SocialProfileMediaItem = {
  media_type: string;
  bucket_id: string;
  storage_path: string;
  thumbnail_path: string | null;
};

type StorageObject = { bucket: string; path: string };

export type ResolvedSocialProfileVideo = {
  videoBucket: string | null;
  videoPath: string | null;
  thumbnailBucket: string | null;
  thumbnailPath: string | null;
};

function storageObjectFromUrl(value: string | null | undefined): StorageObject | null {
  if (!value) return null;
  try {
    const pathname = new URL(value).pathname;
    const marker = "/storage/v1/object/";
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const segments = pathname.slice(markerIndex + marker.length).split("/");
    if (segments.length < 3 || !["public", "sign", "authenticated"].includes(segments[0] ?? "")) return null;
    const bucket = decodeURIComponent(segments[1] ?? "");
    const path = decodeURIComponent(segments.slice(2).join("/"));
    return bucket && path ? { bucket, path } : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a video's cover from the media row attached to this exact post.
 * Prefer the storage object named by video_url; only use the post's attached
 * video row as a fallback when it is unambiguous. This prevents a reordered
 * or mixed media_items array from pairing a video with another asset's cover.
 */
export function resolveSocialProfileVideoMedia(input: {
  videoUrl: string | null;
  thumbnailUrl: string | null;
  mediaItems: SocialProfileMediaItem[] | null;
}): ResolvedSocialProfileVideo {
  const videos = (input.mediaItems ?? []).filter(item => item.media_type === "video");
  const urlVideo = storageObjectFromUrl(input.videoUrl);
  const matchedVideo = urlVideo
    ? videos.find(item => item.bucket_id === urlVideo.bucket && item.storage_path === urlVideo.path)
    : undefined;
  const video = matchedVideo ?? (!urlVideo && videos.length === 1 ? videos[0] : undefined);
  const directThumbnail = storageObjectFromUrl(input.thumbnailUrl);

  if (video) {
    const attachedThumbnail = video.thumbnail_path;
    const matchingDirectThumbnail = directThumbnail && directThumbnail.bucket === video.bucket_id
      && (!attachedThumbnail || directThumbnail.path === attachedThumbnail)
      ? directThumbnail
      : null;
    return {
      videoBucket: video.bucket_id,
      videoPath: video.storage_path,
      thumbnailBucket: attachedThumbnail ? video.bucket_id : matchingDirectThumbnail?.bucket ?? null,
      thumbnailPath: attachedThumbnail ?? matchingDirectThumbnail?.path ?? null,
    };
  }

  // Legacy posts without social_post_media are still supported, but only as
  // the media URLs stored directly on that same post record.
  return {
    videoBucket: urlVideo?.bucket ?? null,
    videoPath: urlVideo?.path ?? null,
    thumbnailBucket: directThumbnail?.bucket ?? null,
    thumbnailPath: directThumbnail?.path ?? null,
  };
}

