import { serviceSupabase } from "@/lib/payments/server";

const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
type MediaItem = { bucket_id: string; storage_path: string; media_type: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  const client = serviceSupabase();
  const { data, error } = await client.from("social_feed")
    .select("video_url,post_type,media_items").eq("id", id).eq("post_type", "video").maybeSingle();
  if (error || !data) return Response.json({ error: "not_found" }, { status: 404, headers });
  const media = ((data.media_items ?? []) as MediaItem[]).find(item => item.media_type !== "image");
  if (media?.bucket_id === "provider-social-media") {
    const { data: signed, error: signingError } = await client.storage.from(media.bucket_id).createSignedUrl(media.storage_path, 3600);
    if (signingError || !signed?.signedUrl) return Response.json({ error: "unavailable" }, { status: 503, headers });
    return Response.json({ videoUrl: signed.signedUrl }, { headers });
  }
  if (typeof data.video_url === "string") {
    try {
      const url = new URL(data.video_url);
      if (url.protocol === "https:") return Response.json({ videoUrl: url.toString() }, { headers });
    } catch { /* URL invalide : répondre comme si la publication était absente. */ }
  }
  return Response.json({ error: "unavailable" }, { status: 503, headers });
}
