import { serviceSupabase } from "@/lib/payments/server";
import { validatedMessageMediaPath } from "@/lib/messaging/storage-path";

/** Reclaim only abandoned uploads; never delete a sent message or booking evidence. */
export async function cleanupAbandonedMessageUploads() {
  const service = serviceSupabase();
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await service.from("message_attachments")
    .select("id,storage_path").in("status", ["pending", "rejected"]).is("message_id", null).is("deleted_at", null).lt("created_at", cutoff).limit(25);
  if (error) throw new Error("media_cleanup_unavailable");
  for (const attachment of data) {
    const removed = await service.storage.from("message-attachments").remove([
      attachment.storage_path, validatedMessageMediaPath(attachment.storage_path),
    ]);
    if (removed.error) throw new Error("media_cleanup_pending");
    const updated = await service.from("message_attachments").update({ status: "rejected", deleted_at: new Date().toISOString() }).eq("id", attachment.id).is("message_id", null);
    if (updated.error) throw new Error("media_cleanup_pending");
  }
  return data.length;
}

/** Expired Stories and abandoned Story uploads are reclaimed by the existing authenticated worker. */
export async function cleanupExpiredProfessionalStories() {
  const service = serviceSupabase();
  const now = new Date().toISOString();
  const abandonedBefore = new Date(Date.now() - 2 * 3600_000).toISOString();
  const [expired, abandoned] = await Promise.all([
    service.from("professional_stories").select("id,storage_path,upload_path").eq("status", "published").lte("expires_at", now).limit(25),
    service.from("professional_stories").select("id,storage_path,upload_path").eq("status", "pending").lt("created_at", abandonedBefore).limit(25),
  ]);
  if (expired.error || abandoned.error) throw new Error("story_cleanup_unavailable");
  const rows = [...(expired.data ?? []), ...(abandoned.data ?? [])];
  for (const story of rows) {
    const paths = [...new Set([story.storage_path, story.upload_path].filter((path): path is string => Boolean(path)))];
    const removed = await service.storage.from("professional-stories").remove(paths);
    if (removed.error) throw new Error("story_cleanup_pending");
    const deleted = await service.from("professional_stories").delete().eq("id", story.id);
    if (deleted.error) throw new Error("story_cleanup_pending");
  }
  return rows.length;
}
