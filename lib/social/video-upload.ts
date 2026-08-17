export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 90;
export const MAX_VIDEO_HASHTAGS = 10;

export type VideoUploadFormat = {
  extension: "mp4" | "mov" | "webm";
  contentType: "video/mp4" | "video/quicktime" | "video/webm";
};

type FileDescriptor = { name: string; type: string; size: number };
type ErrorLike = { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown };

const MIME_FORMATS: Record<string, VideoUploadFormat> = {
  "video/mp4": { extension: "mp4", contentType: "video/mp4" },
  "video/x-m4v": { extension: "mp4", contentType: "video/mp4" },
  "video/webm": { extension: "webm", contentType: "video/webm" },
  "video/quicktime": { extension: "mov", contentType: "video/quicktime" },
};

const EXTENSION_FORMATS: Record<string, VideoUploadFormat> = {
  mp4: MIME_FORMATS["video/mp4"],
  m4v: MIME_FORMATS["video/mp4"],
  mov: MIME_FORMATS["video/quicktime"],
  webm: MIME_FORMATS["video/webm"],
};

/** Les navigateurs mobiles peuvent fournir un type vide ou générique malgré un fichier valide. */
export function resolveVideoUploadFormat(file: FileDescriptor): VideoUploadFormat | null {
  const mime = file.type.trim().toLowerCase().split(";", 1)[0];
  if (MIME_FORMATS[mime]) return MIME_FORMATS[mime];
  if (mime && mime !== "application/octet-stream") return null;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return EXTENSION_FORMATS[extension] ?? null;
}

export function validateVideoUpload(file: FileDescriptor) {
  const format = resolveVideoUploadFormat(file);
  if (!format) return { ok: false as const, message: "Format vidéo non pris en charge." };
  if (file.size > MAX_VIDEO_BYTES) return { ok: false as const, message: "Vidéo trop volumineuse. Taille maximale : 100 Mo." };
  return { ok: true as const, format };
}

export function validateVideoDuration(durationSeconds: number) {
  return Number.isFinite(durationSeconds) && durationSeconds >= 1 && durationSeconds <= MAX_VIDEO_DURATION_SECONDS
    ? { ok: true as const }
    : { ok: false as const, message: `La vidéo doit durer entre 1 et ${MAX_VIDEO_DURATION_SECONDS} secondes.` };
}

export function parseVideoHashtags(value: string) {
  return [...new Set(value
    .split(/[\s,]+/)
    .map((tag) => tag.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/^#/, "").replace(/[^a-z0-9_]/g, ""))
    .filter((tag) => tag.length >= 2 && tag.length <= 50))]
    .slice(0, MAX_VIDEO_HASHTAGS);
}

/** Traduit les erreurs Storage/RPC sans exposer les détails SQL au navigateur. */
export function videoPublishErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Impossible d’enregistrer la publication. Réessayez.";
  const value = error as ErrorLike;
  const code = typeof value.code === "string" ? value.code.toLowerCase() : "";
  const message = typeof value.message === "string" ? value.message.toLowerCase() : "";
  const status = typeof value.status === "number" ? value.status : typeof value.statusCode === "number" ? value.statusCode : Number(code);

  if (status === 401 || code.includes("jwt") || message.includes("session") || message.includes("authentification requise")) return "Votre session a expiré. Reconnectez-vous.";
  if (status === 403 || code === "42501" || message.includes("row-level security") || message.includes("non autoris") || message.includes("permission")) return "Vous n’êtes pas autorisé à publier.";
  if (status === 413 || message.includes("too large") || message.includes("payload") || message.includes("taille maximale")) return "Vidéo trop volumineuse. Taille maximale : 100 Mo.";
  if (status === 409 || message.includes("duplicate") || message.includes("already exists")) return "Un envoi identique existe déjà. Réessayez.";
  if (message.includes("mime") || message.includes("format") || message.includes("codec") || message.includes("analys")) return "Format vidéo non pris en charge.";
  if (code === "abort" || message.includes("abort") || message.includes("interromp") || message.includes("network") || message.includes("fetch")) return "L’envoi a été interrompu. Vérifiez votre connexion et réessayez.";
  if (message.includes("storage") || message.includes("object")) return "Impossible d’envoyer la vidéo. Réessayez.";
  return "Impossible d’enregistrer la publication. Réessayez.";
}
