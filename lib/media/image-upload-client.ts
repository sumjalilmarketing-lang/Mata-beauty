import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ImageUploadKind = "avatar" | "provider-logo" | "salon-logo" | "salon-cover" | "salon-gallery" | "collaborator-avatar";
export async function uploadProfileImage(file: File, kind: ImageUploadKind, options: { businessId?: string; collaboratorId?: string; sortOrder?: number } = {}) {
  const client = getSupabaseBrowserClient();
  const session = client ? await client.auth.getSession() : null;
  if (!session?.data.session) throw new Error("Reconnectez-vous pour enregistrer votre image.");
  const form = new FormData(); form.set("file", file); form.set("kind", kind);
  if (options.businessId) form.set("businessId", options.businessId);
  if (options.collaboratorId) form.set("collaboratorId", options.collaboratorId);
  if (options.sortOrder !== undefined) form.set("sortOrder", String(options.sortOrder));
  const response = await fetch("/api/media/images", { method: "POST", headers: { Authorization: `Bearer ${session.data.session.access_token}` }, body: form });
  const result: unknown = await response.json();
  if (!response.ok || !result || typeof result !== "object" || !("url" in result) || typeof result.url !== "string") {
    throw new Error("L’image n’a pas pu être enregistrée. Vérifiez le format, la taille (4 Mo maximum), puis réessayez.");
  }
  return result.url;
}
