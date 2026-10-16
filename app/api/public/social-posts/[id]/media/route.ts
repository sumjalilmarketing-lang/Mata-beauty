import { serviceSupabase } from "@/lib/payments/server";
import { resolveSocialProfileVideoMedia } from "@/lib/profiles/social-profile-video-media";

const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
type MediaItem = { bucket_id: string; storage_path: string; media_type: string; thumbnail_path: string | null };

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  const client = serviceSupabase();
  const { data, error } = await client.from("social_feed")
    .select("video_url,thumbnail_url,post_type,media_items").eq("id", id).eq("post_type", "video").maybeSingle();
  if (error || !data) return Response.json({ error: "not_found" }, { status: 404, headers });
  const media = resolveSocialProfileVideoMedia({
    videoUrl: data.video_url,
    thumbnailUrl: data.thumbnail_url,
    mediaItems: (data.media_items ?? []) as MediaItem[],
  });
  const response: { videoUrl: string; thumbnailUrl: string | null } = {
    videoUrl: "",
    thumbnailUrl: null,
  };
  if (media.videoBucket === "provider-social-media" && media.videoPath) {
    const { data: signed, error: signingError } = await client.storage.from(media.videoBucket).createSignedUrl(media.videoPath, 3600);
    if (signingError || !signed?.signedUrl) return Response.json({ error: "unavailable" }, { status: 503, headers });
    response.videoUrl = signed.signedUrl;
  } else {
    response.videoUrl = safeHttpUrl(data.video_url) ?? "";
    if (!response.videoUrl) return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
  if (media.thumbnailBucket === "provider-social-media" && media.thumbnailPath) {
    const { data: signed } = await client.storage.from(media.thumbnailBucket).createSignedUrl(media.thumbnailPath, 3600);
    response.thumbnailUrl = signed?.signedUrl ?? null;
  } else {
    response.thumbnailUrl = safeHttpUrl(data.thumbnail_url);
  }
  return Response.json(response, { headers });
}

