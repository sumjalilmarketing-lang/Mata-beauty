"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SocialDashboard } from "./social-dashboard";
import { VideoPublisher } from "./video-publisher";

type StudioTab = "create" | "videos" | "photos" | "before_after" | "drafts" | "scheduled" | "archived" | "comments" | "moderation" | "statistics";
type CreatorPost = {
  id: string; post_type: string; title: string | null; caption: string; status: string;
  thumbnail_url: string | null; view_count: number; like_count: number; comment_count: number; save_count: number; share_count: number; published_at: string | null; created_at: string;
};
type CreatorComment = { id: string; post_id: string; body: string; created_at: string; profiles: { display_name: string | null } | null };

const tabs: Array<{ key: StudioTab; label: string }> = [
  { key: "create", label: "Créer une publication" }, { key: "videos", label: "Mes vidéos" }, { key: "photos", label: "Mes photos" },
  { key: "before_after", label: "Avant / Après" }, { key: "drafts", label: "Brouillons" },
  { key: "scheduled", label: "Publications programmées" }, { key: "archived", label: "Archives" },
  { key: "comments", label: "Commentaires" }, { key: "moderation", label: "Modération" }, { key: "statistics", label: "Statistiques" },
];

export function CreatorStudio({ userId, providerApproved }: { userId: string; providerApproved: boolean }) {
  const [active, setActive] = useState<StudioTab>("create");
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [comments, setComments] = useState<CreatorComment[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setState("loading");
    const { data, error } = await supabase.from("posts").select("id,post_type,title,caption,status,thumbnail_url,view_count,like_count,comment_count,save_count,share_count,published_at,created_at").eq("author_id", userId).order("created_at", { ascending: false });
    if (error) { setState("error"); return; }
    const rows = await Promise.all(((data ?? []) as CreatorPost[]).map(async (post) => {
      if (!post.thumbnail_url?.includes("/provider-social-media/")) return post;
      const path = decodeURIComponent(post.thumbnail_url.split("/provider-social-media/")[1]?.split("?")[0] ?? "");
      if (!path) return post;
      const { data: signed } = await supabase.storage.from("provider-social-media").createSignedUrl(path, 3600);
      return { ...post, thumbnail_url: signed?.signedUrl ?? null };
    }));
    setPosts(rows); setState(rows.length ? "ready" : "empty");
    const postIds = rows.map((post) => post.id);
    if (!postIds.length) { setComments([]); return; }
    const { data: commentData } = await supabase.from("post_comments").select("id,post_id,body,created_at,profiles!post_comments_author_id_fkey(display_name)").in("post_id", postIds).eq("is_hidden", false).order("created_at", { ascending: false }).limit(100);
    setComments((commentData ?? []) as unknown as CreatorComment[]);
  }, [userId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function manage(postId: string, action: "hide" | "archive" | "delete" | "republish") {
    if (action === "delete" && !window.confirm("Supprimer cette publication ? Cette action la retire du Studio et du feed.")) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setFeedback("");
    const { error } = await supabase.rpc("manage_own_social_post", { target_post_id: postId, target_action: action });
    setFeedback(error ? "L’action n’a pas pu être appliquée." : "Publication mise à jour.");
    if (!error) await load();
  }

  const visible = posts.filter((post) => {
    if (active === "videos") return post.post_type === "video" && post.status === "published";
    if (active === "photos") return ["photo", "promotion", "availability"].includes(post.post_type) && post.status === "published";
    if (active === "before_after") return post.post_type === "before_after" && post.status === "published";
    if (active === "drafts") return post.status === "draft";
    if (active === "scheduled") return post.status === "scheduled";
    if (active === "archived") return post.status === "archived";
    if (active === "moderation") return ["hidden", "rejected"].includes(post.status);
    return true;
  });

  return <section className="creator-studio">
    <header className="studio-hero"><div><span>STUDIO MATA BEAUTY</span><h2>Transformez vos réalisations en réservations.</h2><p>Publiez une vidéo liée à une prestation, puis mesurez les rendez-vous qu’elle génère.</p></div><button onClick={() => setActive("create")}>＋ Publier</button></header>
    <nav className="studio-tabs" aria-label="Navigation Studio">{tabs.map((tab) => <button className={active === tab.key ? "active" : ""} key={tab.key} onClick={() => setActive(tab.key)}>{tab.label}</button>)}</nav>
    {feedback && <p className="dashboard-feedback" role="status">{feedback}</p>}
    {active === "create" && <VideoPublisher userId={userId} providerApproved={providerApproved} onPublished={async (postType) => {
      await load();
      setFeedback(postType === "video" ? "Vidéo publiée et visible dans Inspiration." : "Publication enregistrée.");
      setActive(postType === "video" ? "videos" : postType === "before_after" ? "before_after" : "photos");
    }} />}
    {active === "statistics" && <SocialDashboard role="provider" userId={userId} />}
    {active === "comments" && <article className="panel studio-library"><div className="panel-heading"><div><h2>Commentaires reçus</h2><p>Les 100 commentaires visibles les plus récents sur vos publications.</p></div><button onClick={() => void load()}>Actualiser</button></div>{comments.length === 0 ? <div className="compact-empty">Aucun commentaire reçu.</div> : <div className="studio-comment-list">{comments.map((comment) => { const post=posts.find((item) => item.id===comment.post_id); return <article key={comment.id}><strong>{comment.profiles?.display_name ?? "Membre Mata"}</strong><p>{comment.body}</p><small>{post?.title ?? post?.caption ?? "Publication"} · {new Date(comment.created_at).toLocaleDateString("fr-FR")}</small></article>; })}</div>}</article>}
    {!(["create", "statistics", "comments"] as StudioTab[]).includes(active) && <article className="panel studio-library"><div className="panel-heading"><div><h2>{tabs.find((tab) => tab.key === active)?.label}</h2><p>{active === "moderation" ? "Les signalements restent privés ; vous voyez ici uniquement les décisions et statuts appliqués à vos contenus." : "Vos contenus, leurs statuts et leurs performances réelles."}</p></div><button onClick={() => void load()}>Actualiser</button></div>
      {state === "loading" && <div className="compact-empty">Chargement de vos publications…</div>}
      {state === "error" && <div className="compact-empty">Vos publications sont momentanément indisponibles.</div>}
      {(state === "empty" || (state === "ready" && visible.length === 0)) && <div className="compact-empty">Aucune publication dans cette rubrique.</div>}
      {visible.length > 0 && <div className="studio-post-grid">{visible.map((post) => <article key={post.id}>{post.thumbnail_url ? <Image src={post.thumbnail_url} alt="" width={320} height={420} unoptimized /> : <span className="studio-media-placeholder">▶</span>}<div><small>{post.post_type.replaceAll("_", " ")} · {post.status}</small><strong>{post.title || post.caption || "Publication Mata Beauty"}</strong><span>{post.view_count} vues · {post.like_count} likes · {post.comment_count} commentaires</span><span>{post.save_count} sauvegardes · {post.share_count} partages</span><time>{new Date(post.published_at ?? post.created_at).toLocaleDateString("fr-FR")}</time><footer>{post.status === "published" && <button onClick={() => void manage(post.id, "hide")}>Masquer</button>}{["hidden", "archived"].includes(post.status) && <button onClick={() => void manage(post.id, "republish")}>Republier</button>}{post.status !== "archived" && <button onClick={() => void manage(post.id, "archive")}>Archiver</button>}<button className="danger" onClick={() => void manage(post.id, "delete")}>Supprimer</button></footer></div></article>)}</div>}
    </article>}
  </section>;
}
