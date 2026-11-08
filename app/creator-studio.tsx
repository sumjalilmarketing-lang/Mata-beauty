"use client";

import { isVideoFile, STUDIO_MEDIA_ACCEPT } from "@/lib/domain/video-formats";

import Image from "next/image";
import { mediaSelectionError } from "@/lib/domain/media-composer";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SocialDashboard } from "./social-dashboard";
import { VideoPublisher } from "./video-publisher";
import { statusLabel } from "@/lib/ui/status-label";
import { studioServiceCanPublish, studioServiceIsPublic, type StudioBookingService } from "@/lib/domain/studio-booking";

type StudioTab = "create" | "videos" | "photos" | "before_after" | "drafts" | "scheduled" | "statistics";
type CreatorPost = {
  id: string; post_type: string; title: string | null; caption: string; status: string;
  thumbnail_url: string | null; view_count: number; like_count: number; comment_count: number; published_at: string | null; created_at: string;
  post_services?: Array<{ is_primary: boolean; provider_services: StudioBookingService | StudioBookingService[] | null }>;
};

const tabs: Array<{ key: StudioTab; label: string }> = [
  { key: "create", label: "Créer une publication" }, { key: "videos", label: "Mes vidéos" }, { key: "photos", label: "Mes photos" },
  { key: "before_after", label: "Avant / Après" }, { key: "drafts", label: "Brouillons" },
  { key: "scheduled", label: "Publications programmées" }, { key: "statistics", label: "Statistiques" },
];

export function CreatorStudio({ userId, providerApproved, initialTab = "create", salon = false }: { salon?: boolean; userId: string; providerApproved: boolean; initialTab?: StudioTab }) {
  const [active, setActive] = useState<StudioTab>(initialTab);
  const [createType, setCreateType] = useState<"video" | "photo" | "before_after">("video");
  const picker = useRef<HTMLInputElement>(null);
  const [initialFiles, setInitialFiles] = useState<File[]>([]);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [feedback, setFeedback] = useState("");
  const [firstPublicationFeedback, setFirstPublicationFeedback] = useState(false);
  const [publishingService, setPublishingService] = useState<string | null>(null);
  const servicePending = useRef(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setState("loading");
    const { data, error } = await supabase.from("posts").select("id,post_type,title,caption,status,thumbnail_url,view_count,like_count,comment_count,published_at,created_at,post_services(is_primary,provider_services(id,status,is_active,archived_at))").eq("author_id", userId).is("deleted_at", null).neq("status", "deleted").order("created_at", { ascending: false }).abortSignal(AbortSignal.timeout(15000));
    if (error) { setState("error"); return; }
    const rows = await Promise.all(((data ?? []) as CreatorPost[]).map(async (post) => {
      if (!post.thumbnail_url?.includes("/provider-social-media/")) return post;
      const path = decodeURIComponent(post.thumbnail_url.split("/provider-social-media/")[1]?.split("?")[0] ?? "");
      if (!path) return post;
      const { data: signed } = await supabase.storage.from("provider-social-media").createSignedUrl(path, 3600);
      return { ...post, thumbnail_url: signed?.signedUrl ?? null };
    }));
    setPosts(rows); setState(rows.length ? "ready" : "empty");
  }, [userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function publishLinkedService(service: StudioBookingService) {
    if (servicePending.current || !providerApproved || !studioServiceCanPublish(service)) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    servicePending.current = true; setPublishingService(service.id); setFeedback("");
    try {
      const result = await client.rpc("set_owned_service_status", { target_service_id: service.id, next_status: "published" }).abortSignal(AbortSignal.timeout(15000));
      if (result.error) throw result.error;
      const check = await client.from("provider_services").select("id,status,is_active,archived_at").eq("id", service.id).abortSignal(AbortSignal.timeout(15000)).single();
      if (check.error || !studioServiceIsPublic(check.data)) throw new Error("Publication non confirmée");
      window.dispatchEvent(new Event("mata:feed:invalidate"));
      await load();
      setFeedback("Prestation publiée. La réservation utilise vos horaires et disponibilités configurés.");
    } catch { setFeedback("Publication de la prestation non confirmée. Actualisez le Studio pour vérifier son statut avant de réessayer."); }
    finally { servicePending.current = false; setPublishingService(null); }
  }

  async function manage(postId: string, action: "hide" | "archive" | "delete" | "republish") {
    if (action === "delete" && !window.confirm("Supprimer cette publication ? Cette action la retire du Studio et du feed.")) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setFeedback("");
    const { error } = await supabase.rpc("manage_own_social_post", { target_post_id: postId, target_action: action });
    setFeedback(error ? "L’action n’a pas pu être appliquée." : "Publication mise à jour.");
    if (!error) await load();
  }

  async function answerStudioFeedback(response: "yes" | "no") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("micro_feedback").insert({ profile_id: userId, context: "first_publication", response });
    setFeedback(error ? "Votre publication est enregistrée; le retour sera disponible après la mise à jour lancement." : "Merci pour votre retour sur le Studio.");
    setFirstPublicationFeedback(false);
  }

  const visible = posts.filter((post) => {
    if (active === "videos") return post.post_type === "video";
    if (active === "photos") return ["photo", "promotion", "availability"].includes(post.post_type);
    if (active === "before_after") return post.post_type === "before_after";
    if (active === "drafts") return post.status === "draft";
    if (active === "scheduled") return post.status === "scheduled";
    return true;
  });

  function bookingAction(post: CreatorPost) {
    if (post.status !== "published") return null;
    const relation = post.post_services?.find(link => link.is_primary)?.provider_services;
    const service = Array.isArray(relation) ? relation[0] : relation;
    if (!service || studioServiceIsPublic(service)) return null;
    return <div><p>La vidéo est visible. La prestation associée n’est pas réservable publiquement.</p>{providerApproved && studioServiceCanPublish(service)
      ? <button type="button" disabled={publishingService !== null} onClick={() => void publishLinkedService(service)}>{publishingService === service.id ? "Publication…" : "Publier la prestation pour permettre la réservation"}</button>
      : <a href={salon ? "/salon/services" : "/pro/services"}>Vérifier la prestation et les disponibilités</a>}</div>;
  }

  return <section className="creator-studio">
    <header className="studio-hero"><div><span>STUDIO MATA BEAUTY</span><h2>Photo ou vidéo ?</h2><p>Choisissez votre média, préparez votre publication et partagez votre talent.</p></div><button type="button" onClick={() => picker.current?.click()}>＋ Créer</button></header>
    <input ref={picker} hidden aria-label="Importer une photo ou une vidéo" type="file" accept={STUDIO_MEDIA_ACCEPT} multiple onChange={event => { const files = Array.from(event.target.files ?? []); if (!files.length) return; const error = mediaSelectionError(files); if (error) { setFeedback(error); event.target.value = ""; return; } setInitialFiles(files); setCreateType(isVideoFile(files[0]) ? "video" : "photo"); setSelectionVersion(value => value + 1); setActive("create"); setFeedback(""); event.target.value = ""; }} />
    <nav className="studio-tabs" aria-label="Navigation Studio">{tabs.map((tab) => <button className={active === tab.key ? "active" : ""} key={tab.key} onClick={() => setActive(tab.key)}>{tab.label}</button>)}</nav>
    {feedback && <p className="dashboard-feedback" role="status">{feedback}</p>}
    {firstPublicationFeedback && <aside className="panel studio-feedback"><strong>Le Studio était-il facile à utiliser ?</strong><div><button onClick={() => void answerStudioFeedback("yes")}>👍 Oui</button><button onClick={() => void answerStudioFeedback("no")}>👎 Non</button></div></aside>}
    {active === "create" && <VideoPublisher salon={salon} key={selectionVersion} initialFiles={initialFiles} userId={userId} providerApproved={providerApproved} initialContentType={createType} onPublished={async (postType) => {
      await load();
      setInitialFiles([]);
      setCreateType("video");
      setFirstPublicationFeedback(true);
      setActive(postType === "video" ? "videos" : postType === "before_after" ? "before_after" : "photos");
    }} />}
    {active === "statistics" && <SocialDashboard role="provider" userId={userId} />}
    {!(["create", "statistics"] as StudioTab[]).includes(active) && <article className="panel studio-library"><div className="panel-heading"><div><h2>{tabs.find((tab) => tab.key === active)?.label}</h2><p>Vos contenus, leurs statuts et leurs performances réelles.</p></div><button onClick={() => void load()}>Actualiser</button></div>
      {state === "loading" && <div className="compact-empty">Chargement de vos publications…</div>}
      {state === "error" && <div className="compact-empty">Vos publications sont momentanément indisponibles.</div>}
      {(state === "empty" || (state === "ready" && visible.length === 0)) && <div className="compact-empty">Publiez votre première réalisation.</div>}
      {visible.length > 0 && <div className="studio-post-grid">{visible.map((post) => <article key={post.id}>{post.thumbnail_url ? <Image src={post.thumbnail_url} alt="" width={320} height={420} unoptimized /> : <span className="studio-media-placeholder">▶</span>}<div><small>{statusLabel(post.post_type)} · {statusLabel(post.status)}</small><strong>{post.title || post.caption || "Publication Mata Beauty"}</strong><span>{post.view_count} vues · {post.like_count} likes · {post.comment_count} commentaires</span><time>{new Date(post.published_at ?? post.created_at).toLocaleDateString("fr-FR")}</time>{bookingAction(post)}<footer>{post.status === "published" && <button onClick={() => void manage(post.id, "hide")}>Masquer</button>}{["hidden", "archived"].includes(post.status) && <button onClick={() => void manage(post.id, "republish")}>Republier</button>}<button onClick={() => void manage(post.id, "archive")}>Archiver</button><button className="danger" onClick={() => void manage(post.id, "delete")}>Supprimer</button></footer></div></article>)}</div>}
    </article>}
  </section>;
}
