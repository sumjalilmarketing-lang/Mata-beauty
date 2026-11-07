import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticatedSupabase, consumeRateLimit, hasTrustedOrigin, jsonError, serviceSupabase } from "@/lib/payments/server";
import { normalizeProviderLogo, readLogoUpload } from "./provider-logo";

const inputSchema = z.object({
  kind: z.enum(["avatar", "provider-logo", "salon-logo", "salon-cover", "salon-gallery", "collaborator-avatar"]),
  businessId: z.uuid().optional(), collaboratorId: z.uuid().optional(), sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function handleImageUpload(request: Request, forcedKind?: "provider-logo") {
  if (!hasTrustedOrigin(request)) return jsonError("Accès refusé.", 403, "origin_rejected");
  const auth = await authenticatedSupabase(request);
  if (!auth) return jsonError("Connexion requise.", 401, "unauthorized");
  const profile = await auth.client.rpc("get_my_private_profile");
  if (profile.error) return jsonError("Vérification du profil indisponible.", 503, "unavailable");
  if (!profile.data || profile.data.is_suspended || profile.data.account_status !== "active") return jsonError("Compte actif requis.", 403, "account_inactive");
  try {
    if (!(await consumeRateLimit({ scope: "image_upload_user_day", key: auth.user.id, limit: 100, windowSeconds: 86400 })) ||
        !(await consumeRateLimit({ scope: "image_upload_user", key: auth.user.id, limit: 10, windowSeconds: 60 })) ||
        !(await consumeRateLimit({ scope: "image_upload_global", key: "all", limit: 120, windowSeconds: 60 })) ||
        !(await consumeRateLimit({ scope: "image_upload_global_day", key: "all", limit: 3000, windowSeconds: 86400 }))) {
      const response = jsonError("Limite d’envois atteinte. Réessayez plus tard.", 429, "rate_limited");
      response.headers.set("Retry-After", "60"); return response;
    }
  } catch { return jsonError("Contrôle des envois indisponible.", 503, "unavailable"); }
  let form: FormData;
  try { form = await readLogoUpload(request); }
  catch (error) { return jsonError("Image invalide ou trop volumineuse (4 Mo maximum).", error instanceof Error && error.message === "too_large" ? 413 : 400, "invalid_logo"); }
  const allowed = new Set(["file", "kind", "businessId", "collaboratorId", "sortOrder"]);
  if ([...form.keys()].some(key => !allowed.has(key) || form.getAll(key).length !== 1)) return jsonError("Requête invalide.", 400, "invalid_logo");
  const parsed = inputSchema.safeParse({ kind: forcedKind ?? form.get("kind"), businessId: form.get("businessId") ?? undefined, collaboratorId: form.get("collaboratorId") ?? undefined, sortOrder: form.get("sortOrder") ?? 0 });
  const file = form.get("file");
  if (!parsed.success || !(file instanceof File)) return jsonError("Requête invalide.", 400, "invalid_logo");
  const { kind, businessId, collaboratorId, sortOrder } = parsed.data;
  const businessImage = kind.startsWith("salon-") || kind === "collaborator-avatar";
  if (businessImage) {
    if (!businessId) return jsonError("Salon requis.", 400, "invalid_target");
    const owner = await auth.client.rpc("owns_business", { target_business_id: businessId });
    if (owner.error || owner.data !== true) return jsonError("Accès refusé.", 403, "forbidden");
    if (kind === "collaborator-avatar") {
      if (!collaboratorId) return jsonError("Collaborateur requis.", 400, "invalid_target");
      const member = await auth.client.from("collaborators").select("id").eq("id", collaboratorId).eq("business_id", businessId).is("archived_at", null).maybeSingle();
      if (member.error || !member.data) return jsonError("Accès refusé.", 403, "forbidden");
    }
  } else if (kind === "provider-logo") {
    const provider = await auth.client.from("provider_profiles").select("profile_id").eq("profile_id", auth.user.id).maybeSingle();
    if (provider.error || !provider.data) return jsonError("Profil professionnel requis.", 403, "provider_required");
  }
  let normalized: Buffer;
  try { normalized = await normalizeProviderLogo(new Uint8Array(await file.arrayBuffer()), file.type); }
  catch { return jsonError("Choisissez une image JPG, PNG ou WebP valide de 4 Mo maximum.", 400, "invalid_logo"); }
  // Only normalized bytes enter privileged storage; every publication below uses caller RLS.
  const bucket = serviceSupabase().storage.from(businessImage ? "business-media" : "avatars");
  const path = `${businessImage ? businessId : auth.user.id}/${kind}-${randomUUID()}.webp`;
  const sent = await bucket.upload(path, normalized, { contentType: "image/webp", upsert: false });
  if (sent.error) return jsonError("Envoi impossible.", 503, "upload_failed");
  const url = bucket.getPublicUrl(path).data.publicUrl;
  let failed = false;
  if (kind === "avatar") {
    const result = await auth.client.from("profiles").update({ avatar_url: url }).eq("id", auth.user.id).select("avatar_url").maybeSingle();
    failed = Boolean(result.error) || result.data?.avatar_url !== url;
  } else if (kind === "provider-logo") {
    const result = await auth.client.from("provider_profiles").update({ logo_url: url }).eq("profile_id", auth.user.id).select("logo_url").maybeSingle();
    failed = Boolean(result.error) || result.data?.logo_url !== url;
  } else if (kind === "collaborator-avatar") {
    const result = await auth.client.from("collaborators").update({ avatar_url: url }).eq("id", collaboratorId!).eq("business_id", businessId!).select("avatar_url").maybeSingle();
    failed = Boolean(result.error) || result.data?.avatar_url !== url;
  } else {
    const mediaType = kind.slice(6);
    const row = await auth.client.from("business_media").insert({ business_id: businessId, storage_path: path, media_type: mediaType, sort_order: sortOrder }).select("id").maybeSingle();
    failed = Boolean(row.error) || !row.data;
    if (!failed && mediaType !== "gallery") {
      const published = await auth.client.rpc("set_salon_brand_image", { target_business_id: businessId, target_kind: mediaType, target_url: url });
      failed = Boolean(published.error) || !published.data;
    }
  }
  // A timeout can hide a committed pointer. Keep new files on uncertain saves;
  // never remove previous public images or a possibly committed upload.
  if (failed) return jsonError("Enregistrement non confirmé. Actualisez avant de réessayer.", 503, "save_failed");
  return Response.json({ ok: true, url }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
