import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticatedSupabase, consumeRateLimit, hasTrustedOrigin, serviceSupabase } from "@/lib/payments/server";
import { MediaValidationError, validMediaDeclaration, validateMessageMedia } from "@/lib/messaging/media";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const bucket = "professional-stories";
const prepareSchema = z.object({ phase: z.literal("prepare"), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]), size: z.number().int().positive(), caption: z.string().trim().max(280).default(""), serviceId: z.uuid().nullable().optional() });
const completeSchema = z.object({ phase: z.literal("complete"), storyId: z.uuid() });
const schema = z.discriminatedUnion("phase", [prepareSchema, completeSchema]);
type StoryRow = { id: string; provider_id: string; storage_path: string; content_type: string; size_bytes: number; status: string; provider_service_id: string | null; caption: string; };
function fail(message: string, status: number) { return Response.json({ error: message }, { status, headers }); }

async function approvedOwner(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return { response: fail("Connectez-vous pour gérer une Story.", 401) } as const;
  const [provider, profile] = await Promise.all([
    auth.client.from("provider_profiles").select("status").eq("profile_id", auth.user.id).maybeSingle(),
    auth.client.from("profiles").select("account_status,is_suspended").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (provider.error || profile.error) return { response: fail("Vérification du compte impossible.", 503) } as const;
  if (provider.data?.status !== "approved" || profile.data?.account_status !== "active" || profile.data.is_suspended) return { response: fail("Seul un professionnel approuvé peut publier une Story.", 403) } as const;
  return { auth } as const;
}

export async function GET() {
  const service = serviceSupabase();
  const { data, error } = await service.rpc("list_active_professional_stories", { target_limit: 40 });
  if (error) return Response.json({ enabled: false, stories: [] }, { status: 503, headers });
  const rows = (data ?? []) as Array<{ story_id: string; provider_id: string; provider_name: string; avatar_url: string | null; provider_service_id: string | null; service_title: string | null; caption: string; storage_path: string; content_type: string; published_at: string; expires_at: string }>;
  const stories = await Promise.all(rows.map(async row => {
    const signed = await service.storage.from(bucket).createSignedUrl(row.storage_path, 300);
    if (signed.error) return null;
    return { id: row.story_id, providerId: row.provider_id, providerName: row.provider_name, avatarUrl: row.avatar_url, serviceId: row.provider_service_id, serviceTitle: row.service_title, caption: row.caption, mediaUrl: signed.data.signedUrl, contentType: row.content_type, publishedAt: row.published_at, expiresAt: row.expires_at };
  }));
  return Response.json({ enabled: true, stories: stories.filter(Boolean) }, { headers });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return fail("Origine de requête invalide.", 403);
  const verified = await approvedOwner(request);
  if ("response" in verified) return verified.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Demande de Story invalide.", 400);
  const { auth } = verified;
  const service = serviceSupabase();

  if (parsed.data.phase === "prepare") {
    const input = parsed.data;
    if (!validMediaDeclaration(input.contentType, input.size) || (input.contentType === "video/mp4" && input.size > 20971520)) return fail("Format ou taille de média non pris en charge.", 400);
    if (!(await consumeRateLimit({ scope: "professional_story_publish", key: auth.user.id, limit: 10, windowSeconds: 3600 }))) return fail("Limite de publication atteinte. Réessayez plus tard.", 429);
    if (input.serviceId) {
      const serviceResult = await auth.client.from("provider_services").select("id").eq("id", input.serviceId).eq("provider_id", auth.user.id).eq("is_active", true).maybeSingle();
      if (serviceResult.error) return fail("La prestation ne peut pas être vérifiée.", 503);
      if (!serviceResult.data) return fail("Cette prestation n'est pas disponible pour votre profil.", 400);
    }
    const id = randomUUID();
    const sourcePath = `${auth.user.id}/${id}/source`;
    const inserted = await service.from("professional_stories").insert({ id, provider_id: auth.user.id, provider_service_id: input.serviceId ?? null, caption: input.caption, storage_path: sourcePath, upload_path: sourcePath, content_type: input.contentType, size_bytes: input.size, status: "pending" }).select("id,storage_path").single();
    if (inserted.error) return fail("Impossible de préparer la Story.", 503);
    const signed = await service.storage.from(bucket).createSignedUploadUrl(sourcePath, { upsert: false });
    if (signed.error) {
      await service.from("professional_stories").delete().eq("id", id).eq("status", "pending");
      return fail("Le stockage des Stories est momentanément indisponible.", 503);
    }
    return Response.json({ storyId: inserted.data.id, path: signed.data.path, token: signed.data.token }, { headers });
  }

  const storyResult = await service.from("professional_stories").select("id,provider_id,storage_path,content_type,size_bytes,status,provider_service_id,caption").eq("id", parsed.data.storyId).eq("provider_id", auth.user.id).maybeSingle();
  if (storyResult.error) return fail("La Story n'est pas accessible.", 503);
  const story = storyResult.data as StoryRow | null;
  if (!story || story.status !== "pending") return fail("Cette Story a déjà été publiée ou a expiré.", 409);
  const download = await service.storage.from(bucket).download(story.storage_path);
  if (download.error || !download.data || download.data.size !== story.size_bytes) return fail("Le téléversement de la Story est incomplet.", 409);
  let validated;
  try {
    validated = await validateMessageMedia(Buffer.from(await download.data.arrayBuffer()), story.content_type);
    if (story.content_type === "video/mp4" && (validated.duration === null || validated.duration > 15)) throw new MediaValidationError("Une Story vidéo doit durer 15 secondes ou moins.");
  } catch (caught: unknown) {
    await service.from("professional_stories").delete().eq("id", story.id).eq("status", "pending");
    await service.storage.from(bucket).remove([story.storage_path]);
    return fail(caught instanceof MediaValidationError ? caught.message : "Ce média ne peut pas être publié.", 400);
  }
  const publishedPath = `${auth.user.id}/${story.id}/published`;
  const uploaded = await service.storage.from(bucket).upload(publishedPath, validated.bytes, { contentType: validated.contentType, cacheControl: "0", upsert: false });
  if (uploaded.error) return fail("La Story n'a pas pu être enregistrée.", 503);
  const publishedAt = new Date();
  const updated = await service.from("professional_stories").update({ storage_path: publishedPath, content_type: validated.contentType, size_bytes: validated.bytes.length, duration_seconds: validated.duration, status: "published", published_at: publishedAt.toISOString(), expires_at: new Date(publishedAt.getTime() + 24 * 3600_000).toISOString() }).eq("id", story.id).eq("provider_id", auth.user.id).eq("status", "pending").select("id").maybeSingle();
  if (updated.error || !updated.data) {
    await service.storage.from(bucket).remove([publishedPath]);
    return fail("La Story n'a pas pu être publiée. Réessayez.", 409);
  }
  const sourceRemoved = await service.storage.from(bucket).remove([story.storage_path]);
  if (!sourceRemoved.error) await service.from("professional_stories").update({ upload_path: null }).eq("id", story.id).eq("status", "published");
  return Response.json({ ok: true, storyId: story.id }, { headers });
}
