import { Upload } from "tus-js-client";
import { getSupabaseBrowserClient, getSupabaseConfiguration } from "@/lib/supabase/client";

export class StudioUploadError extends Error {}

/** Chunked transfer retries network interruptions without restarting the whole video. */
export async function uploadStudioVideo(file: File, path: string, onProgress: (percent: number) => void) {
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
      metadata: { bucketName: "provider-social-media", objectName: path, contentType: file.type, cacheControl: "31536000" },
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      retryDelays: [0, 1500, 3000, 5000, 10000],
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(total ? Math.round(sent * 100 / total) : 0),
      onSuccess: () => { window.clearTimeout(deadline); resolve(); },
      onError: () => { window.clearTimeout(deadline); reject(new StudioUploadError("L’envoi a été interrompu. Votre vidéo et vos champs sont conservés ; vérifiez la connexion puis réessayez.")); },
    });
    const deadline = window.setTimeout(() => {
      void upload.abort().finally(() => reject(new StudioUploadError("L’envoi prend trop de temps. Votre sélection est conservée ; vérifiez la connexion puis réessayez.")));
    }, 15 * 60 * 1000);
    upload.start();
  });
}
