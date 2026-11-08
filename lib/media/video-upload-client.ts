import { Upload, DetailedError } from "tus-js-client";
import { getSupabaseBrowserClient, getSupabaseConfiguration } from "@/lib/supabase/client";

export class StudioUploadError extends Error {}

export function studioTransferMessage(status: number) {
  const suffix = " Votre vidéo et vos champs sont conservés.";
  if (status === 401) return "Votre session a expiré. Reconnectez-vous puis réessayez." + suffix;
  if (status === 403) return "Le serveur a refusé cet envoi. Vérifiez votre accès professionnel puis réessayez." + suffix;
  if (status === 413) return "Cette vidéo dépasse la taille autorisée. Choisissez un fichier plus léger." + suffix;
  if (status === 429) return "La limite d’envois est atteinte. Réessayez plus tard." + suffix;
  if (status === 409) return "Cet envoi existe déjà. Relancez la préparation." + suffix;
  if (status >= 500) return "Le service vidéo est momentanément indisponible. Réessayez." + suffix;
  if (status >= 400) return "Le serveur n’a pas accepté cet envoi. Relancez la préparation." + suffix;
  return "L’envoi a été interrompu. Vérifiez la connexion puis réessayez." + suffix;
}

/** Chunked transfer retries network interruptions without restarting the whole video. */
export async function uploadStudioVideo(file: File, path: string, onProgress: (percent: number) => void, options: { bucket?: "provider-social-media" | "studio-video-inputs"; signal?: AbortSignal } = {}) {
  const client = getSupabaseBrowserClient();
  if (!client) throw new StudioUploadError("Connexion au service vidéo indisponible.");
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new StudioUploadError("Votre session a expiré. Reconnectez-vous avant de publier.");
  const { url, anonKey } = getSupabaseConfiguration();
  const endpoint = new URL("/storage/v1/upload/resumable", url);
  // The direct Storage host is used only for hosted Supabase projects.
  if (/^[a-z0-9]+\.supabase\.co$/.test(endpoint.hostname)) endpoint.hostname = endpoint.hostname.replace(".supabase.co", ".storage.supabase.co");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: endpoint.href,
      headers: { authorization: `Bearer ${data.session!.access_token}`, apikey: anonKey, "x-upsert": "false" },
      metadata: { bucketName: options.bucket ?? "provider-social-media", objectName: path, contentType: options.bucket === "studio-video-inputs" ? "application/octet-stream" : file.type, cacheControl: "31536000" },
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      retryDelays: [0, 1500, 3000, 5000, 10000],
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(total ? Math.round(sent * 100 / total) : 0),
      onSuccess: () => { options.signal?.removeEventListener("abort", cancelled); window.clearTimeout(deadline); resolve(); },
      onError: error => { options.signal?.removeEventListener("abort", cancelled); window.clearTimeout(deadline); reject(new StudioUploadError(studioTransferMessage(error instanceof DetailedError ? error.originalResponse?.getStatus() ?? 0 : 0))); },
    });
    const deadline = window.setTimeout(() => {
      options.signal?.removeEventListener("abort", cancelled);
      void upload.abort().finally(() => reject(new StudioUploadError("L’envoi prend trop de temps. Votre sélection est conservée ; vérifiez la connexion puis réessayez.")));
    }, 15 * 60 * 1000);
    const cancelled = () => {
      window.clearTimeout(deadline);
      void upload.abort().finally(() => reject(new StudioUploadError("Préparation annulée. Votre sélection est conservée.")));
    };
    options.signal?.addEventListener("abort", cancelled, { once: true });
    if (options.signal?.aborted) cancelled();
    else upload.start();
  });
}

/** Only metadata crosses this endpoint; the server reads the private uploaded bytes. */
export async function validateStudioUpload(postId: string, videoPath: string, thumbnailPath: string) {
  const client = getSupabaseBrowserClient();
  const session = await client?.auth.getSession();
  if (!session?.data.session) throw new StudioUploadError("Votre session a expiré. Reconnectez-vous.");
  const response = await fetch("/api/studio/validate-video", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session.access_token}` },
    body: JSON.stringify({ postId, videoPath, thumbnailPath }), signal: AbortSignal.timeout(285000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new StudioUploadError(result.error?.message || "La vérification vidéo a échoué. Réessayez.");
}
