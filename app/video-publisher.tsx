"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type ProviderService = { id: string; title: string; duration_minutes: number; price_amount: number };
type PublishStatus = "draft" | "scheduled" | "published";
type ContentType = "video" | "photo" | "before_after" | "promotion" | "availability";

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

async function inspectAndCreateThumbnail(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("La vidéo ne peut pas être analysée."));
    });
    if (!Number.isFinite(video.duration) || video.duration < 1 || video.duration > 90) throw new Error("La vidéo doit durer entre 1 et 90 secondes.");
    if (!video.videoWidth || !video.videoHeight) throw new Error("Dimensions vidéo invalides.");
    const targetTime = Math.min(0.25, Math.max(0, video.duration / 4));
    if (targetTime > 0) {
      video.currentTime = targetTime;
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    }
    const canvas = document.createElement("canvas");
    canvas.width = 540;
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Miniature impossible à créer.")), "image/jpeg", 0.84));
    return { duration: video.duration, aspectRatio: video.videoWidth / video.videoHeight, thumbnail };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VideoPublisher({ userId, providerApproved, onPublished }: { userId: string; providerApproved: boolean; onPublished: () => Promise<void> }) {
  const [services, setServices] = useState<ProviderService[]>([]);
  const [phase, setPhase] = useState<"idle" | "analysing" | "uploading" | "publishing">("idle");
  const [feedback, setFeedback] = useState("");
  const [contentType, setContentType] = useState<ContentType>("video");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const mediaInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.from("provider_services").select("id,title,duration_minutes,price_amount").eq("provider_id", userId).eq("is_active", true).order("title").then(({ data }) => setServices((data ?? []) as ProviderService[]));
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
    if (!file) { setFeedback(selectedType === "video" ? "Choisissez une vidéo." : "Choisissez au moins une image."); return; }
    if (selectedType === "video" && !VIDEO_TYPES.has(file.type)) { setFeedback("Format accepté : MP4, WebM ou MOV."); return; }
    if (selectedType === "video" && file.size > MAX_VIDEO_BYTES) { setFeedback("La vidéo dépasse 100 Mo."); return; }
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
    try {
      setFeedback("");
      let error: { message: string } | null = null;
      if (selectedType === "video") {
        setPhase("analysing");
        const media = await inspectAndCreateThumbnail(file);
        const thumbnailBlob = customThumbnail instanceof File && customThumbnail.size > 0 ? customThumbnail : media.thumbnail;
        const thumbnailMime = customThumbnail instanceof File && customThumbnail.size > 0 ? customThumbnail.type : "image/jpeg";
        const extension = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
        const thumbnailExtension = thumbnailMime === "image/png" ? "png" : thumbnailMime === "image/webp" ? "webp" : "jpg";
        const postId = crypto.randomUUID();
        videoPath = `${userId}/${postId}/video.${extension}`;
        thumbnailPath = `${userId}/${postId}/thumbnail.${thumbnailExtension}`;
        setPhase("uploading");
        const videoUpload = await supabase.storage.from("provider-social-media").upload(videoPath, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
        if (videoUpload.error) throw videoUpload.error;
        const thumbnailUpload = await supabase.storage.from("provider-social-media").upload(thumbnailPath, thumbnailBlob, { contentType: thumbnailMime, cacheControl: "31536000", upsert: false });
        if (thumbnailUpload.error) throw thumbnailUpload.error;
        const videoUrl = supabase.storage.from("provider-social-media").getPublicUrl(videoPath).data.publicUrl;
        const thumbnailUrl = supabase.storage.from("provider-social-media").getPublicUrl(thumbnailPath).data.publicUrl;
        setPhase("publishing");
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
      form.reset();
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      setContentType("video");
      setFeedback(status === "published" ? "Publication visible dans Inspiration." : status === "scheduled" ? "Publication programmée." : "Brouillon enregistré.");
      await onPublished();
    } catch (caught) {
      if (videoPath) await supabase.storage.from("provider-social-media").remove([videoPath]);
      if (thumbnailPath) await supabase.storage.from("provider-social-media").remove([thumbnailPath]);
      if (mediaPaths.length) await supabase.storage.from("provider-social-media").remove(mediaPaths);
      setFeedback(publicErrorMessage(caught, "La publication a échoué. Vérifiez le fichier et réessayez."));
    } finally { setPhase("idle"); }
  }

  const busyLabel = phase === "analysing" ? "Analyse de la vidéo…" : phase === "uploading" ? "Envoi sécurisé…" : phase === "publishing" ? "Publication…" : "Publier la vidéo";
  const progressValue = phase === "analysing" ? 20 : phase === "uploading" ? 60 : phase === "publishing" ? 90 : 0;
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
      <label>Prestation liée<select name="serviceId" defaultValue=""><option value="">Choisir une prestation</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title} · {service.duration_minutes} min · {service.price_amount.toLocaleString("fr-FR")} F</option>)}</select></label>
      <label>Visibilité<select name="visibility" defaultValue="public"><option value="public">Tout le monde</option><option value="followers">Abonnés</option></select></label>
      <label>Publication<select name="status" defaultValue={providerApproved ? "published" : "draft"}><option value="draft">Brouillon</option><option value="scheduled" disabled={!providerApproved}>Programmer</option><option value="published" disabled={!providerApproved}>Publier maintenant</option></select></label>
      <label>Date programmée<input name="scheduledFor" type="datetime-local" /></label>
      <label className="wide legal-consent"><input name="allowComments" type="checkbox" defaultChecked /><span>Autoriser les commentaires.</span></label>
      <label className="wide legal-consent"><input name="consent" type="checkbox" /><span>Je confirme avoir l’autorisation des personnes reconnaissables dans cette vidéo.</span></label>
      {!providerApproved && <p className="wide publisher-notice">Votre profil doit être approuvé avant une publication publique. Le brouillon reste disponible.</p>}
      {feedback && <p className="wide dashboard-feedback" role="status">{feedback}</p>}
      {phase !== "idle" && <label className="wide upload-progress">Progression de la publication<progress max="100" value={progressValue} /><span>{progressValue}% · {busyLabel}</span></label>}
      <button className="primary-button" type="submit" disabled={phase !== "idle"}>{busyLabel}</button>
    </form>
  </article>;
}
