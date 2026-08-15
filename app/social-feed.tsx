"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diversifyFeed } from "@/lib/domain/social-feed";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthenticatedProfile } from "./auth-modal";

type FeedPost = {
  id: string; authorId: string; caption: string; videoUrl: string; thumbnailUrl: string | null;
  durationSeconds: number; viewCount: number; likeCount: number; commentCount: number; saveCount: number; shareCount: number;
  publishedAt: string; businessName: string; slug: string; city: string; verified: boolean; avatarUrl: string | null; isSponsored: boolean;
  serviceId: string | null; serviceTitle: string | null; durationMinutes: number | null; priceAmount: number | null; currency: string | null;
  averageRating: number; reviewCount: number; hashtags: string[];
  postType: "video" | "photo" | "before_after" | "promotion" | "availability";
  title: string | null; locationLabel: string | null; availableAt: string | null;
  promotionDiscount: number | null; promotionEndsAt: string | null; promotionSlots: number | null;
  mediaUrls: string[]; featureType: string | null;
};

type SocialFeedRow = {
  id: string; author_id: string; caption: string; video_url: string; thumbnail_url: string | null; duration_seconds: number | string;
  view_count: number | string; like_count: number | string; comment_count: number | string; save_count: number | string; share_count: number | string;
  published_at: string; business_name: string; slug: string; city: string; verified_at: string | null; avatar_url: string | null; cover_url: string | null;
  is_sponsored: boolean; provider_service_id: string | null; service_title: string | null; duration_minutes: number | null; price_amount: number | null;
  currency: string | null; average_rating: number | string; review_count: number | string; hashtags?: string[]; post_type?: FeedPost["postType"];
  title?: string | null; location_label?: string | null; available_at?: string | null; promotion_discount_percent?: number | string | null;
  promotion_ends_at?: string | null; promotion_slots?: number | null; media_urls?: string[]; feature_type?: string | null;
  media_items?: Array<{ media_type: string; bucket_id: string; storage_path: string; thumbnail_path: string | null }>;
};

type CommentRow = { id: string; author_id: string; parent_id: string | null; body: string; created_at: string; profiles: { display_name: string | null; avatar_url: string | null } | null };

const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const price = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;

function mapFeedPost(row: SocialFeedRow): FeedPost {
  return {
    id: row.id, authorId: row.author_id, caption: row.caption, videoUrl: row.video_url, thumbnailUrl: row.thumbnail_url,
    durationSeconds: Number(row.duration_seconds), viewCount: Number(row.view_count), likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count), saveCount: Number(row.save_count), shareCount: Number(row.share_count),
    publishedAt: row.published_at, businessName: row.business_name, slug: row.slug, city: row.city,
    verified: Boolean(row.verified_at), avatarUrl: row.avatar_url ?? row.cover_url, isSponsored: Boolean(row.is_sponsored),
    serviceId: row.provider_service_id, serviceTitle: row.service_title, durationMinutes: row.duration_minutes,
    priceAmount: row.price_amount, currency: row.currency, averageRating: Number(row.average_rating), reviewCount: Number(row.review_count),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [], postType: row.post_type ?? "video", title: row.title ?? null,
    locationLabel: row.location_label ?? null, availableAt: row.available_at ?? null,
    promotionDiscount: row.promotion_discount_percent === null || row.promotion_discount_percent === undefined ? null : Number(row.promotion_discount_percent),
    promotionEndsAt: row.promotion_ends_at ?? null, promotionSlots: row.promotion_slots ?? null,
    mediaUrls: Array.isArray(row.media_urls) && row.media_urls.length ? row.media_urls : [row.video_url], featureType: row.feature_type ?? null,
  };
}

async function resolvePrivateMedia(row: SocialFeedRow) {
  const privateItems = (row.media_items ?? []).filter((item) => item.bucket_id === "provider-social-media");
  if (!privateItems.length) return row;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return row;
  const signedMedia = await Promise.all(privateItems.map(async (item) => {
    const { data } = await supabase.storage.from(item.bucket_id).createSignedUrl(item.storage_path, 3600);
    return data?.signedUrl ?? null;
  }));
  const primary = privateItems[0];
  const { data: signedThumbnail } = primary?.thumbnail_path ? await supabase.storage.from(primary.bucket_id).createSignedUrl(primary.thumbnail_path, 3600) : { data: null };
  return { ...row, video_url: signedMedia[0] ?? row.video_url, thumbnail_url: signedThumbnail?.signedUrl ?? row.thumbnail_url, media_urls: signedMedia.filter((url): url is string => Boolean(url)) };
}

export function SocialFeed({ authenticated, onRequireAuth, onDiscover, onPublish, onOpenProvider, onBook }: {
  authenticated: AuthenticatedProfile | null;
  onRequireAuth: () => void;
  onDiscover: () => void;
  onPublish: () => void;
  onOpenProvider: (authorId: string) => void;
  onBook: (authorId: string, service: { id: string; title: string; duration_minutes: number; price_amount: number }, sourcePostId: string) => void;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [feedMode, setFeedMode] = useState<"for-you" | "following">("for-you");
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const [videoLoading, setVideoLoading] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const cards = useRef<Array<HTMLElement | null>>([]);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const restoredPosition = useRef(false);
  const completedViews = useRef(new Set<string>());

  const visiblePosts = useMemo(
    () => feedMode === "following" ? posts.filter((post) => followed.has(post.authorId)) : posts,
    [feedMode, followed, posts],
  );

  const getSessionHash = useCallback(async () => {
    const session = window.sessionStorage.getItem("mata-feed-session") ?? crypto.randomUUID();
    window.sessionStorage.setItem("mata-feed-session", session);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }, []);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setState("error"); return; }
    setState("loading");
    const { data, error } = await supabase.from("social_feed").select("*").order("published_at", { ascending: false }).limit(30);
    if (error) { setState("error"); return; }
    const mapped = await Promise.all((data ?? []).map(async (row: SocialFeedRow) => mapFeedPost(await resolvePrivateMedia(row))));
    setPosts(diversifyFeed(mapped));
    setHasMore(mapped.length === 30);
    setState(mapped.length ? "ready" : "empty");
    if (authenticated) {
      const ids = mapped.map((item) => item.id);
      const authors = [...new Set(mapped.map((item) => item.authorId))];
      const [{ data: likes }, { data: saves }, { data: follows }] = await Promise.all([
        ids.length ? supabase.from("post_likes").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from("post_saves").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        authors.length ? supabase.from("follows").select("followed_provider_id").in("followed_provider_id", authors) : Promise.resolve({ data: [] }),
      ]);
      setLiked(new Set((likes ?? []).map((item) => item.post_id)));
      setSaved(new Set((saves ?? []).map((item) => item.post_id)));
      setFollowed(new Set((follows ?? []).map((item) => item.followed_provider_id)));
    }
  }, [authenticated]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("social_feed").select("*").order("published_at", { ascending: false }).range(posts.length, posts.length + 29);
    if (error) return;
    const mapped = await Promise.all((data ?? []).map(async (row: SocialFeedRow) => mapFeedPost(await resolvePrivateMedia(row))));
    setPosts((current) => diversifyFeed([...current, ...mapped]));
    setHasMore(mapped.length === 30);
  }, [hasMore, posts]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio-a.intersectionRatio)[0];
      if (!visible) return;
      const index = cards.current.indexOf(visible.target as HTMLElement);
      if (index >= 0) setActiveIndex(index);
    }, { threshold: [0.65, 0.8] });
    cards.current.forEach((card) => card && observer.observe(card));
    return () => observer.disconnect();
  }, [visiblePosts]);

  useEffect(() => {
    setActiveIndex(0);
    cards.current = [];
    videos.current = [];
  }, [feedMode]);

  useEffect(() => {
    if (restoredPosition.current || state !== "ready" || !visiblePosts.length) return;
    restoredPosition.current = true;
    const rememberedId = window.sessionStorage.getItem("mata-feed-active-post");
    const rememberedIndex = visiblePosts.findIndex((post) => post.id === rememberedId);
    if (rememberedIndex < 0) return;
    setActiveIndex(rememberedIndex);
    window.requestAnimationFrame(() => cards.current[rememberedIndex]?.scrollIntoView({ block: "start" }));
  }, [state, visiblePosts]);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndex && !paused) void video.play().catch(() => undefined); else video.pause();
    });
    const post = visiblePosts[activeIndex];
    if (!post) return;
    window.sessionStorage.setItem("mata-feed-active-post", post.id);
    const timer = window.setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const sessionHash = await getSessionHash();
      await supabase.rpc("record_video_view", { target_post_id: post.id, target_session_hash: sessionHash, target_watched_ms: 2000, target_completed: false });
    }, 2000);
    if (activeIndex >= visiblePosts.length - 3) void loadMore();
    return () => window.clearTimeout(timer);
  }, [activeIndex, getSessionHash, loadMore, paused, visiblePosts]);

  async function toggle(kind: "like" | "save", post: FeedPost) {
    if (!authenticated) { onRequireAuth(); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc(kind === "like" ? "toggle_post_like" : "toggle_post_save", { target_post_id: post.id });
    if (error || !data) return;
    const result = data as { active: boolean; count: number };
    const setter = kind === "like" ? setLiked : setSaved;
    setter((current) => { const next = new Set(current); if (result.active) next.add(post.id); else next.delete(post.id); return next; });
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, [kind === "like" ? "likeCount" : "saveCount"]: result.count } : item));
  }

  async function follow(post: FeedPost) {
    if (!authenticated) { onRequireAuth(); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("toggle_follow_provider", { target_provider_id: post.authorId });
    if (error) return;
    setFollowed((current) => { const next = new Set(current); if (data) next.add(post.authorId); else next.delete(post.authorId); return next; });
  }

  async function share(post: FeedPost) {
    const url = `${window.location.origin}/posts/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${post.businessName} sur Mata Beauty`, text: post.caption, url });
      else await navigator.clipboard.writeText(url);
    } catch { return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const sessionHash = await getSessionHash();
    const { data } = await supabase.rpc("record_post_share", { target_post_id: post.id, target_session_hash: sessionHash });
    if (typeof data === "number") setPosts((current) => current.map((item) => item.id === post.id ? { ...item, shareCount: data } : item));
  }

  async function report(post: FeedPost) {
    if (!authenticated) { onRequireAuth(); return; }
    if (!window.confirm(`Signaler la vidéo de ${post.businessName} pour contenu inapproprié ?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("report_social_post", { target_post_id: post.id, target_reason: "contenu_inapproprie", target_details: null });
    window.alert(error ? "Le signalement n’a pas pu être envoyé." : "Merci. Le signalement a été transmis à la modération.");
  }

  async function openComments(post: FeedPost) {
    setCommentsPost(post); setComments([]); setReplyTo(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from("post_comments").select("id,author_id,parent_id,body,created_at,profiles!post_comments_author_id_fkey(display_name,avatar_url)").eq("post_id", post.id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(50);
    setComments((data ?? []) as unknown as CommentRow[]);
  }

  async function addComment() {
    if (!authenticated) { onRequireAuth(); return; }
    if (!commentsPost || !commentText.trim()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("post_comments").insert({ post_id: commentsPost.id, author_id: authenticated.userId, parent_id: replyTo?.id ?? null, body: commentText.trim() });
    if (!error) { setCommentText(""); setReplyTo(null); await openComments(commentsPost); }
  }

  async function deleteComment(comment: CommentRow) {
    if (!authenticated || comment.author_id !== authenticated.userId || !commentsPost) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase && !((await supabase.from("post_comments").delete().eq("id", comment.id)).error)) await openComments(commentsPost);
  }

  async function reportComment(comment: CommentRow) {
    if (!authenticated) { onRequireAuth(); return; }
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.rpc("report_post_comment", { target_comment_id: comment.id, target_reason: "contenu_inapproprie" });
  }

  async function book(post: FeedPost) {
    if (!post.serviceId || !post.serviceTitle || post.durationMinutes === null || post.priceAmount === null) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.rpc("record_post_booking_click", { target_post_id: post.id, target_session_hash: await getSessionHash() });
    onBook(post.authorId, { id: post.serviceId, title: post.serviceTitle, duration_minutes: post.durationMinutes, price_amount: post.priceAmount }, post.id);
  }

  const activePost = visiblePosts[activeIndex];
  const header = useMemo(() => <header className="social-feed-header"><strong>MATA</strong><nav aria-label="Fil social"><button className={feedMode === "for-you" ? "active" : ""} onClick={() => setFeedMode("for-you")}>Pour toi</button><button className={feedMode === "following" ? "active" : ""} onClick={() => authenticated ? setFeedMode("following") : onRequireAuth()}>Abonnements</button></nav><button aria-label="Rechercher" onClick={onDiscover}>⌕</button></header>, [authenticated, feedMode, onDiscover, onRequireAuth]);

  if (state === "loading") return <section className="social-feed-shell">{header}<div className="feed-skeleton" aria-label="Chargement du feed" /></section>;
  if (state !== "ready") return <section className="social-feed-shell">{header}<div className="social-feed-empty"><span>▶</span><h1>{state === "error" ? "Le feed est indisponible" : "Les premières inspirations arrivent"}</h1><p>{state === "error" ? "Réessayez dans quelques instants." : "Découvrez les professionnels ou publiez la première réalisation depuis votre espace créateur."}</p><button onClick={state === "error" ? () => void load() : onDiscover}>{state === "error" ? "Réessayer" : "Découvrir les professionnels"}</button></div></section>;

  return <section className="social-feed-shell">{header}<div className="social-feed" aria-label="Vidéos beauté">
    {visiblePosts.length === 0 && <div className="social-feed-empty following-empty"><span>♡</span><h1>Aucun abonnement pour le moment</h1><p>Suivez un professionnel depuis une vidéo pour retrouver ses prochaines publications ici.</p><button onClick={() => setFeedMode("for-you")}>Explorer le feed</button></div>}
    {visiblePosts.map((post, index) => <article className="social-video-card" key={post.id} ref={(node) => { cards.current[index]=node; }} aria-label={`Publication de ${post.businessName}`}>
      {post.postType === "video" ? videoErrors.has(post.id) ? <div className="video-fallback"><span>◇</span><p>Cette vidéo ne peut pas être lue.</p><button onClick={() => setVideoErrors((current) => { const next=new Set(current); next.delete(post.id); return next; })}>Réessayer</button></div> : <video ref={(node) => { videos.current[index]=node; }} src={post.videoUrl} poster={post.thumbnailUrl ?? undefined} muted={muted} loop playsInline preload={Math.abs(index-activeIndex)<=1 ? "metadata" : "none"} onLoadStart={() => setVideoLoading((current) => new Set(current).add(post.id))} onCanPlay={() => setVideoLoading((current) => { const next=new Set(current); next.delete(post.id); return next; })} onTimeUpdate={(event) => { const video=event.currentTarget; const ratio=video.duration ? video.currentTime/video.duration : 0; setProgress((current) => ({ ...current, [post.id]: ratio })); if (ratio>=.95 && !completedViews.current.has(post.id)) { completedViews.current.add(post.id); void getSessionHash().then((hash) => getSupabaseBrowserClient()?.rpc("record_video_view", { target_post_id: post.id, target_session_hash: hash, target_watched_ms: Math.round(video.currentTime*1000), target_completed: true })); } }} onError={() => setVideoErrors((current) => new Set(current).add(post.id))} /> : post.postType === "before_after" ? <div className="social-before-after"><figure><Image src={post.mediaUrls[0]} alt="Avant" width={540} height={760} unoptimized /><figcaption>Avant</figcaption></figure><figure><Image src={post.mediaUrls[1] ?? post.mediaUrls[0]} alt="Après" width={540} height={760} unoptimized /><figcaption>Après</figcaption></figure></div> : <Image className="social-photo-media" src={post.mediaUrls[0]} alt={post.title ?? post.caption} width={720} height={960} unoptimized />}
      {videoLoading.has(post.id) && !videoErrors.has(post.id) && <span className="video-loading" role="status">Chargement…</span>}
      <div className="video-shade" />
      <div className="video-progress" role="progressbar" aria-label="Progression de la vidéo" aria-valuenow={Math.round((progress[post.id] ?? 0)*100)}><i style={{ transform: `scaleX(${progress[post.id] ?? 0})` }} /></div>
      {post.postType === "video" && <><button className="play-toggle" aria-label={paused ? "Lire la vidéo" : "Mettre la vidéo en pause"} onClick={() => setPaused((value) => !value)}>{paused && index===activeIndex ? "▶" : ""}</button><button className="sound-toggle" aria-label={muted ? "Activer le son" : "Couper le son"} onClick={() => setMuted((value) => !value)}>{muted ? "♩×" : "♩"}</button></>}
      <aside className="social-actions">
        <button className="creator-orb" aria-label={`Profil de ${post.businessName}`} onClick={() => onOpenProvider(post.authorId)}>{post.avatarUrl ? <Image src={post.avatarUrl} alt="" width={50} height={50} unoptimized /> : post.businessName.slice(0,2).toUpperCase()}</button>
        <button className={`follow-mini ${followed.has(post.authorId) ? "active" : ""}`} aria-label={followed.has(post.authorId) ? "Se désabonner" : "Suivre"} onClick={() => void follow(post)}>{followed.has(post.authorId) ? "✓" : "+"}</button>
        <button className={liked.has(post.id) ? "active" : ""} aria-label="J’aime" onClick={() => void toggle("like",post)}>♥<small>{compact.format(post.likeCount)}</small></button>
        <button aria-label="Commentaires" onClick={() => void openComments(post)}>◌<small>{compact.format(post.commentCount)}</small></button>
        <button className={saved.has(post.id) ? "active" : ""} aria-label="Enregistrer" onClick={() => void toggle("save",post)}>▱<small>{compact.format(post.saveCount)}</small></button>
        <button aria-label="Partager" onClick={() => void share(post)}>↗<small>{compact.format(post.shareCount)}</small></button>
        <button aria-label="Signaler" onClick={() => void report(post)}>⚑<small>Signaler</small></button>
      </aside>
      <div className="social-caption"><button className="creator-name" onClick={() => onOpenProvider(post.authorId)}>@{post.slug} {post.verified && <b>✓</b>}</button><span>{post.locationLabel ?? post.city} · ★ {post.averageRating.toFixed(1)} ({post.reviewCount}) · {compact.format(post.viewCount)} vues</span>{post.title && <strong>{post.title}</strong>}<p>{post.caption}</p>{post.postType === "promotion" && post.promotionDiscount !== null && <span className="social-offer">−{post.promotionDiscount}% · {post.promotionSlots ?? "Places limitées"} place(s)</span>}{post.postType === "availability" && post.availableAt && <span className="social-offer">Disponible {new Date(post.availableAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>}<span>{(post.hashtags.length ? post.hashtags : ["matabeauty"]).map((tag) => `#${tag}`).join(" · ")}</span><button className="profile-link" onClick={() => onOpenProvider(post.authorId)}>Voir le profil</button>{post.serviceId && post.serviceTitle && post.priceAmount !== null && post.durationMinutes !== null && <div className="linked-service"><div><small>PRESTATION LIÉE</small><strong>{post.serviceTitle}</strong><span>{post.durationMinutes} min · à partir de {price(post.priceAmount)}</span></div><button onClick={() => void book(post)}>Réserver</button></div>}</div>
    </article>)}
  </div>{activePost?.isSponsored && <span className="sponsored-label">Contenu sponsorisé</span>}
  {commentsPost && <div className="comments-backdrop" onMouseDown={(event) => event.target===event.currentTarget && setCommentsPost(null)}><section className="comments-sheet" role="dialog" aria-modal="true" aria-label="Commentaires"><header><strong>Commentaires</strong><button aria-label="Fermer" onClick={() => setCommentsPost(null)}>×</button></header><div>{comments.length ? comments.map((comment) => <article className={comment.parent_id ? "comment-reply" : ""} key={comment.id}><span>{comment.profiles?.display_name?.slice(0,1) ?? "M"}</span><p><strong>{comment.profiles?.display_name ?? "Membre Mata"}</strong>{comment.body}<small><button onClick={() => setReplyTo(comment)}>Répondre</button>{authenticated?.userId===comment.author_id ? <button onClick={() => void deleteComment(comment)}>Supprimer</button> : <button onClick={() => void reportComment(comment)}>Signaler</button>}</small></p></article>) : <p className="no-comments">Soyez la première à commenter.</p>}</div><footer>{replyTo && <span className="reply-indicator">Réponse à {replyTo.profiles?.display_name ?? "un membre"} <button onClick={() => setReplyTo(null)}>×</button></span>}<input aria-label="Ajouter un commentaire" value={commentText} maxLength={1000} onChange={(event) => setCommentText(event.target.value)} placeholder={replyTo ? "Écrire une réponse…" : "Ajouter un commentaire…"} /><button disabled={!commentText.trim()} onClick={() => void addComment()}>Publier</button></footer></section></div>}
  <button className="feed-publish-fab" aria-label="Publier une vidéo" onClick={onPublish}>＋</button>
  </section>;
}
