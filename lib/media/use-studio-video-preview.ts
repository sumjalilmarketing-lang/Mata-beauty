"use client";

import { useEffect, useRef, useState } from "react";
import { inspectStudioVideo, type StudioVideoInspection } from "./video-inspection-client";
import { nativePortableVideo } from "./native-video-client";
import { StudioUploadError } from "./video-upload-client";

type Preparation = { source: File; file?: File; url?: string; poster?: string; media?: StudioVideoInspection; busy: boolean; message: string };

/** Prepare before displaying: a selected phone container may not be browser-readable. */
export function useStudioVideoPreview(source: File | undefined) {
  const [result, setResult] = useState<Preparation | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!source) {
      const clear = setTimeout(() => setResult(null), 0);
      return () => clearTimeout(clear);
    }
    let live = true;
    let url: string | undefined;
    let poster: string | undefined;
    const abort = new AbortController();
    controller.current = abort;
    void (async () => {
      await Promise.resolve();
      if (!live) return;
      setResult({ source, busy: true, message: "Préparation de l’aperçu vidéo…" });
      try {
        let file = await nativePortableVideo(source, abort.signal);
        if (!live) return;
        let media: StudioVideoInspection | undefined;
        if (file) {
          try { media = await inspectStudioVideo(file, abort.signal); }
          catch (error) { if (abort.signal.aborted) throw error; file = null; }
        }
        if (!live) return;
        if (!file) {
          const { convertStudioVideo } = await import("./video-conversion-client");
          if (!live) return;
          file = await convertStudioVideo(source, message => {
            if (live) setResult({ source, busy: true, message });
          }, abort.signal);
        }
        if (!live) return;
        media ??= await inspectStudioVideo(file, abort.signal);
        if (!live) return;
        url = URL.createObjectURL(file);
        poster = URL.createObjectURL(media.thumbnail);
        setResult({ source, file, url, poster, media, busy: false, message: "Aperçu prêt. Vous pouvez lire la vidéo avant de publier." });
      } catch (error) {
        if (live) setResult({ source, busy: false, message: abort.signal.aborted ? "Préparation annulée. Votre vidéo et vos champs sont conservés." : error instanceof StudioUploadError ? error.message : "L’aperçu n’a pas pu être préparé. Votre vidéo et vos champs sont conservés ; réessayez." });
      }
    })();
    return () => {
      live = false;
      abort.abort();
      if (controller.current === abort) controller.current = null;
      if (url) URL.revokeObjectURL(url);
      if (poster) URL.revokeObjectURL(poster);
    };
  }, [source, attempt]);
  const current = source && result?.source === source ? result : null;
  return {
    file: current?.file,
    url: current?.url,
    poster: current?.poster,
    media: current?.media,
    busy: Boolean(source && (!current || current.busy)),
    message: source ? current?.message ?? "Préparation de l’aperçu vidéo…" : "",
    cancel: () => controller.current?.abort(),
    retry: () => setAttempt(value => value + 1),
    fail: () => { if (source) setResult({ source, busy: false, message: "L’aperçu préparé ne peut pas être lu. Réessayez la préparation." }); },
  };
}
