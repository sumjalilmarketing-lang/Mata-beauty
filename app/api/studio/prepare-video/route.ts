import { z } from "zod";
import { authenticatedSupabase, consumeRateLimit, hasTrustedOrigin, jsonError, serviceSupabase } from "@/lib/payments/server";
import { BodyTooLargeError, readBoundedText } from "@/lib/http/bounded-body";
import { InvalidStudioMedia, MAX_STUDIO_VIDEO_BYTES, normalizeStudioVideo, readBoundedMedia } from "@/lib/media/video-validation-server";
export const runtime = "nodejs";
export const maxDuration = 300;
const input = z.object({ preparationId: z.uuid() }).strict();
const snapshotSchema = z.object({ id: z.uuid(), updated_at: z.string(), size: z.coerce.number().int().positive().max(MAX_STUDIO_VIDEO_BYTES) });
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  try {
    const auth = await authenticatedSupabase(request);
    if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
    const parsed = input.safeParse(JSON.parse(await readBoundedText(request, 1024)));
    if (!parsed.success) return jsonError("Requête invalide.", 400, "invalid_request");
    const profile = await auth.client.rpc("get_my_private_profile");
    if (profile.error) throw new Error("Profile unavailable");
    if (!profile.data || profile.data.is_suspended || profile.data.account_status !== "active") return jsonError("Compte actif requis.", 403, "account_inactive");
    const provider = await auth.client.from("provider_profiles").select("profile_id").eq("profile_id", auth.user.id).maybeSingle();
    if (provider.error) throw new Error("Provider unavailable");
    if (!provider.data) return jsonError("Compte professionnel requis.", 403, "forbidden");
    for (const quota of [{ key: auth.user.id, limit: 10, windowSeconds: 3600 }, { key: "global", limit: 300, windowSeconds: 3600 }]) {
      if (!await consumeRateLimit({ scope: "studio_video_preparation", ...quota })) return jsonError("Limite de préparations atteinte. Réessayez plus tard.", 429, "rate_limited");
    }
    const prefix = `${auth.user.id}/${parsed.data.preparationId}`;
    const sourcePath = `${prefix}/input`, videoPath = `${prefix}/video.mp4`;
    const sources = auth.client.storage.from("studio-video-inputs"), output = auth.client.storage.from("provider-social-media");
    let uploaded = false, returned = false;
    try {
      const source = await serviceSupabase().rpc("get_studio_source_snapshot", { target_owner: auth.user.id, target_path: sourcePath });
      if (source.error) throw new Error("Source unavailable");
      const snapshot = snapshotSchema.safeParse(source.data);
      if (!snapshot.success) return jsonError("Vidéo source introuvable ou trop volumineuse.", 422, "invalid_media");
      const signed = await sources.createSignedUrl(sourcePath, 300);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Source inaccessible");
      const url = new URL(signed.data.signedUrl);
      if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin) throw new Error("Unexpected storage host");
      const bytes = await readBoundedMedia(await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) }), MAX_STUDIO_VIDEO_BYTES);
      if (bytes.length !== snapshot.data.size) throw new InvalidStudioMedia("Envoi incomplet. Réessayez.");
      request.signal.throwIfAborted();
      const media = await normalizeStudioVideo(bytes);
      request.signal.throwIfAborted();
      // User-scoped upload retains owner_id for the existing publication guards.
      const save = await output.upload(videoPath, media.video, { contentType: "video/mp4", upsert: false });
      if (save.error) throw new Error("Output upload unavailable");
      uploaded = true;
      request.signal.throwIfAborted();
      const preview = await output.createSignedUrl(videoPath, 3600);
      if (preview.error || !preview.data?.signedUrl) throw new Error("Preview unavailable");
      request.signal.throwIfAborted();
      returned = true;
      return Response.json({ ok: true, postId: parsed.data.preparationId, videoPath, previewUrl: preview.data.signedUrl,
        duration: media.duration, aspectRatio: media.aspectRatio, thumbnail: media.thumbnail.toString("base64") }, { headers: { "Cache-Control": "private, no-store" } });
    } finally {
      await sources.remove([sourcePath]).catch(() => undefined);
      if (uploaded && !returned) await output.remove([videoPath]).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof InvalidStudioMedia) return jsonError(error.message, 422, "invalid_media");
    if (error instanceof BodyTooLargeError) return jsonError("Requête trop volumineuse.", 413, "body_too_large");
    if (error instanceof SyntaxError) return jsonError("Requête invalide.", 400, "invalid_request");
    return jsonError("La préparation sur le serveur est indisponible. Votre sélection et vos champs sont conservés ; réessayez.", 503, "preparation_unavailable");
  }
}
