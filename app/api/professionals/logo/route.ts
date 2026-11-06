import { randomUUID } from "node:crypto";
import { authenticatedSupabase, hasTrustedOrigin, jsonError } from "@/lib/payments/server";
import { normalizeProviderLogo, readLogoUpload } from "@/lib/media/provider-logo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
  const provider = await auth.client.from("provider_profiles").select("profile_id").eq("profile_id", auth.user.id).maybeSingle();
  if (provider.error) return jsonError("Vérification du profil indisponible.", 503, "unavailable");
  if (!provider.data) return jsonError("Profil professionnel requis.", 403, "provider_required");
  let normalized: Buffer;
  try {
    const form = await readLogoUpload(request);
    const file = form.get("file");
    if (!(file instanceof File) || [...form.keys()].some(key => key !== "file") || form.getAll("file").length !== 1) throw new Error("invalid_logo");
    normalized = await normalizeProviderLogo(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    return jsonError("Choisissez une image JPG, PNG ou WebP valide de 4 Mo maximum.", error instanceof Error && error.message === "too_large" ? 413 : 400, "invalid_logo");
  }
  const bucket = auth.client.storage.from("avatars");
  const path = `${auth.user.id}/professional-logo-${randomUUID()}.webp`;
  const sent = await bucket.upload(path, normalized, { contentType: "image/webp", upsert: false });
  if (sent.error) return jsonError("Le logo n’a pas pu être enregistré.", 503, "upload_failed");
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const saved = await auth.client.from("provider_profiles").update({ logo_url: url }).eq("profile_id", auth.user.id).select("profile_id,logo_url").maybeSingle();
  if (saved.error || saved.data?.logo_url !== url) {
    // After a network error the write outcome may be unknown. Verify the
    // current pointer before cleanup so we never delete a committed logo.
    const current = await auth.client.from("provider_profiles").select("logo_url").eq("profile_id", auth.user.id).maybeSingle();
    if (current.error || current.data?.logo_url !== url) {
      if (!current.error) await bucket.remove([path]);
      return jsonError("Enregistrement non confirmé. Actualisez votre profil avant de réessayer.", 503, "save_failed");
    }
  }
  return Response.json({ ok: true, url }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
