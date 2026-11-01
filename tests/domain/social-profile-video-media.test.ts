import { describe, expect, it } from "vitest";
import { resolveSocialProfileVideoMedia, type SocialProfileMediaItem } from "../../lib/profiles/social-profile-video-media";

const videoPath = "owner/post-a/video.mp4";
const coverPath = "owner/post-a/thumbnail.jpg";
const media: SocialProfileMediaItem = {
  media_type: "video",
  bucket_id: "provider-social-media",
  storage_path: videoPath,
  thumbnail_path: coverPath,
};

describe("resolveSocialProfileVideoMedia", () => {
  it("associe la miniature au média vidéo du même post, même si les images arrivent avant", () => {
    const result = resolveSocialProfileVideoMedia({
      videoUrl: `https://storage.example/storage/v1/object/sign/provider-social-media/${videoPath}?token=video`,
      thumbnailUrl: `https://storage.example/storage/v1/object/sign/provider-social-media/${coverPath}?token=cover`,
      mediaItems: [
        { media_type: "image", bucket_id: "provider-social-media", storage_path: "owner/other-post/photo.jpg", thumbnail_path: null },
        media,
      ],
    });

    expect(result).toEqual({
      videoBucket: "provider-social-media",
      videoPath,
      thumbnailBucket: "provider-social-media",
      thumbnailPath: coverPath,
    });
  });

  it("ne couple pas une vidéo d'un autre post avec le chemin vidéo de l'URL", () => {
    const result = resolveSocialProfileVideoMedia({
      videoUrl: "https://storage.example/storage/v1/object/sign/provider-social-media/owner/post-a/video.mp4?token=video",
      thumbnailUrl: "https://storage.example/storage/v1/object/sign/provider-social-media/owner/post-a/thumbnail.jpg?token=cover",
      mediaItems: [{ ...media, storage_path: "owner/post-b/video.mp4", thumbnail_path: "owner/post-b/thumbnail.jpg" }],
    });

    expect(result).toEqual({
      videoBucket: "provider-social-media",
      videoPath,
      thumbnailBucket: "provider-social-media",
      thumbnailPath: coverPath,
    });
  });

  it("refuse de choisir arbitrairement parmi plusieurs médias si leur vidéo ne correspond pas à l'URL", () => {
    const result = resolveSocialProfileVideoMedia({
      videoUrl: "https://cdn.example/videos/post-a.mp4",
      thumbnailUrl: "https://cdn.example/covers/post-a.jpg",
      mediaItems: [media, { ...media, storage_path: "owner/post-b/video.mp4", thumbnail_path: "owner/post-b/thumbnail.jpg" }],
    });

    expect(result).toEqual({ videoBucket: null, videoPath: null, thumbnailBucket: null, thumbnailPath: null });
  });

  it("garde la compatibilité des publications historiques sans lignes de média", () => {
    const result = resolveSocialProfileVideoMedia({
      videoUrl: "https://storage.example/storage/v1/object/public/provider-social-media/owner/legacy/video.mp4",
      thumbnailUrl: "https://storage.example/storage/v1/object/public/provider-social-media/owner/legacy/cover.jpg",
      mediaItems: null,
    });

    expect(result).toEqual({
      videoBucket: "provider-social-media",
      videoPath: "owner/legacy/video.mp4",
      thumbnailBucket: "provider-social-media",
      thumbnailPath: "owner/legacy/cover.jpg",
    });
  });
});

