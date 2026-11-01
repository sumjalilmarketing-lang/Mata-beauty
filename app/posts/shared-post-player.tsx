"use client";

import { useEffect, useRef, useState } from "react";
import { fetchPublicPostVideoMedia } from "@/lib/domain/public-post-video-media";

export function SharedPostPlayer({ postId }: { postId: string }) {
  const [media, setMedia] = useState<{ videoUrl: string; thumbnailUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const automaticRenewed = useRef(false);

  useEffect(() => {
    let active = true;
    void fetchPublicPostVideoMedia(postId).then(fresh => {
      if (!active) return;
      if (fresh) setMedia(fresh);
      else setError(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [postId, attempt]);

  function refresh() {
    if (automaticRenewed.current) {
      setMedia(null);
      setError(true);
      return;
    }
    automaticRenewed.current = true;
    setMedia(null);
    setLoading(true);
    setError(false);
    setAttempt(value => value + 1);
  }

  return (
    <div className="shared-post-video-wrap">
      {media && !error ? (
        <video
          key={media.videoUrl}
          src={media.videoUrl}
          poster={media.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          onError={() => void refresh()}
        />
      ) : (
        <div className="shared-post-video-fallback" role={error ? "alert" : "status"}>
          <p>{loading ? "Chargement de la vidéo…" : "Cette vidéo est momentanément indisponible."}</p>
          {!loading && <button type="button" onClick={() => { automaticRenewed.current = false; setLoading(true); setError(false); setAttempt(value => value + 1); }}>Réessayer</button>}
        </div>
      )}
    </div>
  );
}
