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
