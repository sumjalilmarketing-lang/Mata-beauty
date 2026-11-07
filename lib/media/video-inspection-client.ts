import { StudioUploadError } from "./video-upload-client";

export type StudioVideoInspection = { duration: number; aspectRatio: number; thumbnail: Blob };

function waitForFrame(video: HTMLVideoElement, event: "loadeddata" | "seeked", start: () => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", cancelled);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new StudioUploadError("L’aperçu vidéo ne peut pas être décodé. Votre sélection est conservée.")); };
    const cancelled = () => { cleanup(); reject(new StudioUploadError("Préparation annulée. Votre vidéo et vos champs sont conservés.")); };
    const timer = setTimeout(() => { cleanup(); reject(new StudioUploadError("La préparation de l’aperçu prend trop de temps. Réessayez.")); }, 20000);
    video.addEventListener(event, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", cancelled, { once: true });
    if (signal?.aborted) cancelled();
    else start();
  });
}

/** Receives normalized MP4; capture an actual frame and give Safari a poster. */
export async function inspectStudioVideo(file: File, signal?: AbortSignal): Promise<StudioVideoInspection> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    await waitForFrame(video, "loadeddata", () => {
      video.src = url;
      video.load();
      // Muted playback also requests decoding when mobile preload is restricted.
      void video.play().catch(() => {});
    }, signal);
    video.pause();
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) throw new StudioUploadError("La vidéo préparée ne contient pas de durée ou de dimensions lisibles.");
    await waitForFrame(video, "seeked", () => { video.currentTime = Math.min(0.1, duration / 2); }, signal);
    const canvas = document.createElement("canvas");
    canvas.width = 540;
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    const context = canvas.getContext("2d");
    if (!context) throw new StudioUploadError("La couverture vidéo ne peut pas être créée sur cet appareil.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new StudioUploadError("La couverture vidéo ne peut pas être créée.")), "image/jpeg", 0.84));
    if (signal?.aborted) throw new StudioUploadError("Préparation annulée. Votre vidéo et vos champs sont conservés.");
    return { duration, aspectRatio: video.videoWidth / video.videoHeight, thumbnail };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
