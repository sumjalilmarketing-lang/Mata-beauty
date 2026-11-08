import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { StudioUploadError, uploadStudioVideo } from "./video-upload-client";
export type PreparedStudioVideo = { postId: string; videoPath: string; previewUrl: string; duration: number; aspectRatio: number; thumbnail: Blob };

export async function prepareStudioVideo(file: File, onStatus: (message: string) => void, signal?: AbortSignal): Promise<PreparedStudioVideo> {
  const client = getSupabaseBrowserClient();
  const session = await client?.auth.getSession();
  if (!client || !session?.data.session) throw new StudioUploadError("Votre session a expiré. Reconnectez-vous.");
  const postId = crypto.randomUUID(), sourcePath = `${session.data.session.user.id}/${postId}/input`;
  try {
    if (signal?.aborted) throw new StudioUploadError("Préparation annulée. Votre sélection est conservée.");
    await uploadStudioVideo(file, sourcePath, percent => onStatus(`Envoi privé pour préparer l’aperçu… ${percent} %`), { bucket: "studio-video-inputs", signal });
    onStatus("Préparation de votre vidéo sur le serveur… Gardez le Studio ouvert.");
    const response = await fetch("/api/studio/prepare-video", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` },
      body: JSON.stringify({ preparationId: postId }), signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(285000)]),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new StudioUploadError(result.error?.message || "La préparation a échoué. Réessayez.");
    if (result.postId !== postId || result.videoPath !== `${session.data.session.user.id}/${postId}/video.mp4` || typeof result.previewUrl !== "string" || !Number.isFinite(result.duration) || result.duration <= 0 || !Number.isFinite(result.aspectRatio) || result.aspectRatio <= 0 || typeof result.thumbnail !== "string" || result.thumbnail.length > 7 * 1024 * 1024) throw new StudioUploadError("Réponse de préparation invalide. Réessayez.");
    const bytes = Uint8Array.from(atob(result.thumbnail), char => char.charCodeAt(0));
    return { ...result, thumbnail: new Blob([bytes], { type: "image/jpeg" }) };
  } finally { await client.storage.from("studio-video-inputs").remove([sourcePath]).catch(() => undefined); }
}
