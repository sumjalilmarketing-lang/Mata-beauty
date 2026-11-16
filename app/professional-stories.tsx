"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./professional-stories.module.css";

type Story = {
  id: string; providerId: string; name: string; avatar: string | null; city: string | null;
  countryCode: string | null; mediaType: "photo" | "video"; caption: string;
  createdAt: string; expiresAt: string; url: string;
};

const extForMime: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

async function checkVideoLength(file: File) {
  if (!file.type.startsWith("video/")) return;
  const temporaryUrl = URL.createObjectURL(file);
  try {
    const seconds = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Vidéo illisible."));
      video.src = temporaryUrl;
    });
    if (!Number.isFinite(seconds) || seconds > MAX_VIDEO_SECONDS)
      throw new Error("La vidéo doit durer au maximum 30 secondes.");
  } finally { URL.revokeObjectURL(temporaryUrl); }
}

export function ProfessionalStories({ userId, canPublish, onOpenProvider }: {
  userId?: string | null; canPublish: boolean; onOpenProvider: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [selected, setSelected] = useState<Story | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    try {
      const response = await fetch("/api/public/stories", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { stories?: Story[] };
      setStories((result.stories ?? []).filter(story => Date.parse(story.expiresAt) > Date.now()));
    } catch { /* Inspiration remains usable if statuses are unavailable. */ }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void reload(); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function clearDraft() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null; setPreview(""); setFile(null); setCaption(""); setError("");
  }

  async function pickFile(chosen?: File) {
    if (!chosen) return;
    setError("");
    if (!extForMime[chosen.type]) { setError("Format non accepté. Choisissez une photo ou une vidéo MP4, WebM ou MOV."); return; }
    if (chosen.size > MAX_MEDIA_BYTES) { setError("La taille maximale du statut est de 20 Mo."); return; }
    try { await checkVideoLength(chosen); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Vidéo invalide."); return; }
    clearDraft();
    const url = URL.createObjectURL(chosen);
    previewUrl.current = url; setPreview(url); setFile(chosen);
  }

  async function publish() {
    if (!file || !userId || busy) return;
    const client = getSupabaseBrowserClient();
    if (!client) { setError("Connexion momentanément indisponible."); return; }
    setBusy(true); setError("");
    const path = `${userId}/${crypto.randomUUID()}.${extForMime[file.type]}`;
    try {
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || identity.user?.id !== userId) throw new Error("Reconnectez-vous pour publier.");
      const uploaded = await client.storage.from("professional-stories").upload(path, file, {
        contentType: file.type, upsert: false, cacheControl: "60",
      });
      if (uploaded.error) throw new Error("Le téléversement a échoué. Vérifiez votre accès professionnel.");
      const created = await client.from("professional_stories").insert({
        provider_id: userId, media_path: path, media_type: file.type.startsWith("video/") ? "video" : "photo",
        caption: caption.trim().slice(0, 160),
      });
      if (created.error) {
        await client.storage.from("professional-stories").remove([path]);
        throw new Error("Publication impossible. Vérifiez la validation de votre profil.");
      }
      clearDraft();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Publication impossible.");
    } finally { setBusy(false); }
  }

  const grouped = [...new Map(stories.map(story => [story.providerId, story])).values()];
  const viewing = selected;
  return <section className={styles.strip} aria-label="Statuts des professionnels">
    <div className={styles.rail}>
      {canPublish && <button type="button" className={styles.add} aria-label="Publier un statut" onClick={() => fileInput.current?.click()}>
        <span className={styles.avatar}>+</span><small>Mon statut</small>
      </button>}
      <input ref={fileInput} className={styles.hidden} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
        onChange={event => { void pickFile(event.target.files?.[0]); event.target.value = ""; }} aria-label="Choisir une photo ou vidéo pour votre statut" />
      {grouped.map(story => <button key={story.providerId} type="button" className={styles.item}
        aria-label={`Voir le statut de ${story.name}`} onClick={() => setSelected(story)}>
        <span className={styles.ring}>{story.avatar
          ? <Image src={story.avatar} alt="" width={58} height={58} unoptimized className={styles.photo} />
          : <span className={styles.initials}>{story.name.slice(0, 2).toUpperCase()}</span>}
        </span>
        <small>{story.name}</small>
      </button>)}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {preview && file && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Publier mon statut">
      <div className={styles.viewer}>
        <header><strong>Aperçu du statut</strong><button type="button" onClick={clearDraft} disabled={busy} aria-label="Fermer">×</button></header>
        {file.type.startsWith("video/") ? <video controls playsInline src={preview} className={styles.media} /> :
          <Image src={preview} alt="Aperçu de votre photo" width={600} height={900} unoptimized className={styles.media} />}
        <input placeholder="Ajouter un texte (facultatif)" value={caption} maxLength={160} onChange={event => setCaption(event.target.value)} />
        <button type="button" disabled={busy} className={styles.publish} onClick={() => void publish()}>{busy ? "Publication…" : "Publier · 24 h"}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>}
    {viewing && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Statut de ${viewing.name}`}>
      <div className={styles.viewer}>
        <header><strong>{viewing.name}</strong><button type="button" onClick={() => setSelected(null)} aria-label="Fermer le statut">×</button></header>
        {viewing.mediaType === "video" ? <video key={viewing.id} src={viewing.url} className={styles.media} controls autoPlay playsInline /> :
          <Image src={viewing.url} alt={viewing.caption || "Photo du statut"} width={600} height={900} unoptimized className={styles.media} />}
        {viewing.caption && <p>{viewing.caption}</p>}
        <button className={styles.publish} type="button" onClick={() => { setSelected(null); onOpenProvider(viewing.providerId); }}>Voir le profil et réserver</button>
      </div>
    </div>}
  </section>;
}
