import { z } from "zod";
import { authenticatedSupabase, consumeRateLimit, hasTrustedOrigin, jsonError, serviceSupabase } from "@/lib/payments/server";
import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
import { InvalidStudioMedia, MAX_STUDIO_VIDEO_BYTES, readBoundedMedia, validateThumbnailBytes, validateVideoBytes } from "@/lib/media/video-validation-server";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.object({ postId: z.uuid(), videoPath: z.string().max(180), thumbnailPath: z.string().max(180) }).strict();
const snapshotSchema = z.object({ id: z.uuid(), updated_at: z.string(), size: z.coerce.number().int().positive() });

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  try {
    const auth = await authenticatedSupabase(request);
    if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
    const parsed = schema.safeParse(JSON.parse(await readBoundedText(request, 2048)));
    if (!parsed.success) return jsonError("Médias invalides.", 400, "invalid_media");
    const { postId, videoPath, thumbnailPath } = parsed.data;
    const prefix = `${auth.user.id}/${postId}/`;
    if (!new RegExp(`^${prefix}video[.](mp4|mov|webm)$`).test(videoPath) || !new RegExp(`^${prefix}thumbnail[.](jpg|jpeg|png|webp)$`).test(thumbnailPath)) return jsonError("Accès refusé.", 403, "forbidden");
    const profile = await auth.client.rpc("get_my_private_profile");
    if (profile.error) throw new Error("Profile unavailable");
    if (!profile.data || profile.data.is_suspended || profile.data.account_status !== "active") return jsonError("Compte actif requis.", 403, "account_inactive");
    const provider = await auth.client.from("provider_profiles").select("profile_id").eq("profile_id", auth.user.id).maybeSingle();
    if (provider.error) throw new Error("Provider unavailable");
    if (!provider.data) return jsonError("Compte professionnel requis.", 403, "forbidden");
    // Bound expensive full decoding independently of client-controlled session IDs.
    for (const quota of [{ key: auth.user.id, limit: 10, windowSeconds: 3600 }, { key: "global", limit: 300, windowSeconds: 3600 }]) {
      if (!await consumeRateLimit({ scope: "studio_video_validation", ...quota })) return jsonError("Limite de préparations atteinte. Réessayez plus tard.", 429, "rate_limited");
    }
    const service = serviceSupabase();
    async function download(path: string, limit: number) {
      const result = await service.rpc("get_studio_upload_snapshot", { target_owner: auth!.user.id, target_path: path });
      if (result.error) throw new Error("Snapshot unavailable");
      const snapshot = snapshotSchema.safeParse(result.data);
      if (!snapshot.success || snapshot.data.size > limit) throw new InvalidStudioMedia("Fichier introuvable ou trop volumineux.");
      const signed = await auth!.client.storage.from("provider-social-media").createSignedUrl(path, 300);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Download unavailable");
      const url = new URL(signed.data.signedUrl);
      if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin) throw new Error("Unexpected storage host");
      const bytes = await readBoundedMedia(await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error" }), limit);
      if (bytes.length !== snapshot.data.size) throw new InvalidStudioMedia("Fichier incomplet. Réessayez l’envoi.");
      return { path, snapshot: snapshot.data, bytes };
    }
    const [video, thumbnail] = await Promise.all([
      download(videoPath, MAX_STUDIO_VIDEO_BYTES),
      download(thumbnailPath, 5 * 1024 * 1024),
    ]);
    const meta = await validateVideoBytes(video.bytes);
    const thumbnailHash = await validateThumbnailBytes(thumbnail.bytes);
    for (const item of [{ ...video, kind: "video", hash: meta.sha256 }, { ...thumbnail, kind: "thumbnail", hash: thumbnailHash }]) {
      const saved = await service.rpc("attest_studio_upload", {
        target_owner: auth.user.id, target_path: item.path, target_object_id: item.snapshot.id,
        target_updated_at: item.snapshot.updated_at, target_size: item.bytes.length, target_sha256: item.hash,
        target_media_type: item.kind, target_duration: item.kind === "video" ? meta.duration : null,
        target_aspect_ratio: item.kind === "video" ? meta.aspectRatio : null,
      });
      if (saved.error || saved.data !== true) throw new Error("Attestation unavailable");
    }
    return Response.json({ ok: true, duration: meta.duration, aspectRatio: meta.aspectRatio }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof InvalidStudioMedia) return jsonError(error.message, 422, "invalid_media");
    if (error instanceof BodyTooLargeError) return jsonError("Requête trop volumineuse.", 413, "body_too_large");
    if (error instanceof SyntaxError) return jsonError("Requête invalide.", 400, "invalid_request");
    return jsonError("Vérification vidéo indisponible. Votre sélection est conservée ; réessayez.", 503, "validation_unavailable");
  }
}
