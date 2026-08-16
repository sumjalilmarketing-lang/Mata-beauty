"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { validateVideoUpload, videoPublishErrorMessage, type VideoUploadFormat } from "@/lib/social/video-upload";

type ProviderService = { id: string; title: string; duration_minutes: number; price_amount: number; services: { categories: { name: string } | null } | null };
type PublishStatus = "draft" | "scheduled" | "published";
type ContentType = "video" | "photo" | "before_after" | "promotion" | "availability";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

type PublishPhase = "idle" | "analysing" | "uploading" | "processing" | "publishing" | "done";
type UploadError = Error & { code?: string; status?: number };

async function resolveVideoDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;

  // MediaRecorder WebM files can omit the duration from their initial metadata.
  // Chromium computes the real duration after a seek to the end of the blob.
  return new Promise<number>((resolve, reject) => {
    const events = ["durationchange", "timeupdate", "seeked", "progress"] as const;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("La durée de la vidéo ne peut pas être déterminée."));
    }, 10_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      events.forEach((eventName) => video.removeEventListener(eventName, finish));
    };
    const finish = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : Number.isFinite(video.currentTime) && video.currentTime > 0 && video.currentTime < 1e100
          ? video.currentTime
          : null;
      if (!duration) return;
      cleanup();
      resolve(duration);
    };
    events.forEach((eventName) => video.addEventListener(eventName, finish));
    video.currentTime = 1e101;
  });
}

function waitForSeek(video: HTMLVideoElement, targetTime: number) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Le traitement de la miniature a expiré.")); }, 5_000);
    const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener("seeked", onSeeked); video.removeEventListener("error", onError); };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("La miniature ne peut pas être extraite.")); };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = targetTime;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Miniature impossible à créer.")), "image/jpeg", 0.84));
}

async function fallbackThumbnail(aspectRatio: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 540;
  canvas.height = Math.max(540, Math.min(960, Math.round(canvas.width / aspectRatio)));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Miniature impossible à créer.");
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#4f0a3c"); gradient.addColorStop(1, "#db3f8d");
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff"; context.font = "700 36px sans-serif"; context.textAlign = "center";
  context.fillText("Mata Beauty", canvas.width / 2, canvas.height / 2);
  return canvasBlob(canvas);
}

async function inspectVideo(file: File, createThumbnail: boolean) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("La vidéo ne peut pas être analysée.")), 12_000);
      video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error("La vidéo ne peut pas être analysée.")); };
    });
    const duration = await resolveVideoDuration(video);
    if (duration < 1 || duration > 90) throw new Error("La vidéo doit durer entre 1 et 90 secondes.");
    if (!video.videoWidth || !video.videoHeight) throw new Error("Dimensions vidéo invalides.");
    const aspectRatio = video.videoWidth / video.videoHeight;
    if (!createThumbnail) return { duration, aspectRatio, thumbnail: null };
    try {
      const targetTime = Math.min(0.25, Math.max(0, duration / 4));
      if (targetTime > 0) await waitForSeek(video, targetTime);
      const canvas = document.createElement("canvas");
      canvas.width = 540;
      canvas.height = Math.round(canvas.width / aspectRatio);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Miniature impossible à créer.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return { duration, aspectRatio, thumbnail: await canvasBlob(canvas) };
    } catch {
      return { duration, aspectRatio, thumbnail: await fallbackThumbnail(aspectRatio) };
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadVideoObject(file: Blob, path: string, contentType: string, onProgress: (percent: number) => void) {
  const supabase = getSupabaseBrowserClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabase || !supabaseUrl || !anonKey) throw Object.assign(new Error("Votre session a expiré."), { code: "SESSION" });
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw Object.assign(new Error("Votre session a expiré."), { code: "SESSION" });
  const objectPath = path.split("/").map(encodeURIComponent).join("/");

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${supabaseUrl}/storage/v1/object/provider-social-media/${objectPath}`);
    request.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`);
    request.setRequestHeader("apikey", anonKey);
    request.setRequestHeader("Content-Type", contentType);
    request.setRequestHeader("cache-control", "max-age=31536000");
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => { if (event.lengthComputable && event.total > 0) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = () => reject(Object.assign(new Error("L’envoi a été interrompu."), { code: "NETWORK" } satisfies Partial<UploadError>));
    request.onabort = () => reject(Object.assign(new Error("L’envoi a été interrompu."), { code: "ABORT" } satisfies Partial<UploadError>));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { onProgress(100); resolve(); return; }
      let message = `Échec Storage (${request.status}).`;
      try { const payload = JSON.parse(request.responseText) as { message?: unknown; error?: unknown }; message = String(payload.message ?? payload.error ?? message); } catch { /* Réponse non JSON. */ }
      reject(Object.assign(new Error(message), { code: String(request.status), status: request.status } satisfies Partial<UploadError>));
    };
    request.send(file);
  });
}

export function VideoPublisher({ userId, providerApproved, onPublished }: { userId: string; providerApproved: boolean; onPublished: (postType: ContentType) => Promise<void> }) {
  const [services, setServices] = useState<ProviderService[]>([]);
  const [phase, setPhase] = useState<PublishPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [contentType, setContentType] = useState<ContentType>("video");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const mediaInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.from("provider_services").select("id,title,duration_minutes,price_amount,services(categories(name))").eq("provider_id", userId).eq("is_active", true).order("title").then(({ data }) => setServices((data ?? []) as unknown as ProviderService[]));
  }, [userId]);

  useEffect(() => () => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); }, [previewUrls]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || phase !== "idle") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const selectedType = String(values.get("contentType") ?? "video") as ContentType;
    const files = selectedType === "video" ? [values.get("video")].filter((item): item is File => item instanceof File && item.size > 0) : values.getAll("media").filter((item): item is File => item instanceof File && item.size > 0);
    const file = files[0];
    const status = String(values.get("status")) as PublishStatus;
    const serviceId = String(values.get("serviceId") ?? "");
    const consent = values.get("consent") === "on";
    const scheduledValue = String(values.get("scheduledFor") ?? "");
    const customThumbnail = values.get("thumbnail");
    let videoFormat: VideoUploadFormat | null = null;
    if (!file) { setFeedback(selectedType === "video" ? "Choisissez une vidéo." : "Choisissez au moins une image."); return; }
    if (selectedType === "video") {
      const validation = validateVideoUpload(file);
      if (!validation.ok) { setFeedback(validation.message); return; }
      videoFormat = validation.format;
    }
    if (selectedType === "video" && customThumbnail instanceof File && customThumbnail.size > 0 && (!IMAGE_TYPES.has(customThumbnail.type) || customThumbnail.size > 5 * 1024 * 1024)) { setFeedback("Miniature acceptée : JPEG, PNG ou WebP, 5 Mo maximum."); return; }
    if (selectedType !== "video" && files.some((item) => !IMAGE_TYPES.has(item.type) || item.size > MAX_IMAGE_BYTES)) { setFeedback("Images acceptées : JPEG, PNG ou WebP, 12 Mo maximum chacune."); return; }
    if (selectedType === "before_after" && files.length !== 2) { setFeedback("Sélectionnez exactement deux images : avant puis après."); return; }
    if (selectedType !== "video" && selectedType !== "before_after" && files.length > 10) { setFeedback("Un carrousel contient au maximum 10 images."); return; }
    if (status === "published" && !consent) { setFeedback("Confirmez le consentement de la personne filmée."); return; }
    if (status !== "draft" && !serviceId) { setFeedback("Associez une prestation avant de publier ou programmer."); return; }
    if (status === "scheduled" && !scheduledValue) { setFeedback("Choisissez une date de publication."); return; }

    let videoPath = "";
    let thumbnailPath = "";
    const mediaPaths: string[] = [];
    let completed = false;
    try {
      setFeedback("");
      setProgress(0);
      let error: { message: string } | null = null;
      if (selectedType === "video") {
        setPhase("analysing");
        const hasCustomThumbnail = customThumbnail instanceof File && customThumbnail.size > 0;
        const media = await inspectVideo(file, !hasCustomThumbnail);
        setProgress(8);
        const thumbnailBlob = hasCustomThumbnail ? customThumbnail : media.thumbnail ?? await fallbackThumbnail(media.aspectRatio);
        const thumbnailMime = customThumbnail instanceof File && customThumbnail.size > 0 ? customThumbnail.type : "image/jpeg";
        const extension = videoFormat!.extension;
        const thumbnailExtension = thumbnailMime === "image/png" ? "png" : thumbnailMime === "image/webp" ? "webp" : "jpg";
        const postId = crypto.randomUUID();
        videoPath = `${userId}/${postId}/video.${extension}`;
        thumbnailPath = `${userId}/${postId}/thumbnail.${thumbnailExtension}`;
        setPhase("uploading");
        await uploadVideoObject(file, videoPath, videoFormat!.contentType, (percent) => setProgress(8 + Math.round(percent * 0.72)));
        await uploadVideoObject(thumbnailBlob, thumbnailPath, thumbnailMime, (percent) => setProgress(80 + Math.round(percent * 0.1)));
        const videoUrl = supabase.storage.from("provider-social-media").getPublicUrl(videoPath).data.publicUrl;
        const thumbnailUrl = supabase.storage.from("provider-social-media").getPublicUrl(thumbnailPath).data.publicUrl;
        setPhase("processing");
        setProgress(92);
        setPhase("publishing");
        setProgress(96);
        ({ error } = await supabase.rpc("create_provider_video_post", {
          target_post_id: postId, target_title: String(values.get("title") ?? "").trim(), target_caption: String(values.get("caption") ?? "").trim(),
          target_video_path: videoPath, target_video_url: videoUrl, target_thumbnail_path: thumbnailPath, target_thumbnail_url: thumbnailUrl,
          target_duration_seconds: media.duration, target_aspect_ratio: media.aspectRatio,
          target_provider_service_id: serviceId || null, target_status: status,
          target_allow_comments: values.get("allowComments") === "on", target_client_consent: consent,
          target_scheduled_for: status === "scheduled" ? new Date(scheduledValue).toISOString() : null,
          target_visibility: String(values.get("visibility") ?? "public"),
          target_hashtags: String(values.get("hashtags") ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 10),
          target_location: String(values.get("location") ?? "").trim() || null,
          target_available_at: values.get("availableAt") ? new Date(String(values.get("availableAt"))).toISOString() : null,
        }));
      } else {
        setPhase("uploading");
        const mediaUrls: string[] = [];
        for (const image of files) {
          const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
          const path = `${userId}/${crypto.randomUUID()}.${extension}`;
          mediaPaths.push(path);
          const uploaded = await supabase.storage.from("provider-social-media").upload(path, image, { contentType: image.type, cacheControl: "31536000", upsert: false });
          if (uploaded.error) throw uploaded.error;
          mediaUrls.push(supabase.storage.from("provider-social-media").getPublicUrl(path).data.publicUrl);
        }
        setPhase("publishing");
        ({ error } = await supabase.rpc("create_social_media_post", {
          target_post_type: selectedType, target_title: String(values.get("title") ?? "").trim(), target_caption: String(values.get("caption") ?? "").trim(), target_media_urls: mediaUrls,
          target_provider_service_id: serviceId || null, target_status: status, target_allow_comments: values.get("allowComments") === "on", target_client_consent: consent,
          target_scheduled_for: status === "scheduled" ? new Date(scheduledValue).toISOString() : null, target_visibility: String(values.get("visibility") ?? "public"),
          target_hashtags: String(values.get("hashtags") ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 10), target_location: String(values.get("location") ?? "").trim() || null,
          target_available_at: values.get("availableAt") ? new Date(String(values.get("availableAt"))).toISOString() : null,
          target_discount: values.get("discount") ? Number(values.get("discount")) : null, target_promotion_ends_at: values.get("promotionEndsAt") ? new Date(String(values.get("promotionEndsAt"))).toISOString() : null,
          target_promotion_slots: values.get("promotionSlots") ? Number(values.get("promotionSlots")) : null,
        }));
      }
      if (error) throw error;
      completed = true;
      form.reset();
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      setContentType("video");
      setFeedback(status === "published" ? "Publication visible dans Inspiration." : status === "scheduled" ? "Publication programmée." : "Brouillon enregistré.");
      setPhase("done");
      setProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      await onPublished(selectedType);
    } catch (caught) {
      if (!completed) {
        if (videoPath) await supabase.storage.from("provider-social-media").remove([videoPath]);
        if (thumbnailPath) await supabase.storage.from("provider-social-media").remove([thumbnailPath]);
        if (mediaPaths.length) await supabase.storage.from("provider-social-media").remove(mediaPaths);
      }
      setFeedback(selectedType === "video" ? videoPublishErrorMessage(caught) : publicErrorMessage(caught, "La publication a échoué. Vérifiez le fichier et réessayez."));
    } finally {
      if (!completed) { setPhase("idle"); setProgress(0); }
    }
  }

  const idleLabel = contentType === "video" ? "Publier la vidéo" : "Publier le contenu";
  const busyLabel = phase === "analysing" ? "Analyse de la vidéo…" : phase === "uploading" ? "Upload en cours…" : phase === "processing" ? "Traitement…" : phase === "publishing" ? "Publication…" : phase === "done" ? "Terminé" : idleLabel;
  return <article className="panel video-publisher-panel" id="video-publisher">
    <div className="panel-heading"><div><h2>Studio de contenu</h2><p>Créez une inspiration réservable en quelques secondes.</p></div><span className="role-pill">Créateur</span></div>
    <form className="dashboard-form video-publisher-form" onSubmit={(event) => void publish(event)}>
      <label>Format<select name="contentType" value={contentType} onChange={(event) => setContentType(event.target.value as ContentType)}><option value="video">Vidéo</option><option value="photo">Photo / carrousel</option><option value="before_after">Avant / Après</option><option value="promotion">Promotion</option><option value="availability">Disponibilité immédiate</option></select></label>
      <label>Titre<input name="title" maxLength={120} placeholder="Ex. Tresses Knotless" /></label>
      {contentType === "video" ? <><label className="wide video-drop">Vidéo MP4, WebM ou MOV · 90 s maximum · 100 Mo<input ref={mediaInput} name="video" type="file" accept="video/mp4,video/webm,video/quicktime" required onChange={(event) => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); setPreviewUrls(event.target.files?.[0] ? [URL.createObjectURL(event.target.files[0])] : []); }} /></label><label className="wide">Miniature personnalisée (facultatif)<input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp" /></label></> : <label className="wide video-drop">{contentType === "before_after" ? "Deux images : avant puis après" : "Images JPEG, PNG ou WebP · 10 maximum"}<input ref={mediaInput} name="media" type="file" accept="image/jpeg,image/png,image/webp" multiple={contentType !== "promotion" && contentType !== "availability"} required onChange={(event) => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); setPreviewUrls(Array.from(event.target.files ?? []).map((item) => URL.createObjectURL(item))); }} /></label>}
      {previewUrls.length > 0 && <div className="wide publisher-preview">{contentType === "video" ? <video src={previewUrls[0]} controls muted playsInline aria-label="Aperçu de la vidéo" /> : previewUrls.map((url, index) => <Image key={url} src={url} alt={contentType === "before_after" ? index === 0 ? "Avant" : "Après" : `Aperçu ${index + 1}`} width={320} height={400} unoptimized />)}<span>Aperçu avant publication</span><button type="button" onClick={() => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); setPreviewUrls([]); if (mediaInput.current) mediaInput.current.value = ""; }}>Supprimer et recommencer</button></div>}
      <label className="wide">Légende<textarea name="caption" required maxLength={2200} rows={3} placeholder="Expliquez la technique, le résultat ou le conseil beauté…" /></label>
      <label className="wide">Hashtags<input name="hashtags" maxLength={300} placeholder="#tresses #dakar #soins" /></label>
      <label>Localisation<input name="location" maxLength={160} placeholder="Dakar, Sénégal" /></label>
      {contentType === "availability" && <label>Créneau disponible<input name="availableAt" type="datetime-local" required /></label>}
      {contentType === "promotion" && <><label>Remise (%)<input name="discount" type="number" min="1" max="90" required /></label><label>Fin de l’offre<input name="promotionEndsAt" type="datetime-local" required /></label><label>Places disponibles<input name="promotionSlots" type="number" min="1" max="10000" required /></label></>}
      <label>Catégorie et prestation<select name="serviceId" defaultValue=""><option value="">Choisir une prestation</option>{services.map((service) => <option key={service.id} value={service.id}>{service.services?.categories?.name ?? "Beauté"} · {service.title} · {service.duration_minutes} min · {service.price_amount.toLocaleString("fr-FR")} F</option>)}</select></label>
      <label>Visibilité<select name="visibility" defaultValue="public"><option value="public">Tout le monde</option><option value="followers">Abonnés</option></select></label>
      <label>Publication<select name="status" defaultValue={providerApproved ? "published" : "draft"}><option value="draft">Brouillon</option><option value="scheduled" disabled={!providerApproved}>Programmer</option><option value="published" disabled={!providerApproved}>Publier maintenant</option></select></label>
      <label>Date programmée<input name="scheduledFor" type="datetime-local" /></label>
      <label className="wide legal-consent"><input name="allowComments" type="checkbox" defaultChecked /><span>Autoriser les commentaires.</span></label>
      <label className="wide legal-consent"><input name="consent" type="checkbox" /><span>Je confirme avoir l’autorisation des personnes reconnaissables dans cette vidéo.</span></label>
      {!providerApproved && <p className="wide publisher-notice">Votre profil doit être approuvé avant une publication publique. Le brouillon reste disponible.</p>}
      {feedback && <p className="wide dashboard-feedback" role="status">{feedback}</p>}
      {phase !== "idle" && <label className="wide upload-progress">Progression de la publication<progress max="100" value={progress} /><span>{progress}% · {busyLabel}</span></label>}
      <button className="primary-button" type="submit" disabled={phase !== "idle"}>{busyLabel}</button>
    </form>
  </article>;
}
