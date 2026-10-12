import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticatedSupabase, serviceSupabase } from "@/lib/payments/server";
import { MediaValidationError, validMediaDeclaration, validateMessageMedia } from "@/lib/messaging/media";
import { validatedMessageMediaPath } from "@/lib/messaging/storage-path";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const bucket = "message-attachments";
const prepareSchema = z.object({ phase: z.literal("prepare"), conversationId: z.uuid(), filename: z.string().min(1).max(200), contentType: z.string(), size: z.number().int().positive(), clientNonce: z.uuid() });
const completeSchema = z.object({ phase: z.literal("complete"), attachmentId: z.uuid(), clientNonce: z.uuid() });
const schema = z.discriminatedUnion("phase", [prepareSchema, completeSchema]);
const validationClaimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("claimed"), lease_id: z.uuid() }),
  z.object({ status: z.literal("ready"), message: z.object({ id: z.uuid() }).passthrough() }),
  z.object({ status: z.literal("busy"), retry_after_seconds: z.number().int().min(1).max(60) }),
  z.object({ status: z.literal("exhausted") }),
  z.object({ status: z.literal("expired") }),
]);
type Attachment = { id: string; conversation_id: string; uploader_id: string; storage_path: string; mime_type: string; size_bytes: number; status: string; created_at: string; message_id: string | null; upload_nonce: string; deleted_at: string | null };
function error(message: string, status: number) { return Response.json({ error: message }, { status, headers }); }

export async function POST(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return error("Connectez-vous pour envoyer un média.", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Demande de média invalide.", 400);
  const input = parsed.data;
  const service = serviceSupabase();
  if (input.phase === "prepare") {
    if (!validMediaDeclaration(input.contentType, input.size)) return error("Photo JPEG, PNG ou WebP : 10 Mo. Vidéo MP4 : 20 Mo et 60 secondes maximum.", 400);
    const { data, error: preparationError } = await service.rpc("prepare_message_attachment", {
      target_actor_id: auth.user.id, target_conversation_id: input.conversationId,
      target_mime_type: input.contentType, target_size_bytes: input.size, target_client_nonce: input.clientNonce,
    });
    if (preparationError) return error(preparationError.code === "42501" ? "Conversation inaccessible." : "Impossible de préparer cet envoi. Vérifiez votre accès et réessayez plus tard.", preparationError.code === "42501" ? 403 : 429);
    const attachment = data as Attachment;
    if (attachment.status === "ready") {
      const { data: message } = await auth.client.from("messages").select("*").eq("id", attachment.message_id).single();
      return Response.json({ attachmentId: attachment.id, message }, { headers });
    }
    if (attachment.status !== "pending" || Date.parse(attachment.created_at) < Date.now() - 2 * 3600_000) return error("Cet envoi a expiré. Sélectionnez de nouveau le fichier.", 409);
    const signed = await service.storage.from(bucket).createSignedUploadUrl(attachment.storage_path, { upsert: false });
    if (signed.error) return error("Le stockage est momentanément indisponible.", 503);
    return Response.json({ attachmentId: attachment.id, path: signed.data.path, token: signed.data.token }, { headers });
  }
  const selected = await auth.client.from("message_attachments").select("*").eq("id", input.attachmentId).eq("uploader_id", auth.user.id).maybeSingle();
  const attachment = selected.data as Attachment | null;
  if (selected.error) return error("Le média est momentanément inaccessible.", 503);
  if (!attachment || attachment.upload_nonce !== input.clientNonce || attachment.deleted_at) return error("Média inaccessible.", 404);
  // Claim in SQL before any download or parsing. Concurrent requests share one
  // bounded lease, and a crashed validation can be retried after it expires.
  const claimed = await service.rpc("claim_message_attachment_validation", {
    target_actor_id: auth.user.id, target_attachment_id: attachment.id, target_client_nonce: input.clientNonce,
  });
  if (claimed.error) return error(claimed.error.code === "42501" ? "Média inaccessible." : "La validation est momentanément indisponible.", claimed.error.code === "42501" ? 404 : 503);
  const parsedClaim = validationClaimSchema.safeParse(claimed.data);
  if (!parsedClaim.success) return error("La validation est momentanément indisponible.", 503);
  const claim = parsedClaim.data;
  if (claim.status === "ready") return Response.json({ message: claim.message }, { headers });
  if (claim.status === "busy") return Response.json({ error: "Ce média est déjà en cours de validation. Réessayez dans une minute." }, { status: 429, headers: { ...headers, "Retry-After": String(claim.retry_after_seconds) } });
  if (claim.status === "exhausted") return error("La limite de tentatives de cet envoi est atteinte. Sélectionnez de nouveau le fichier.", 429);
  if (claim.status === "expired") return error("Cet envoi a expiré. Sélectionnez de nouveau le fichier.", 409);
  const download = await service.storage.from(bucket).download(attachment.storage_path);
  if (download.error || !download.data) return error("Téléversement incomplet. Réessayez l’envoi.", 409);
  let validated;
  try {
    if (download.data.size !== attachment.size_bytes) throw new MediaValidationError("La taille du fichier ne correspond pas à l’envoi déclaré.");
    validated = await validateMessageMedia(Buffer.from(await download.data.arrayBuffer()), attachment.mime_type);
  } catch (caught: unknown) {
    const rejected = await service.from("message_attachments").update({ status: "rejected", validation_lease_id: null, validation_lease_until: null })
      .eq("id", attachment.id).eq("status", "pending").eq("validation_lease_id", claim.lease_id).gt("validation_lease_until", new Date().toISOString()).select("id");
    if (!rejected.error && rejected.data?.length) await service.storage.from(bucket).remove([attachment.storage_path]);
    return error(caught instanceof MediaValidationError ? caught.message : "Ce média ne peut pas être envoyé.", 400);
  }
  // Store a separate validated object. A still-valid upload token can never replace it.
  const validatedPath = validatedMessageMediaPath(attachment.storage_path);
  const uploaded = await service.storage.from(bucket).upload(validatedPath, validated.bytes, { contentType: validated.contentType, cacheControl: "0", upsert: false });
  if (uploaded.error) {
    console.error("conversation_media_publish_failed", {
      code: uploaded.error.name ?? "unknown",
      status: "status" in uploaded.error ? uploaded.error.status : undefined,
      statusCode: "statusCode" in uploaded.error ? uploaded.error.statusCode : undefined,
    });
    if (uploaded.error.message !== "The resource already exists") return error("Le média n’a pas pu être enregistré. Réessayez.", 503);
    // A retry may encounter a canonical object written before the previous
    // request lost its response. Attach only if the existing bytes are exactly
    // the server-validated payload; never trust an error string by itself.
    const existing = await service.storage.from(bucket).download(validatedPath);
    if (existing.error || !existing.data || existing.data.size !== validated.bytes.length) return error("Le média existant doit être vérifié avant publication. Réessayez plus tard.", 503);
    const existingBytes = Buffer.from(await existing.data.arrayBuffer());
    const expectedHash = createHash("sha256").update(validated.bytes).digest();
    const existingHash = createHash("sha256").update(existingBytes).digest();
    if (!expectedHash.equals(existingHash)) return error("Un fichier différent existe déjà pour cet envoi. Sélectionnez de nouveau le média.", 409);
  }
  const completed = await service.rpc("complete_message_attachment", {
    target_actor_id: auth.user.id, target_attachment_id: attachment.id, target_width: validated.width,
    target_height: validated.height, target_duration_seconds: validated.duration, target_size_bytes: validated.bytes.length,
    target_validation_lease: claim.lease_id,
  });
  if (completed.error) return error("L’envoi n’a pas abouti. Réessayez sans changer le fichier.", 409);
  // Source kept private until cleanup; only the validated path is attached atomically in SQL.
  await service.storage.from(bucket).remove([attachment.storage_path]);
  return Response.json(completed.data, { headers });
}

export async function GET(request: Request) {
  const auth = await authenticatedSupabase(request);
  if (!auth) return error("Connexion requise.", 401);
  const attachmentId = new URL(request.url).searchParams.get("attachment");
  if (!z.uuid().safeParse(attachmentId).success) return error("Média invalide.", 400);
  const { data, error: readError } = await auth.client.from("message_attachments").select("conversation_id,storage_path,status,deleted_at").eq("id", attachmentId).maybeSingle();
  if (readError) {
    console.error("conversation_media_attachment_read_failed", { code: readError.code ?? "unknown" });
    return error("Média momentanément indisponible.", 503);
  }
  if (!data || data.status !== "ready" || data.deleted_at) return error("Média inaccessible.", 404);
  const { data: member, error: permissionError } = await auth.client.rpc("is_conversation_member", { target_conversation_id: data.conversation_id });
  if (permissionError || member !== true) return error("Média inaccessible.", 404);
  const { data: signed, error: signingError } = await serviceSupabase().storage.from(bucket).createSignedUrl(data.storage_path, 120);
  if (signingError) {
    console.error("conversation_media_signing_failed", {
      code: signingError.name ?? "unknown",
      status: "status" in signingError ? signingError.status : undefined,
      statusCode: "statusCode" in signingError ? signingError.statusCode : undefined,
    });
    return error("Média momentanément indisponible.", 503);
  }
  return Response.json({ url: signed.signedUrl, expiresAt: new Date(Date.now() + 120_000).toISOString() }, { headers });
}
