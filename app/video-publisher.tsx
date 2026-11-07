"use client";

import { StudioServiceCreator } from "./studio-service-creator";
import { StudioUploadError, uploadStudioVideo } from "@/lib/media/video-upload-client";
import { PhotoCropper } from "./photo-cropper";
import { mediaSelectionError } from "@/lib/domain/media-composer";
import { formatServiceMoney } from "@/lib/domain/service-money";
import "./media-composer.css";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { validatePublishedVideoDelivery, type PublishedVideoRecord } from "@/lib/domain/video-delivery";

type ProviderService = { is_active: boolean; id: string; title: string; duration_minutes: number; price_amount: number; currency: string; services: { categories: { name: string } | null } | null };
type PublishStatus = "draft" | "scheduled" | "published";
type ContentType = "video" | "photo" | "before_after" | "promotion" | "availability";

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FEED_CACHE_KEY = "mata-social-feed-cache-v1";

async function verifyPublishedVideo(postId: string, serviceId: string, videoPath: string, thumbnailPath: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Connexion au service vidéo indisponible.");
  const { data: post, error: postError } = await supabase.from("posts")
    .select("id,status,visibility,published_at,post_services(provider_service_id,is_primary),social_post_media(bucket_id,storage_path,thumbnail_path)")
    .eq("id", postId).single();
  if (postError) throw postError;
  const deliveryError = validatePublishedVideoDelivery(post as unknown as PublishedVideoRecord, { postId, serviceId, videoPath, thumbnailPath });
  if (deliveryError) throw new Error(deliveryError);
  const { data: feedPost, error: feedError } = await supabase.from("social_feed").select("id").eq("id", postId).single();
  if (feedError || feedPost?.id !== postId) throw new Error("La publication n’est pas encore lisible dans le feed client.");
  const { data: signedVideo, error: signedVideoError } = await supabase.storage.from("provider-social-media").createSignedUrl(videoPath, 60);
  const { data: signedThumbnail, error: signedThumbnailError } = await supabase.storage.from("provider-social-media").createSignedUrl(thumbnailPath, 60);
  if (signedVideoError || !signedVideo?.signedUrl || signedThumbnailError || !signedThumbnail?.signedUrl) {
    throw new Error("Le média publié n’est pas accessible au lecteur.");
  }
}

async function resolveVideoDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;

  // MediaRecorder WebM files can omit the duration from their initial metadata.
  // Chromium computes the real duration after a seek to the end of the blob.
  return new Promise<number>((resolve, reject) => {
    const events = ["durationchange", "timeupdate", "seeked", "progress"] as const;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new StudioUploadError("La durée de la vidéo ne peut pas être déterminée."));
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

async function inspectAndCreateThumbnail(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => { video.onloadeddata = null; video.onerror = null; reject(new StudioUploadError("La préparation prend trop de temps. Essayez une version MP4 de la vidéo.")); }, 20000);
      video.onloadeddata = () => { window.clearTimeout(timeout); resolve(); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new StudioUploadError("Ce format vidéo ne peut pas être lu sur cet appareil. Essayez une version MP4.")); };
    });
    const duration = await resolveVideoDuration(video);
    if (!Number.isFinite(duration) || duration <= 0) throw new StudioUploadError("La vidéo ne contient pas de durée lisible. Essayez une version MP4.");
    if (!video.videoWidth || !video.videoHeight) throw new StudioUploadError("Dimensions vidéo invalides.");
    const canvas = document.createElement("canvas");
    canvas.width = 540;
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new StudioUploadError("Miniature impossible à créer.")), "image/jpeg", 0.84));
    return { duration, aspectRatio: video.videoWidth / video.videoHeight, thumbnail };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VideoPublisher({ userId, providerApproved, onPublished, initialContentType = "video", initialFiles = [], salon = false }: { salon?: boolean; userId: string; providerApproved: boolean; onPublished: (postType: ContentType) => Promise<void>; initialContentType?: ContentType; initialFiles?: File[] }) {
  const [services, setServices] = useState<ProviderService[]>([]);
  const [phase, setPhase] = useState<"idle" | "analysing" | "uploading" | "publishing">("idle");
  const [feedback, setFeedback] = useState("");
  const [contentType, setContentType] = useState<ContentType>(initialContentType);
  const [selectedFiles, setSelectedFiles] = useState<File[]>(initialFiles);
  const [serviceId, setServiceId] = useState("");
  const [creatingService, setCreatingService] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [publicationUnconfirmed, setPublicationUnconfirmed] = useState(false);
  const [uploadedPercent, setUploadedPercent] = useState(0);
  const [cropping, setCropping] = useState<number | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>(() => initialFiles.map(file => URL.createObjectURL(file)));
  const mediaInput = useRef<HTMLInputElement>(null);
  const publishPending = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.from("provider_services").select("id,title,duration_minutes,price_amount,currency,is_active,services(categories(name))").eq("provider_id", userId).is("archived_at", null).order("title").abortSignal(AbortSignal.timeout(15000)).then(({ data, error }) => { if (error) setServicesError("Les prestations sont indisponibles. Actualisez le Studio pour réessayer."); else setServices((data ?? []) as unknown as ProviderService[]); });
  }, [userId]);

  useEffect(() => () => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); }, [previewUrls]);
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setFeedback("Connexion indisponible. Actualisez le Studio pour réessayer."); return; }
    if (phase !== "idle" || publishPending.current || publicationUnconfirmed || creatingService) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const selectedType = String(values.get("contentType") ?? "video") as ContentType;
    const files = selectedFiles;
    const selectionError = mediaSelectionError(files);
    if (selectionError) { setFeedback(selectionError); return; }
    const file = files[0];
    const status = String(values.get("status")) as PublishStatus;
    const selectedServiceId = String(values.get("serviceId") ?? "");
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
    if (status !== "draft" && !selectedServiceId) { setFeedback("Associez une prestation avant de publier ou programmer."); return; }
    if (status !== "draft" && !services.find(service => service.id === selectedServiceId)?.is_active) { setFeedback("Choisissez une prestation active pour publier. Vous pouvez conserver cette vidéo en brouillon."); return; }
    if (status === "scheduled" && !scheduledValue) { setFeedback("Choisissez une date de publication."); return; }

    publishPending.current = true;
    let videoPath = "";
    let thumbnailPath = "";
    const mediaPaths: string[] = [];
    let persisted = false;
    let publicationRequested = false;
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
        setUploadedPercent(0);
        await uploadStudioVideo(file, videoPath, setUploadedPercent);
        const thumbnailUpload = await supabase.storage.from("provider-social-media").upload(thumbnailPath, thumbnailBlob, { contentType: thumbnailMime, cacheControl: "31536000", upsert: false });
        if (thumbnailUpload.error) throw thumbnailUpload.error;
        const videoUrl = supabase.storage.from("provider-social-media").getPublicUrl(videoPath).data.publicUrl;
        const thumbnailUrl = supabase.storage.from("provider-social-media").getPublicUrl(thumbnailPath).data.publicUrl;
        setPhase("publishing");
        publicationRequested = true;
        const publication = await supabase.rpc("create_provider_video_post", {
          target_post_id: postId, target_title: String(values.get("title") ?? "").trim(), target_caption: String(values.get("caption") ?? "").trim(),
          target_video_path: videoPath, target_video_url: videoUrl, target_thumbnail_path: thumbnailPath, target_thumbnail_url: thumbnailUrl,
          target_duration_seconds: media.duration, target_aspect_ratio: media.aspectRatio,
          target_provider_service_id: selectedServiceId || null, target_status: status,
          target_allow_comments: values.get("allowComments") === "on", target_client_consent: consent,
          target_scheduled_for: status === "scheduled" ? new Date(scheduledValue).toISOString() : null,
          target_visibility: String(values.get("visibility") ?? "public"),
          target_hashtags: String(values.get("hashtags") ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 10),
          target_location: String(values.get("location") ?? "").trim() || null,
          target_available_at: values.get("availableAt") ? new Date(String(values.get("availableAt"))).toISOString() : null,
        }).abortSignal(AbortSignal.timeout(30000));
        error = publication.error;
        if (!error) {
          persisted = true;
          if (status === "published") await verifyPublishedVideo(postId, selectedServiceId, videoPath, thumbnailPath);
        }
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
        publicationRequested = true;
        ({ error } = await supabase.rpc("create_social_media_post", {
          target_post_type: selectedType, target_title: String(values.get("title") ?? "").trim(), target_caption: String(values.get("caption") ?? "").trim(), target_media_urls: mediaUrls,
          target_provider_service_id: selectedServiceId || null, target_status: status, target_allow_comments: values.get("allowComments") === "on", target_client_consent: consent,
          target_scheduled_for: status === "scheduled" ? new Date(scheduledValue).toISOString() : null, target_visibility: String(values.get("visibility") ?? "public"),
          target_hashtags: String(values.get("hashtags") ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 10), target_location: String(values.get("location") ?? "").trim() || null,
          target_available_at: values.get("availableAt") ? new Date(String(values.get("availableAt"))).toISOString() : null,
          target_discount: values.get("discount") ? Number(values.get("discount")) : null, target_promotion_ends_at: values.get("promotionEndsAt") ? new Date(String(values.get("promotionEndsAt"))).toISOString() : null,
          target_promotion_slots: values.get("promotionSlots") ? Number(values.get("promotionSlots")) : null,
        }).abortSignal(AbortSignal.timeout(30000)));
      }
      if (error) throw error;
      persisted = true;
      try { window.sessionStorage.removeItem(FEED_CACHE_KEY); } catch { /* The saved publication remains valid when session storage is unavailable. */ }
      window.dispatchEvent(new Event("mata:feed:invalidate"));
      form.reset();
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      setSelectedFiles([]);
      setContentType("video");
      setFeedback(status === "published" ? "Votre publication a été publiée." : status === "scheduled" ? "Publication programmée." : "Brouillon enregistré.");
      await onPublished(selectedType);
    } catch (caught) {
      if (!persisted && !publicationRequested) {
        if (videoPath) await supabase.storage.from("provider-social-media").remove([videoPath]);
        if (thumbnailPath) await supabase.storage.from("provider-social-media").remove([thumbnailPath]);
        if (mediaPaths.length) await supabase.storage.from("provider-social-media").remove(mediaPaths);
      }
      const uncertain = publicationRequested && !persisted && !(caught && typeof caught === "object" && "code" in caught && typeof caught.code === "string" && caught.code.length > 0);
      setPublicationUnconfirmed(uncertain || persisted);
      setFeedback(caught instanceof StudioUploadError ? caught.message : uncertain ? "Publication non confirmée. Actualisez le Studio pour vérifier vos publications avant de réessayer." : publicErrorMessage(caught, persisted ? "La vidéo est enregistrée, mais sa visibilité n’a pas pu être confirmée. Actualisez le Studio avant de réessayer." : "La publication a échoué. Vérifiez le fichier et réessayez."));
    } finally { publishPending.current = false; setPhase("idle"); }
  }

  const idleLabel = contentType === "video" ? "Publier la vidéo" : "Publier le contenu";
  const busyLabel = phase === "analysing" ? "Analyse de la vidéo…" : phase === "uploading" ? "Envoi sécurisé…" : phase === "publishing" ? "Publication…" : idleLabel;
  const progressValue = phase === "uploading" ? uploadedPercent : phase === "publishing" ? 100 : 0;
  return <article className="panel video-publisher-panel" id="video-publisher">
    <div className="panel-heading"><div><h2>Montrez votre talent</h2><p>Choisissez un média, associez une prestation et publiez depuis votre téléphone.</p></div><span className="role-pill">Tout dans votre Studio</span></div>
    {creatingService && <StudioServiceCreator userId={userId} salon={salon} providerApproved={providerApproved} onCancel={() => setCreatingService(false)} onCreated={service => { setServices(current => [...current, service]); setServiceId(service.id); setCreatingService(false); setFeedback("Prestation ajoutée et associée à votre publication."); }} />}
    <form className="dashboard-form video-publisher-form" onSubmit={(event) => void publish(event)}>
      <input type="hidden" name="contentType" value={contentType} />
      <div className="wide composer-media">
        <input ref={mediaInput} aria-label="Choisir une photo ou une vidéo" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={phase !== "idle"} multiple onChange={event => {
          const files = Array.from(event.target.files ?? []); if (!files.length) return;
          const error = mediaSelectionError(files); if (error) { setFeedback(error); event.target.value = ""; return; }
          setSelectedFiles(files); setPreviewUrls(files.map(file => URL.createObjectURL(file))); setCropping(null); setFeedback("");
          setContentType(files[0].type.startsWith("video/") ? "video" : ["before_after", "promotion", "availability"].includes(contentType) ? contentType : "photo");
        }} />
        {previewUrls.length === 0 ? <p>Choisissez une vidéo sans limite de durée (100 Mo maximum par fichier) ou jusqu’à 10 photos.</p> : <div className="composer-previews">{previewUrls.map((url, index) => <div key={url}>{contentType === "video" ? <video src={url} controls playsInline aria-label="Aperçu de votre vidéo" /> : <><Image src={url} alt={`Photo ${index + 1}`} width={500} height={650} unoptimized /><button type="button" onClick={() => setCropping(index)}>Recadrer la photo {index + 1}</button></>}</div>)}</div>}
        {cropping !== null && selectedFiles[cropping] && <PhotoCropper key={previewUrls[cropping]} file={selectedFiles[cropping]} onCancel={() => setCropping(null)} onApply={file => {
          if (file.size > MAX_IMAGE_BYTES) { setFeedback("Le recadrage dépasse 12 Mo. Choisissez un cadrage plus petit."); setCropping(null); return; }
          const files = selectedFiles.map((old, index) => index === cropping ? file : old);
          setSelectedFiles(files); setPreviewUrls(files.map(item => URL.createObjectURL(item))); setCropping(null); setFeedback("");
        }} />}
        {selectedFiles.length > 0 && contentType !== "video" && <details><summary>Autres formats photo</summary><label>Format<select value={contentType} onChange={event => setContentType(event.target.value as ContentType)}><option value="photo">Photo / carrousel</option><option value="before_after">Avant / Après (2 photos)</option><option value="promotion">Promotion</option><option value="availability">Disponibilité immédiate</option></select></label></details>}
        <div className="composer-actions"><button type="button" disabled={phase !== "idle"} onClick={() => mediaInput.current?.click()}>{selectedFiles.length ? "Changer les médias" : "＋ Choisir une photo ou une vidéo"}</button></div>
      </div>
      <fieldset className="wide composer-details" disabled={phase !== "idle"}>
      <h3>Votre publication</h3>
      <label>Titre<input name="title" maxLength={120} placeholder="Ajoutez un titre" /></label>
      <label className="wide">Légende<textarea name="caption" maxLength={2200} rows={3} placeholder="Expliquez la technique, le résultat ou le conseil beauté…" /></label>
      <label className="wide">Hashtags<input name="hashtags" maxLength={300} placeholder="#tresses #dakar #soins" /></label>
      <details className="wide publisher-options"><summary>Localisation</summary><label>Localisation<input name="location" maxLength={160} placeholder="Dakar, Sénégal" /></label></details>
      {contentType === "availability" && <label>Créneau disponible<input name="availableAt" type="datetime-local" required /></label>}
      {contentType === "promotion" && <><label>Remise (%)<input name="discount" type="number" min="1" max="90" required /></label><label>Fin de l’offre<input name="promotionEndsAt" type="datetime-local" required /></label><label>Places disponibles<input name="promotionSlots" type="number" min="1" max="10000" required /></label></>}
      {servicesError && <p role="alert">{servicesError}</p>}
      <button type="button" disabled={phase !== "idle"} onClick={() => setCreatingService(true)}>＋ Ajouter une prestation dans le Studio</button>
      <label>Catégorie et prestation<select name="serviceId" value={serviceId} onChange={event => setServiceId(event.target.value)}><option value="">Choisir une prestation</option>{services.map((service) => <option key={service.id} value={service.id}>{service.services?.categories?.name ?? "Beauté"} · {service.title}{!service.is_active ? " (inactive · brouillon uniquement)" : ""} · {service.duration_minutes} min · {formatServiceMoney(service.price_amount, service.currency)}</option>)}</select></label>
      <details className="wide publisher-options"><summary>Options de publication</summary>
      <label>Visibilité<select name="visibility" defaultValue="public"><option value="public">Tout le monde</option><option value="followers">Abonnés</option></select></label>
      {contentType === "video" && <label>Couverture personnalisée<input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp" /></label>}<label>Publication<select name="status" defaultValue={providerApproved ? "published" : "draft"}><option value="draft">Brouillon</option><option value="scheduled" disabled={!providerApproved}>Programmer</option><option value="published" disabled={!providerApproved}>Publier maintenant</option></select></label>
      <label>Date programmée<input name="scheduledFor" type="datetime-local" /></label>
      <label className="wide legal-consent"><input name="allowComments" type="checkbox" defaultChecked /><span>Autoriser les commentaires.</span></label>
      </details>
      <label className="wide legal-consent"><input name="consent" type="checkbox" /><span>Je confirme avoir l’autorisation des personnes reconnaissables dans ce contenu.</span></label>
      {!providerApproved && <p className="wide publisher-notice">Votre profil doit être approuvé avant une publication publique. Le brouillon reste disponible.</p>}

      {phase !== "idle" && <label className="wide upload-progress">Progression de la publication<progress max="100" value={progressValue} /><span>{progressValue}% · {busyLabel}</span></label>}
      <button className="primary-button" type="submit" disabled={phase !== "idle" || !selectedFiles.length || cropping !== null || creatingService || publicationUnconfirmed}>{busyLabel}</button>
      </fieldset>
      {publicationUnconfirmed && <button type="button" onClick={() => window.location.reload()}>Actualiser le Studio</button>}
      {feedback && <p className="wide dashboard-feedback" role="status">{feedback}</p>}
    </form>
  </article>;
}
