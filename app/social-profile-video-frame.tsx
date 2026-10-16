"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./public-social-profile.module.css";

export function SocialProfileVideoFrame({ videoUrl, thumbnailUrl }: {
  videoUrl: string | null;
  thumbnailUrl: string | null;
}) {
  const previewRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || isNearViewport || typeof IntersectionObserver === "undefined") {
      if (preview && typeof IntersectionObserver === "undefined") setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setIsNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(preview);
    return () => observer.disconnect();
  }, [isNearViewport]);

  useEffect(() => {
    if (!isNearViewport || frameReady || videoFailed || !videoUrl) return;
    const timeout = window.setTimeout(() => setVideoFailed(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [frameReady, isNearViewport, videoFailed, videoUrl]);

  function seekToPreviewFrame(video: HTMLVideoElement) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      setFrameReady(true);
      return;
    }
    const previewTime = Math.min(0.35, video.duration * 0.1);
    if (previewTime <= 0 || Math.abs(video.currentTime - previewTime) < 0.02) {
      setFrameReady(true);
      return;
    }
    video.currentTime = previewTime;
  }

  return <span ref={previewRef} className={styles.videoPreview} aria-hidden="true">
    {videoUrl && isNearViewport && !videoFailed && <video
      ref={videoRef}
      className={styles.videoFrame}
      src={videoUrl}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      onLoadedMetadata={event => seekToPreviewFrame(event.currentTarget)}
      onLoadedData={() => { if (videoRef.current && videoRef.current.currentTime === 0) setFrameReady(true); }}
      onSeeked={() => setFrameReady(true)}
      onError={() => setVideoFailed(true)}
      style={{ opacity: frameReady ? 1 : 0 }}
    />}
    {!frameReady && !videoFailed && <span className={styles.videoFramePlaceholder} aria-hidden="true">Chargement de l’aperçu…</span>}
    {(!videoUrl || videoFailed) && thumbnailUrl && <Image
      className={styles.videoCoverFallback}
      src={thumbnailUrl}
      alt=""
      fill
      sizes="(max-width: 760px) 33vw, 260px"
      unoptimized
    />}
    {(!videoUrl || videoFailed) && !thumbnailUrl && <span className={styles.videoFallback}>Aperçu<br/>indisponible</span>}
  </span>;
}

