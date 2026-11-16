"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import styles from "./profile-story-ring.module.css";

type Story = {
  id: string; providerId: string; name: string; mediaType: "photo" | "video";
  caption: string; expiresAt: string; url: string;
};

const cached = new Map<string, { expires: number; story: Story | null }>();
const ongoing = new Map<string, Promise<Story | null>>();
async function fetchStory(id: string): Promise<Story | null> {
  const cache = cached.get(id);
  if (cache && cache.expires > Date.now()) return cache.story;
  const existing = ongoing.get(id);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch(`/api/public/stories?providers=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { stories?: Story[] };
    const story = (data.stories ?? []).find(item => item.providerId === id && Date.parse(item.expiresAt) > Date.now()) ?? null;
    cached.set(id, { story, expires: Date.now() + 60_000 });
    return story;
  })().catch(() => null).finally(() => { ongoing.delete(id); });
  ongoing.set(id, request);
  return request;
}

/** A profile avatar is a status entry point anywhere the same professional appears. */
export function ProfileStoryRing({
  providerId, name, className, children, onOpenProfile, href,
}: {
  providerId: string; name: string; className?: string;
  children: ReactNode; onOpenProfile?: () => void; href?: string;
}) {
  const [story, setStory] = useState<Story | null>(null);
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => { void fetchStory(providerId).then(result => { if (alive) setStory(result); }); };
    const initial = window.setTimeout(load, 0);
    const onFocus = () => { cached.delete(providerId); load(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("mata:stories:updated", onFocus);
    return () => { alive = false; window.clearTimeout(initial); window.removeEventListener("focus", onFocus); window.removeEventListener("mata:stories:updated", onFocus); };
  }, [providerId]);
  useEffect(() => {
    if (!story) return;
    const remainingMs = Date.parse(story.expiresAt) - Date.now();
    const expiry = window.setTimeout(() => {
      cached.delete(providerId);
      setStory(null);
      setViewing(false);
    }, Math.max(0, remainingMs));
    return () => window.clearTimeout(expiry);
  }, [providerId, story]);
  const active = story !== null;
  return <>
    {href ? <a href={href} className={`${className ?? ""} ${styles.avatarButton} ${active ? styles.active : ""}`}
      aria-label={active ? `Voir le statut de ${name}` : "Mon profil et mes paramètres"}
      onClick={event => {
        if (active) { event.preventDefault(); event.stopPropagation(); setViewing(true); }
        else if (onOpenProfile) { event.preventDefault(); onOpenProfile(); }
      }}>{children}</a>
      : <button type="button" className={`${className ?? ""} ${styles.avatarButton} ${active ? styles.active : ""}`}
      aria-label={active ? `Voir le statut de ${name}` : `Profil de ${name}`}
      onClick={event => {
        event.stopPropagation();
        if (active) setViewing(true);
        else onOpenProfile?.();
      }}>{children}</button>}
    {viewing && story && typeof document !== "undefined" && createPortal(
      <div className={styles.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setViewing(false); }}>
        <section role="dialog" aria-modal="true" aria-label={`Statut de ${name}`} className={styles.viewer}>
          <header><strong>{name}</strong><button type="button" aria-label="Fermer le statut" onClick={() => setViewing(false)}>×</button></header>
          {story.mediaType === "video"
            ? <video src={story.url} controls autoPlay playsInline className={styles.media} />
            : <Image src={story.url} width={640} height={960} unoptimized alt={story.caption || `Statut de ${name}`} className={styles.media} />}
          {story.caption && <p>{story.caption}</p>}
          {onOpenProfile && <button type="button" className={styles.profileAction} onClick={() => { setViewing(false); onOpenProfile(); }}>Voir le profil et réserver</button>}
        </section>
      </div>, document.body)}
  </>;
}
