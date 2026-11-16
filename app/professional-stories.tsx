"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadStudioVideo } from "@/lib/media/video-upload-client";
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
const MAX_VIDEO_MB = 50;
const MAX_PHOTO_MB = 20;
type StoryProfile = Pick<Story, "providerId" | "name" | "avatar">;
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

export function ProfessionalStories({ userId, canPublish, followed, onOpenProvider }: {
  userId?: string | null; canPublish: boolean; followed: ReadonlySet<string>; onOpenProvider: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [profiles, setProfiles] = useState<StoryProfile[]>([]);
  const [selected, setSelected] = useState<Story | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const scope = userId ? [...new Set([...(canPublish ? [userId] : []), ...followed])].join(",") : "";
  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!scope) return;
    try {
      const batches = scope.match(/[^,]+(?:,[^,]+){0,39}/g) ?? [];
      const results = await Promise.all(batches.map(async batch => {
        const response = await fetch(`/api/public/stories?providers=${encodeURIComponent(batch)}`, { cache: "no-store", signal });
        if (!response.ok) throw new Error("Statuts indisponibles.");
        return await response.json() as { stories?: Story[]; profiles?: StoryProfile[] };
      }));
      if (signal?.aborted) return;
      setProfiles(results.flatMap(result => result.profiles ?? []));
      setStories(results.flatMap(result => result.stories ?? []).filter(story => Date.parse(story.expiresAt) > Date.now()));
    } catch { /* Inspiration remains usable if statuses are unavailable. */ }
  }, [scope]);
  useEffect(() => {
    const requests = new AbortController();
    const initial = window.setTimeout(() => { void reload(requests.signal); }, 0);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload(requests.signal);
    }, 90_000);
    const onVisible = () => { if (document.visibilityState === "visible") void reload(requests.signal); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requests.abort();
      window.clearTimeout(initial);
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setStories(current => {
        const active = current.filter(story => Date.parse(story.expiresAt) > now);
        return active.length === current.length ? current : active;
      });
      setSelected(current => current && Date.parse(current.expiresAt) <= now ? null : current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function clearDraft() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null; setPreview(""); setFile(null); setCaption(""); setError("");
  }

  async function pickFile(chosen?: File) {
    if (!chosen) return;
    setError("");
    if (!extForMime[chosen.type]) { setError("Format non accepté. Choisissez une photo ou une vidéo MP4, WebM ou MOV."); return; }
    const limit = chosen.type.startsWith("video/") ? MAX_VIDEO_MB : MAX_PHOTO_MB;
    if (chosen.size > limit * 1024 * 1024) { setError(`La taille maximale pour ce fichier est de ${limit} Mo.`); return; }
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
      if (file.type.startsWith("video/")) {
        await uploadStudioVideo(file, path, () => {}, { bucket: "professional-stories" });
      } else {
        const uploaded = await client.storage.from("professional-stories").upload(path, file, {
          contentType: file.type, upsert: false, cacheControl: "60",
        });
        if (uploaded.error) throw new Error("Le téléversement a échoué. Vérifiez votre accès professionnel.");
      }
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

  async function deleteStory(story: Story) {
    if (!userId || story.providerId !== userId || removing) return;
    const client = getSupabaseBrowserClient();
    if (!client) { setError("Connexion momentanément indisponible."); return; }
    setRemoving(true); setError("");
    try {
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || identity.user?.id !== userId)
        throw new Error("Reconnectez-vous pour supprimer votre statut.");
      const ownerRow = await client.from("professional_stories").select("media_path")
        .eq("id", story.id).eq("provider_id", userId).maybeSingle();
      if (ownerRow.error || !ownerRow.data?.media_path)
        throw new Error("Statut introuvable ou accès refusé.");
      // Remove the private file first. If the following row deletion fails,
      // its public URL can no longer be signed and the expiry job removes the row.
      const fileRemoval = await client.storage.from("professional-stories").remove([ownerRow.data.media_path]);
      if (fileRemoval.error) throw new Error("Impossible de supprimer le média du statut.");
      const rowRemoval = await client.from("professional_stories").delete()
        .eq("id", story.id).eq("provider_id", userId);
      if (rowRemoval.error) throw new Error("Média supprimé, mais la suppression du statut doit être réessayée.");
      setSelected(null);
      setStories(current => current.filter(item => item.id !== story.id));
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally { setRemoving(false); }
  }

  const latest = new Map([...stories].reverse().map(story => [story.providerId, story]));
  const ownProfile = profiles.find(profile => profile.providerId === userId);
  const ownStory = userId ? latest.get(userId) : undefined;
  const followedProfiles = profiles.filter(profile => profile.providerId !== userId && followed.has(profile.providerId));
  const viewing = selected && userId && (selected.providerId === userId || followed.has(selected.providerId)) ? selected : null;
  if (!userId || (!canPublish && followedProfiles.length === 0)) return null;
  return <section className={styles.strip} aria-label="Statuts des professionnels">
    <div className={styles.rail}>
      {canPublish && <div className={styles.own}>
        <button type="button" className={styles.item} aria-label={ownStory ? "Voir mon statut" : "Mon profil"}
          onClick={() => ownStory ? setSelected(ownStory) : onOpenProvider(userId)}>
          <span className={ownStory ? styles.ring : styles.plain}><ProfilePhoto profile={ownProfile} /></span>
          <small>Mon statut</small>
        </button>
        <button type="button" className={styles.plus} aria-label="Publier un statut" onClick={() => fileInput.current?.click()}>+</button>
      </div>}
      <input ref={fileInput} className={styles.hidden} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
        onChange={event => { void pickFile(event.target.files?.[0]); event.target.value = ""; }} aria-label="Choisir une photo ou vidéo pour votre statut" />
      {followedProfiles.map(profile => {
        const story = latest.get(profile.providerId);
        return <button key={profile.providerId} type="button" className={styles.item}
          aria-label={story ? `Voir le statut de ${profile.name}` : `Voir le profil de ${profile.name}`}
          onClick={() => { setError(""); if (story) setSelected(story); else onOpenProvider(profile.providerId); }}>
          <span className={story ? styles.ring : styles.plain}><ProfilePhoto profile={profile} /></span>
          <small>{profile.name}</small>
        </button>;
      })}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {preview && file && typeof document !== "undefined" && createPortal(<div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Publier mon statut">
      <div className={styles.viewer}>
        <header><strong>Aperçu du statut</strong><button type="button" onClick={clearDraft} disabled={busy} aria-label="Fermer">×</button></header>
        {file.type.startsWith("video/") ? <video controls playsInline src={preview} className={styles.media} /> :
          <Image src={preview} alt="Aperçu de votre photo" width={600} height={900} unoptimized className={styles.media} />}
        <input placeholder="Ajouter un texte (facultatif)" value={caption} maxLength={160} onChange={event => setCaption(event.target.value)} />
        <button type="button" disabled={busy} className={styles.publish} onClick={() => void publish()}>{busy ? "Publication…" : "Publier · 24 h"}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>, document.body)}
    {viewing && typeof document !== "undefined" && createPortal(<div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Statut de ${viewing.name}`}>
      <div className={styles.viewer}>
        <header><strong>{viewing.name}</strong><button type="button" onClick={() => setSelected(null)} aria-label="Fermer le statut">×</button></header>
        {viewing.mediaType === "video" ? <video key={viewing.id} src={viewing.url} className={styles.media} controls autoPlay playsInline /> :
          <Image src={viewing.url} alt={viewing.caption || "Photo du statut"} width={600} height={900} unoptimized className={styles.media} />}
        {viewing.caption && <p>{viewing.caption}</p>}
        {userId === viewing.providerId && <button type="button" disabled={removing}
          onClick={() => void deleteStory(viewing)} aria-label="Supprimer mon statut">
          {removing ? "Suppression…" : "Supprimer mon statut"}
        </button>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button className={styles.publish} type="button" onClick={() => { setSelected(null); onOpenProvider(viewing.providerId); }}>Voir le profil et réserver</button>
      </div>
    </div>, document.body)}
  </section>;
}

function ProfilePhoto({ profile }: { profile?: StoryProfile }) {
  return profile?.avatar
    ? <Image src={profile.avatar} alt="" width={58} height={58} unoptimized className={styles.photo} />
    : <span className={styles.initials}>{profile?.name.slice(0, 2).toUpperCase() || "MO"}</span>;
}
