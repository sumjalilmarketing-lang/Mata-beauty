"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ProviderService = { id: string; title: string; duration_minutes: number; price_amount: number };
type PublishStatus = "draft" | "scheduled" | "published";

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.from("provider_services").select("id,title,duration_minutes,price_amount").eq("provider_id", userId).eq("is_active", true).order("title").then(({ data }) => setServices((data ?? []) as ProviderService[]));
  }, [userId]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || phase !== "idle") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("video");
    const status = String(values.get("status")) as PublishStatus;
    const consent = values.get("consent") === "on";
    const scheduledValue = String(values.get("scheduledFor") ?? "");
    if (!(file instanceof File) || file.size === 0) { setFeedback("Choisissez une vidéo."); return; }
    if (!VIDEO_TYPES.has(file.type)) { setFeedback("Format accepté : MP4, WebM ou MOV."); return; }
    if (file.size > MAX_VIDEO_BYTES) { setFeedback("La vidéo dépasse 100 Mo."); return; }
    if (status === "published" && !consent) { setFeedback("Confirmez le consentement de la personne filmée."); return; }
    if (status === "scheduled" && !scheduledValue) { setFeedback("Choisissez une date de publication."); return; }

    let videoPath = "";
    let thumbnailPath = "";
    try {
      setFeedback("");
      setPhase("analysing");
      const media = await inspectAndCreateThumbnail(file);
      const extension = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
      const key = crypto.randomUUID();
      videoPath = `${userId}/${key}.${extension}`;
      thumbnailPath = `${userId}/${key}.jpg`;
      setPhase("uploading");
      const videoUpload = await supabase.storage.from("social-videos").upload(videoPath, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (videoUpload.error) throw videoUpload.error;
      const thumbnailUpload = await supabase.storage.from("social-thumbnails").upload(thumbnailPath, media.thumbnail, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (thumbnailUpload.error) throw thumbnailUpload.error;
      const videoUrl = supabase.storage.from("social-videos").getPublicUrl(videoPath).data.publicUrl;
      const thumbnailUrl = supabase.storage.from("social-thumbnails").getPublicUrl(thumbnailPath).data.publicUrl;
      setPhase("publishing");
      const { error } = await supabase.rpc("create_video_post", {
        target_caption: String(values.get("caption") ?? "").trim(), target_video_url: videoUrl, target_thumbnail_url: thumbnailUrl,
        target_duration_seconds: media.duration, target_aspect_ratio: media.aspectRatio,
        target_provider_service_id: String(values.get("serviceId") ?? "") || null, target_status: status,
        target_allow_comments: values.get("allowComments") === "on", target_client_consent: consent,
        target_scheduled_for: status === "scheduled" ? new Date(scheduledValue).toISOString() : null,
      });
      if (error) throw error;
      form.reset();
      setFeedback(status === "published" ? "Vidéo publiée dans le feed." : status === "scheduled" ? "Publication programmée." : "Brouillon enregistré.");
      await onPublished();
    } catch (caught) {
      if (videoPath) await supabase.storage.from("social-videos").remove([videoPath]);
      if (thumbnailPath) await supabase.storage.from("social-thumbnails").remove([thumbnailPath]);
      setFeedback(caught instanceof Error ? caught.message : "La publication a échoué.");
    } finally { setPhase("idle"); }
  }

  const busyLabel = phase === "analysing" ? "Analyse de la vidéo…" : phase === "uploading" ? "Envoi sécurisé…" : phase === "publishing" ? "Publication…" : "Publier la vidéo";
  return <article className="panel video-publisher-panel" id="video-publisher">
    <div className="panel-heading"><div><h2>Publier une réalisation</h2><p>Une vidéo verticale courte, liée à une prestation réservable.</p></div><span className="role-pill">Créateur</span></div>
    <form className="dashboard-form video-publisher-form" onSubmit={(event) => void publish(event)}>
      <label className="wide video-drop">Vidéo MP4, WebM ou MOV · 90 s maximum · 100 Mo<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" required /></label>
      <label className="wide">Légende<textarea name="caption" required maxLength={2200} rows={3} placeholder="Expliquez la technique, le résultat ou le conseil beauté…" /></label>
      <label>Prestation liée<select name="serviceId" defaultValue=""><option value="">Aucune</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title} · {service.duration_minutes} min · {service.price_amount.toLocaleString("fr-FR")} F</option>)}</select></label>
      <label>Publication<select name="status" defaultValue={providerApproved ? "published" : "draft"}><option value="draft">Brouillon</option><option value="scheduled" disabled={!providerApproved}>Programmer</option><option value="published" disabled={!providerApproved}>Publier maintenant</option></select></label>
      <label>Date programmée<input name="scheduledFor" type="datetime-local" /></label>
      <label className="wide legal-consent"><input name="allowComments" type="checkbox" defaultChecked /><span>Autoriser les commentaires.</span></label>
      <label className="wide legal-consent"><input name="consent" type="checkbox" /><span>Je confirme avoir l’autorisation des personnes reconnaissables dans cette vidéo.</span></label>
      {!providerApproved && <p className="wide publisher-notice">Votre profil doit être approuvé avant une publication publique. Le brouillon reste disponible.</p>}
      {feedback && <p className="wide dashboard-feedback" role="status">{feedback}</p>}
      <button className="primary-button" type="submit" disabled={phase !== "idle"}>{busyLabel}</button>
    </form>
  </article>;
}
