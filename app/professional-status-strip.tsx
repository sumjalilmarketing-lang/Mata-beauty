"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthenticatedProfile } from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./professional-status-strip.module.css";

const BUCKET = "professional-status-media";
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

type StatusMedia = "image" | "video";
type StatusFormat = "jpg" | "mp4" | "mov" | "webm";
type StatusRow = {
  id: string;
  provider_id: string;
  media_kind: StatusMedia;
  media_format: StatusFormat;
  media_path: string;
  caption: string;
  created_at: string;
  expires_at: string;
  business_name: string;
  slug: string | null;
  city: string | null;
  avatar_url: string | null;
};

function videoFormat(file: File): { format: Exclude<StatusFormat, "jpg">; mime: string } | null {
  const suffix = file.name.toLowerCase().split(".").at(-1);
  if (file.type === "video/mp4" || (file.type === "" && suffix === "mp4")) return { format: "mp4", mime: "video/mp4" };
  if (file.type === "video/quicktime" || (file.type === "" && suffix === "mov")) return { format: "mov", mime: "video/quicktime" };
  if (file.type === "video/webm" || (file.type === "" && suffix === "webm")) return { format: "webm", mime: "video/webm" };
  return null;
}

function isPhoto(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function jpegPhoto(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Cette photo ne peut pas être ouverte. Choisissez un autre fichier."));
    });
    const scale = Math.min(1, 1080 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("La préparation de cette photo a échoué.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .86));
    if (!blob) throw new Error("La conversion de cette photo a échoué.");
    return new File([blob], "statut.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function validateVideoDuration(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  const element = document.createElement("video");
  element.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Impossible de lire la durée de cette vidéo.")), 12000);
      element.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        if (!Number.isFinite(element.duration) || element.duration <= 0 || element.duration > MAX_VIDEO_SECONDS) {
          reject(new Error("Choisissez une vidéo de 30 secondes maximum."));
        } else resolve();
      };
      element.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Cette vidéo n'est pas lisible sur votre appareil. Essayez un fichier MP4."));
      };
      element.src = url;
    });
  } finally {
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(url);
  }
}

function matchesNow(row: StatusRow) {
  const now = Date.now();
  return Date.parse(row.created_at) <= now && Date.parse(row.expires_at) > now;
}

export function ProfessionalStatusStrip({
  authenticated, onOpenProvider,
}: {
  authenticated: AuthenticatedProfile | null;
  onOpenProvider: (providerId: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [signedUrl, setSignedUrl] = useState("");
  const [loadingMedia, setLoadingMedia] = useState(false);

  const refresh = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data, error: queryError } = await client
      .from("active_professional_statuses")
      .select("id,provider_id,media_kind,media_format,media_path,caption,created_at,expires_at,business_name,slug,city,avatar_url")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!queryError) setStatuses(((data ?? []) as StatusRow[]).filter(matchesNow));
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client || !authenticated?.roles.includes("provider")) {
      queueMicrotask(() => { setCanPublish(false); setMyAvatar(null); });
      return;
    }
    let active = true;
    void Promise.all([
      client.from("provider_profiles").select("status").eq("profile_id", authenticated.userId).maybeSingle(),
      client.from("profiles").select("avatar_url,is_suspended").eq("id", authenticated.userId).maybeSingle(),
    ]).then(([business, profile]) => {
      if (!active) return;
      setCanPublish(!business.error && !profile.error &&
        business.data?.status === "approved" && profile.data?.is_suspended === false);
      setMyAvatar(profile.data?.avatar_url ?? null);
    }).catch(() => { if (active) setCanPublish(false); });
    return () => { active = false; };
  }, [authenticated]);

  const groups = useMemo(() => {
    const byProvider = new Map<string, StatusRow[]>();
    statuses.filter(matchesNow).forEach(status => {
      const group = byProvider.get(status.provider_id) ?? [];
      group.push(status);
      byProvider.set(status.provider_id, group);
    });
    return byProvider;
  }, [statuses]);
  const group = provider ? groups.get(provider) ?? [] : [];
  const current = group[index];
  const firstStatuses = [...groups.values()].map(items => items[0]);

  useEffect(() => {
    if (!current) { setSignedUrl(""); return; }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let live = true;
    queueMicrotask(() => { if (live) { setSignedUrl(""); setLoadingMedia(true); } });
    void client.storage.from(BUCKET).createSignedUrl(current.media_path, 90)
      .then(({ data, error: signError }) => {
        if (!live) return;
        if (!signError && data?.signedUrl) setSignedUrl(data.signedUrl);
        else setError("Ce statut n'a pas pu être chargé.");
      })
      .catch(() => { if (live) setError("Impossible de lire ce statut."); })
      .finally(() => { if (live) setLoadingMedia(false); });
    return () => { live = false; };
  }, [current?.id, current?.media_path]);

  const next = useCallback(() => {
    if (index + 1 >= group.length) { setProvider(null); setIndex(0); setSignedUrl(""); }
    else { setIndex(index + 1); setError(""); }
  }, [group.length, index]);

  useEffect(() => {
    if (!provider || current?.media_kind !== "image" || !signedUrl) return;
    const timer = window.setTimeout(next, 6000);
    return () => window.clearTimeout(timer);
  }, [provider, current?.id, current?.media_kind, signedUrl, next]);

  useEffect(() => {
    if (!provider && !selectedFile) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setProvider(null); setSelectedFile(null); setError(""); }
      if (event.key === "ArrowRight" && provider) next();
      if (event.key === "ArrowLeft" && provider) setIndex(value => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [provider, selectedFile, next]);

  useEffect(() => {
    if (!selectedFile) { queueMicrotask(() => setPreviewUrl("")); return; }
    const url = URL.createObjectURL(selectedFile);
    queueMicrotask(() => setPreviewUrl(url));
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  async function publish() {
    if (!selectedFile || !authenticated || !canPublish || publishing) return;
    setError("");
    setPublishing(true);
    const client = getSupabaseBrowserClient();
    if (!client) { setError("Connexion indisponible."); setPublishing(false); return; }
    let path = "";
    try {
      if (selectedFile.size > MAX_BYTES) throw new Error("Le fichier dépasse 20 Mo.");
      const kind: StatusMedia = isPhoto(selectedFile) ? "image" : "video";
      const video = kind === "video" ? videoFormat(selectedFile) : null;
      if (kind === "video" && !video) throw new Error("Choisissez une vidéo MP4, MOV ou WebM.");
      const media = kind === "image" ? await jpegPhoto(selectedFile) : selectedFile;
      if (kind === "video") await validateVideoDuration(media);
      if (media.size > MAX_BYTES) throw new Error("Le fichier préparé dépasse 20 Mo.");
      const format = kind === "image" ? "jpg" : video!.format;
      const mime = kind === "image" ? "image/jpeg" : video!.mime;
      const id = crypto.randomUUID();
      path = `${authenticated.userId}/${id}.${format}`;
      const upload = await client.storage.from(BUCKET).upload(path, media, {
        contentType: mime, upsert: false, cacheControl: "3600",
      });
      if (upload.error) throw new Error("Le transfert a échoué. Vérifiez votre connexion et votre accès professionnel.");
      const inserted = await client.from("professional_statuses").insert({
        id, provider_id: authenticated.userId, media_kind: kind,
        media_format: format, media_path: path, caption: caption.trim().slice(0, 180),
      });
      if (inserted.error) throw new Error("Publication refusée. Le fichier ne sera pas conservé.");
      setSelectedFile(null);
      setCaption("");
      setError("");
      await refresh();
    } catch (cause) {
      if (path) await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Impossible de publier le statut.");
    } finally { setPublishing(false); }
  }

  async function removeOwnStatus() {
    if (!authenticated || !current || current.provider_id !== authenticated.userId || deleting) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setDeleting(true);
    setError("");
    try {
      const removed = await client.storage.from(BUCKET).remove([current.media_path]);
      if (removed.error) throw new Error("Impossible de retirer cette vidéo ou photo.");
      const deleted = await client.from("professional_statuses").delete()
        .eq("id", current.id).eq("provider_id", authenticated.userId);
      if (deleted.error) throw new Error("Le statut n'a pas pu être retiré. Réessayez.");
      setProvider(null); setIndex(0);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La suppression a échoué.");
    } finally { setDeleting(false); }
  }

  function openStatus(id: string) {
    setProvider(id); setIndex(0); setError("");
  }
  function closeDialog() {
    if (publishing) return;
    setSelectedFile(null); setCaption(""); setProvider(null); setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  if (!canPublish && !firstStatuses.length) return null;

  return <>
    <nav className={styles.strip} aria-label="Statuts des professionnels">
      {canPublish && <button type="button" className={styles.entry}
        aria-label="Ajouter mon statut photo ou vidéo" onClick={() => fileInput.current?.click()}>
        <span className={`${styles.ring} ${styles.ringOwn}`}>
          <span className={styles.avatar}>
            {myAvatar ? <Image src={myAvatar} width={64} height={64} alt="" unoptimized /> : "Moi"}
          </span>
          <span className={styles.plus} aria-hidden="true">+</span>
        </span><span className={styles.name}>Mon statut</span>
      </button>}
      {firstStatuses.map(row =>
        <button type="button" className={styles.entry} key={row.provider_id}
          aria-label={`Voir les statuts de ${row.business_name}`} onClick={() => openStatus(row.provider_id)}>
          <span className={styles.ring}><span className={styles.avatar}>
            {row.avatar_url ? <Image src={row.avatar_url} width={64} height={64} alt="" unoptimized />
              : row.business_name.slice(0, 1).toUpperCase()}
          </span></span>
          <span className={styles.name}>{row.business_name}</span>
        </button>
      )}
    </nav>
    <input ref={fileInput} type="file" accept="image/*,video/mp4,video/quicktime,video/webm"
      aria-label="Choisir une photo ou une vidéo" hidden onChange={event => {
        const nextFile = event.currentTarget.files?.[0];
        if (nextFile) { setError(""); setSelectedFile(nextFile); }
      }} />

    {selectedFile && <div className={styles.backdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Publier mon statut">
        <div className={styles.top}><strong>Mon statut</strong><button className={styles.close}
          type="button" aria-label="Fermer" disabled={publishing} onClick={closeDialog}>×</button></div>
        <div className={styles.media}>
          {isPhoto(selectedFile)
            ? (previewUrl ? <Image src={previewUrl} width={420} height={620} unoptimized alt="Aperçu de la photo" /> : <p>Préparation de la photo…</p>)
            : (previewUrl ? <video src={previewUrl} controls playsInline aria-label="Aperçu de la vidéo" /> : <p>Préparation de la vidéo…</p>)}
        </div>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void publish(); }}>
          <label>Ajouter un message (facultatif)<input type="text" value={caption} maxLength={180}
            onChange={event => setCaption(event.target.value)} placeholder="Ex. Rendez-vous disponibles aujourd'hui" /></label>
          <p className={styles.hint}>Visible pendant 24 h · vidéo de 30 s maximum · 20 Mo maximum</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}><button className={styles.action} type="button"
            disabled={publishing} onClick={() => fileInput.current?.click()}>Changer</button>
            <button className={styles.primary} disabled={publishing} type="submit">
              {publishing ? "Publication…" : "Publier"}</button>
          </div>
        </form>
      </section>
    </div>}

    {provider && current && !selectedFile && <div className={styles.backdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true"
        aria-label={`Statut de ${current.business_name}`}>
        <div className={styles.progress}><span style={{ width: `${((index + 1) / group.length) * 100}%` }} /></div>
        <header className={styles.top}><strong>{current.business_name}</strong>
          <button type="button" className={styles.close} aria-label="Fermer le statut"
            onClick={closeDialog}>×</button></header>
        <div className={styles.media}>
          {loadingMedia ? <p role="status">Chargement du statut…</p> :
            signedUrl ? (current.media_kind === "video" ?
              <video src={signedUrl} autoPlay playsInline controls onEnded={next}
                aria-label={`Vidéo de ${current.business_name}`} />
              : <Image src={signedUrl} unoptimized width={420} height={620}
                  alt={current.caption || `Photo de ${current.business_name}`} />)
              : <p role="alert">{error || "Statut indisponible."}</p>}
        </div>
        {current.caption && <p className={styles.caption}>{current.caption}</p>}
        <footer className={styles.footer}>
          <button type="button" className={styles.action} onClick={() => {
            const id = current.provider_id; closeDialog(); onOpenProvider(id);
          }}>Voir le salon et réserver</button>
          {authenticated?.userId === current.provider_id && <button type="button"
            disabled={deleting} className={styles.action} onClick={() => void removeOwnStatus()}>
            {deleting ? "Suppression…" : "Supprimer"}
          </button>}
          <button type="button" className={styles.action} onClick={next}>
            {index + 1 === group.length ? "Terminer" : "Suivant"}
          </button>
        </footer>
      </section>
    </div>}
  </>;
}
