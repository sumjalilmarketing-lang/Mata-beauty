"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diversifyFeed, matchesSocialFeedFilter, socialFeedFilters, type SocialFeedFilter } from "@/lib/domain/social-feed";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthenticatedProfile } from "./auth-modal";
import { LocationPicker } from "./location-picker";
import { distanceKm, matchesSearch, type Coordinates } from "@/lib/domain/location";
import { feedPrice } from "@/lib/domain/feed-presentation";
import { feedText } from "@/lib/domain/feed-copy";
import { readVideoResume, saveVideoResume } from "@/lib/domain/video-resume";
import { orderCommentThreads } from "@/lib/domain/comment-threads";
import { mapFeedPost, refreshFeedPostMedia, resolvePrivateMedia, type FeedPost, type SocialFeedRow } from "@/lib/supabase/social-media";
import "./profile-video.css";

type CommentRow = { like_count?: number; liked?: boolean; id: string; author_id: string; parent_id: string | null; body: string; created_at: string; profiles: { display_name: string | null; avatar_url: string | null } | null };

const FEED_BATCH_SIZE = 8;
const FEED_CACHE_KEY = "mata-social-feed-cache-v3";
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;

function readFeedCache(): FeedPost[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(FEED_CACHE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return [];
    const cache = parsed as { savedAt?: unknown; posts?: unknown };
    if (typeof cache.savedAt !== "number" || Date.now() - cache.savedAt > FEED_CACHE_TTL_MS || !Array.isArray(cache.posts)) return [];
    return cache.posts.filter((post): post is FeedPost => Boolean(post && typeof post === "object" && "id" in post && "videoUrl" in post));
  } catch { return []; }
}

function writeFeedCache(posts: FeedPost[]) {
  try { window.sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), posts })); } catch { /* Cache non critique. */ }
}

export function SocialFeed({ authenticated, authPending = false, onRequireAuth, onDiscover, onPublish, onOpenProvider, onBook, location, collection }: {
  collection?: { posts: FeedPost[]; initialPostId: string; onBack: () => void; onLoadMore: () => void };
  location: { area: string; position: Coordinates | null; providers: Array<{ profileId: string; serviceId: string; area: string; address?: string; coordinates?: Coordinates }>; onChange: (area: string, position: Coordinates | null) => void };
  authenticated: AuthenticatedProfile | null;
  authPending?: boolean;
  onRequireAuth: () => void;
  onDiscover: () => void;
  onPublish: () => void;
  onOpenProvider: (authorId: string) => void;
  onBook: (authorId: string, service: { id: string; title: string; duration_minutes: number; price_amount: number }, sourcePostId: string) => void;
}) {
  const [posts, setPosts] = useState<FeedPost[]>(collection?.posts ?? []);
  const [locale, setLocale] = useState("fr-SN");
  const t = useCallback((text: string) => feedText(text, locale), [locale]);
  useEffect(() => {
    let active = true;
    if (authenticated) void getSupabaseBrowserClient()?.from("profiles").select("locale").eq("id", authenticated.userId).maybeSingle().then(({ data }) => {
      if (active && data?.locale) setLocale(data.locale);
    });
    return () => { active = false; };
  }, [authenticated]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [favoriteProviders, setFavoriteProviders] = useState<Set<string>>(new Set());
  const [bookingInterests, setBookingInterests] = useState<Set<string>>(new Set());
  const [feedFilter, setFeedFilter] = useState<SocialFeedFilter>("Pour toi");
  const [showLocation, setShowLocation] = useState(false);
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsState, setCommentsState] = useState<"loading" | "ready" | "error">("ready");
  const [commentBusy, setCommentBusy] = useState(false);
  const commentPending = useRef(false);
  const commentRequest = useRef(0);
  const commentPlayback = useRef<{ postId: string; time: number; wasPlaying: boolean } | null>(null);
  const commentDragStart = useRef<number | null>(null);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentLikeBusy, setCommentLikeBusy] = useState<Set<string>>(new Set());
  const commentLikePending = useRef(new Set<string>());
  const commentsDialog = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!commentsPost) return;
    const previous = document.activeElement;
    commentsDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [commentsPost]);
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const [videoRefreshing, setVideoRefreshing] = useState<Set<string>>(new Set());
  const [videoLoading, setVideoLoading] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [pausedPosts, setPausedPosts] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [realAvailability, setRealAvailability] = useState<Record<string, string | null>>({});
  const cards = useRef<Array<HTMLElement | null>>([]);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const availabilityRequests = useRef(new Set<string>());
  const filterAnchor = useRef<string | null>(null);
  const appliedFilter = useRef<SocialFeedFilter>("Pour toi");
  const restoredPosition = useRef(false);
  const completedViews = useRef(new Set<string>());
  const loadingMore = useRef(false);
  const pageRequests = useRef(new AbortController());
  const initialPageReady = useRef(false);
  const loadGeneration = useRef(0);
  const feedCursor = useRef<{ publishedAt: string; id: string } | null>(null);

  const visiblePosts = useMemo(() => collection ? posts : diversifyFeed(posts
    .filter((post) => {
      if (feedFilter !== "Près de moi") return matchesSocialFeedFilter(feedFilter, post);
      const provider = location.providers.find((item) => item.serviceId === post.serviceId);
      if (location.position) { const distance = distanceKm(location.position, provider?.coordinates); return distance !== null && distance <= 25; }
      return Boolean(location.area.trim()) && matchesSearch(location.area, `${provider?.area ?? post.city} ${provider?.address ?? ""}`);
    })
    .map((post) => ({ ...post,
      distance: location.position ? distanceKm(location.position, location.providers.find((item) => item.serviceId === post.serviceId)?.coordinates) : null,
      followed: followed.has(post.authorId) || favoriteProviders.has(post.authorId),
      specialtyAffinity: liked.has(post.id) || saved.has(post.id) || [...bookingInterests].some((term) => `${post.serviceTitle ?? ""} ${post.hashtags.join(" ")}`.toLocaleLowerCase("fr").includes(term)) ? 1 : 0,
      proximityScore: 0,
      availableSoon: Boolean((realAvailability[post.id] ?? post.availableAt) && new Date(realAvailability[post.id] ?? post.availableAt ?? 0).getTime() < Date.now()+72*3_600_000),
    }))).sort((a, b) => feedFilter === "Près de moi" && location.position
      ? (distanceKm(location.position, location.providers.find((item) => item.serviceId === a.serviceId)?.coordinates) ?? Infinity) - (distanceKm(location.position, location.providers.find((item) => item.serviceId === b.serviceId)?.coordinates) ?? Infinity) : 0), [bookingInterests, collection, favoriteProviders, feedFilter, followed, liked, location, posts, realAvailability, saved]);

  const getSessionHash = useCallback(async () => {
    const session = window.sessionStorage.getItem("mata-feed-session") ?? crypto.randomUUID();
    window.sessionStorage.setItem("mata-feed-session", session);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }, []);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    initialPageReady.current = false;
    const signal = pageRequests.current.signal;
    if (signal.aborted) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setState("error"); return; }
    let mapped: FeedPost[];
    if (collection) {
      mapped = collection.posts;
      setPosts(mapped);
      setHasMore(false);
    } else {
      const cached = readFeedCache();
      if (cached.length) { setPosts(cached); setState("ready"); }
      else setState("loading");
      const { data, error } = await supabase.from("social_feed").select("*").order("published_at", { ascending: false }).order("id", { ascending: false }).limit(FEED_BATCH_SIZE).abortSignal(signal);
      if (signal.aborted || generation !== loadGeneration.current) return;
      if (error) { if (!cached.length) setState("error"); else setFeedback("Réseau lent · inspirations enregistrées affichées."); return; }
      const resolved = await Promise.all((data ?? []).map((row: SocialFeedRow) => resolvePrivateMedia(row)));
      if (signal.aborted || generation !== loadGeneration.current) return;
      mapped = resolved.filter((row): row is SocialFeedRow => Boolean(row)).map(mapFeedPost);
      const ranked = diversifyFeed(mapped);
      setPosts(ranked);
      writeFeedCache(ranked);
      setHasMore((data ?? []).length === FEED_BATCH_SIZE);
      const last = (data ?? []).at(-1) as SocialFeedRow | undefined;
      feedCursor.current = last ? { publishedAt: last.published_at, id: last.id } : null;
    }
    initialPageReady.current = true;
    setState(mapped.length ? "ready" : "empty");
    if (authenticated) {
      const ids = mapped.map((item) => item.id);
      const authors = [...new Set(mapped.map((item) => item.authorId))];
      const [{ data: likes }, { data: saves }, { data: follows }, { data: favorites }, { data: bookings }] = await Promise.all([
        ids.length ? supabase.from("post_likes").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from("post_saves").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        authors.length ? supabase.from("follows").select("followed_provider_id").in("followed_provider_id", authors) : Promise.resolve({ data: [] }),
        authors.length ? supabase.from("favorites").select("provider_id").in("provider_id", authors) : Promise.resolve({ data: [] }),
        supabase.from("bookings").select("provider_services(title)").eq("client_id", authenticated.userId).order("created_at", { ascending: false }).limit(20),
      ]);
      if (signal.aborted || generation !== loadGeneration.current) return;
      setLiked(new Set((likes ?? []).map((item) => item.post_id)));
      setSaved(new Set((saves ?? []).map((item) => item.post_id)));
      setFollowed(new Set((follows ?? []).map((item) => item.followed_provider_id)));
      setFavoriteProviders(new Set((favorites ?? []).map((item) => item.provider_id)));
      setBookingInterests(new Set((bookings ?? []).flatMap((item) => { const service=item.provider_services as { title?: string } | null; return (service?.title ?? "").toLocaleLowerCase("fr").split(/\s+/).filter((word) => word.length>=4); })));
    }
  }, [authenticated, collection]);

  const loadMore = useCallback(async () => {
    if (collection) { collection.onLoadMore(); return; }
    const generation = loadGeneration.current;
    const signal = pageRequests.current.signal;
    if (!initialPageReady.current || !hasMore || loadingMore.current || signal.aborted) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    loadingMore.current = true;
    try {
      let query = supabase.from("social_feed").select("*").order("published_at", { ascending: false }).order("id", { ascending: false }).limit(FEED_BATCH_SIZE);
      const cursor = feedCursor.current;
      if (cursor) query = query.or(`published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`);
      const { data, error } = await query.abortSignal(signal);
      if (signal.aborted || generation !== loadGeneration.current) return;
      if (error) { setFeedback("La suite des inspirations n’a pas pu être chargée. Actualisez pour réessayer."); return; }
      const resolved = await Promise.all((data ?? []).map((row: SocialFeedRow) => resolvePrivateMedia(row)));
      if (signal.aborted || generation !== loadGeneration.current) return;
      const mapped = resolved.filter((row): row is SocialFeedRow => Boolean(row)).map(mapFeedPost);
      setPosts((current) => { const next = diversifyFeed([...current, ...mapped.filter((item) => !current.some((existing) => existing.id === item.id))]); writeFeedCache(next); return next; });
      const last = (data ?? []).at(-1) as SocialFeedRow | undefined;
      if (last) feedCursor.current = { publishedAt: last.published_at, id: last.id };
      setHasMore((data ?? []).length === FEED_BATCH_SIZE);
    } finally { loadingMore.current = false; }
  }, [collection, hasMore]);

  useEffect(() => {
    if (feedFilter === "Près de moi" && (location.area.trim() || location.position) && state === "ready" && hasMore) void loadMore();
  }, [feedFilter, hasMore, loadMore, location.area, location.position, posts.length, state]);

  useEffect(() => {
    const leave = () => pageRequests.current.abort();
    const resume = () => { if (pageRequests.current.signal.aborted) pageRequests.current = new AbortController(); };
    resume();
    // WebKit may reject fetches while a navigation is pending, before pagehide fires.
    window.addEventListener("beforeunload", leave);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", resume);
    return () => {
      leave();
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", resume);
    };
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const invalidate = () => { window.sessionStorage.removeItem(FEED_CACHE_KEY); void load(); };
    window.addEventListener("mata:feed:invalidate", invalidate);
    return () => window.removeEventListener("mata:feed:invalidate", invalidate);
  }, [load]);

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
    if (appliedFilter.current === feedFilter) return;
    appliedFilter.current = feedFilter;
    const anchorIndex = filterAnchor.current ? visiblePosts.findIndex((post) => post.id === filterAnchor.current) : -1;
    const nextIndex = anchorIndex >= 0 ? anchorIndex : 0;
    setActiveIndex(nextIndex);
    filterAnchor.current = null;
    window.requestAnimationFrame(() => cards.current[nextIndex]?.scrollIntoView({ block: "start" }));
  }, [feedFilter, visiblePosts]);

  useEffect(() => {
    if (restoredPosition.current || state !== "ready" || !visiblePosts.length) return;
    restoredPosition.current = true;
    const rememberedId = collection?.initialPostId ?? window.sessionStorage.getItem("mata-feed-active-post");
    const rememberedIndex = visiblePosts.findIndex((post) => post.id === rememberedId);
    if (rememberedIndex < 0) return;
    setActiveIndex(rememberedIndex);
    window.requestAnimationFrame(() => cards.current[rememberedIndex]?.scrollIntoView({ block: "start" }));
  }, [collection, state, visiblePosts]);

  useEffect(() => {
    const visibilityChanged = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, []);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      const post = visiblePosts[index];
      if (!commentsPost && pageVisible && index === activeIndex && post && !pausedPosts.has(post.id)) void video.play().catch(() => undefined); else video.pause();
    });
    const post = visiblePosts[activeIndex];
    if (!post || !pageVisible || commentsPost) return;
    if (!collection) window.sessionStorage.setItem("mata-feed-active-post", post.id);
    const timer = window.setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const sessionHash = await getSessionHash();
      if (pageRequests.current.signal.aborted) return;
      await supabase.rpc("record_video_view", { target_post_id: post.id, target_session_hash: sessionHash, target_watched_ms: 2000, target_completed: false }).abortSignal(pageRequests.current.signal);
    }, 2000);
    if (activeIndex >= visiblePosts.length - 3) void loadMore();
    return () => window.clearTimeout(timer);
  }, [activeIndex, collection, commentsPost, getSessionHash, loadMore, pageVisible, pausedPosts, visiblePosts]);

  useEffect(() => {
    const post = visiblePosts[activeIndex];
    const video = videos.current[activeIndex];
    if (!commentsPost && pageVisible && post && video && !videoLoading.has(post.id) && !pausedPosts.has(post.id)) void video.play().catch(() => undefined);
  }, [activeIndex, commentsPost, pageVisible, pausedPosts, videoLoading, visiblePosts]);

  useEffect(() => {
    const post = visiblePosts[activeIndex];
    if (!pageVisible || !post || !videoLoading.has(post.id) || videoErrors.has(post.id)) return;
    // Bound only the active player's wait: the next card deliberately loads metadata only.
    const timer = window.setTimeout(() => {
      const video = videos.current[activeIndex];
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
      setVideoErrors(current => new Set(current).add(post.id));
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, pageVisible, videoErrors, videoLoading, visiblePosts]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const candidates = visiblePosts.slice(activeIndex, activeIndex + 2).filter((post) => post.serviceId);
    for (const post of candidates) {
      if (!post.serviceId || availabilityRequests.current.has(post.serviceId)) continue;
      availabilityRequests.current.add(post.serviceId);
      void supabase.rpc("get_available_slots", {
        target_provider_id: post.authorId,
        target_provider_service_id: post.serviceId,
        from_date: new Date().toISOString().slice(0, 10),
        days: 14,
      }).then(({ data }) => {
        const first = Array.isArray(data) ? data[0] as { slot_start?: unknown } | undefined : undefined;
        setRealAvailability((current) => ({ ...current, [post.id]: typeof first?.slot_start === "string" ? first.slot_start : null }));
      });
    }
  }, [activeIndex, visiblePosts]);

  useEffect(() => () => {
    videos.current.forEach((video) => { if (video) { video.pause(); video.removeAttribute("src"); video.load(); } });
    videos.current = [];
    cards.current = [];
  }, []);

  async function toggle(kind: "like" | "save", post: FeedPost) {
    if (!authenticated) { onRequireAuth(); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc(kind === "like" ? "toggle_post_like" : "toggle_post_save", { target_post_id: post.id });
    if (error || !data) { setFeedback("Cette action n’a pas pu être enregistrée."); return; }
    const result = data as { active: boolean; count: number };
    const setter = kind === "like" ? setLiked : setSaved;
    setter((current) => { const next = new Set(current); if (result.active) next.add(post.id); else next.delete(post.id); return next; });
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, [kind === "like" ? "likeCount" : "saveCount"]: result.count } : item));
    setFeedback(kind === "like" ? (result.active ? "Vidéo aimée." : "J’aime retiré.") : (result.active ? "Ajoutée à Mes inspirations." : "Retirée de Mes inspirations."));
  }

  async function follow(post: FeedPost) {
    if (!authenticated) { onRequireAuth(); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("toggle_follow_provider_from_post", { target_provider_id: post.authorId, target_source_post_id: post.id });
    if (error) { setFeedback("L’abonnement n’a pas pu être modifié."); return; }
    setFollowed((current) => { const next = new Set(current); if (data) next.add(post.authorId); else next.delete(post.authorId); return next; });
    setFeedback(data ? `${t("Vous suivez")} ${post.businessName}.` : `${t("Vous ne suivez plus")} ${post.businessName}.`);
  }

  async function share(post: FeedPost) {
    const url = `${window.location.origin}/posts/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${post.businessName} sur Mata Beauty`, text: post.caption, url });
      else await navigator.clipboard.writeText(url);
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setFeedback("Le partage n’a pas pu être effectué."); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const sessionHash = await getSessionHash();
    const { data } = await supabase.rpc("record_post_share", { target_post_id: post.id, target_session_hash: sessionHash });
    if (typeof data === "number") setPosts((current) => current.map((item) => item.id === post.id ? { ...item, shareCount: data } : item));
    setFeedback("Partage enregistré.");
  }

  async function report(post: FeedPost) {
    if (!authenticated) { onRequireAuth(); return; }
    if (!window.confirm(t("Signaler cette vidéo pour contenu inapproprié ?"))) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("report_social_post", { target_post_id: post.id, target_reason: "contenu_inapproprie", target_details: null });
    setFeedback(error ? "Le signalement n’a pas pu être envoyé." : "Signalement transmis à la modération.");
  }

  function closeComments() {
    commentRequest.current++;
    const snapshot = commentPlayback.current;
    if (snapshot) {
      const index = visiblePosts.findIndex(post => post.id === snapshot.postId);
      const video = videos.current[index];
      if (video && Number.isFinite(snapshot.time)) video.currentTime = snapshot.time;
      setPausedPosts(current => {
        const next = new Set(current);
        if (snapshot.wasPlaying) next.delete(snapshot.postId); else next.add(snapshot.postId);
        return next;
      });
    }
    commentPlayback.current = null;
    setCommentsPost(null);
    setCommentsLoadingMore(false);
  }

  async function openComments(post: FeedPost, append = false) {
    if (!commentsPost || commentsPost.id !== post.id) {
      const video = videos.current[visiblePosts.findIndex(item => item.id === post.id)];
      commentPlayback.current = { postId: post.id, time: video?.currentTime ?? 0, wasPlaying: Boolean(video && !video.paused && !video.ended) };
      video?.pause();
      setCommentsPost(post); setReplyTo(null); setCommentText("");
    }
    const request = ++commentRequest.current;
    if (append) setCommentsLoadingMore(true); else { setComments([]); setCommentsState("loading"); }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setCommentsState("error"); setCommentsLoadingMore(false); return; }
    const offset = append ? comments.length : 0;
    const { data, error } = await supabase.from("post_comments").select("id,author_id,parent_id,body,created_at,profiles!post_comments_author_id_fkey(display_name,avatar_url)").eq("post_id", post.id).eq("is_hidden", false).order("created_at", { ascending: true }).order("id").range(offset, offset + 49).abortSignal(AbortSignal.timeout(15000));
    if (request !== commentRequest.current) return;
    if (error) { if (!append) setCommentsState("error"); else setFeedback("Commentaires indisponibles."); setCommentsLoadingMore(false); return; }
    const rows = (data ?? []) as unknown as CommentRow[];
    const { data: reactions, error: reactionError } = rows.length
      ? await supabase.rpc("get_post_comment_likes", { target_comment_ids: rows.map(comment => comment.id) }).abortSignal(AbortSignal.timeout(15000))
      : { data: [], error: null };
    if (request !== commentRequest.current) return;
    if (reactionError) { setCommentsState("error"); setCommentsLoadingMore(false); return; }
    const stats = new Map((reactions as Array<{ comment_id: string; like_count: number; liked: boolean }> ?? []).map(row => [row.comment_id, row]));
    const enriched = rows.map(comment => ({ ...comment, like_count: Number(stats.get(comment.id)?.like_count ?? 0), liked: Boolean(stats.get(comment.id)?.liked) }));
    setComments(current => append ? [...current, ...enriched.filter(comment => !current.some(item => item.id === comment.id))] : enriched);
    setCommentsHasMore(rows.length === 50); setCommentsState("ready"); setCommentsLoadingMore(false);
  }

  async function likeComment(comment: CommentRow) {
    if (!authenticated) { onRequireAuth(); return; }
    if (commentLikePending.current.has(comment.id)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    commentLikePending.current.add(comment.id);
    setCommentLikeBusy(new Set(commentLikePending.current));
    try {
      const { data, error } = await supabase.rpc("set_post_comment_like", { target_comment_id: comment.id, target_liked: !comment.liked });
      if (error || !data) { setFeedback("Cette action n’a pas pu être enregistrée."); return; }
      const result = data as { active: boolean; count: number };
      setComments(current => current.map(item => item.id === comment.id ? { ...item, liked: result.active, like_count: result.count } : item));
    } finally {
      commentLikePending.current.delete(comment.id); setCommentLikeBusy(new Set(commentLikePending.current));
    }
  }

  async function addComment() {
    if (!authenticated) { onRequireAuth(); return; }
    if (!commentsPost || !commentsPost.allowComments || !commentText.trim() || commentPending.current) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    commentPending.current = true; setCommentBusy(true);
    try {
      const { error } = await supabase.from("post_comments").insert({ post_id: commentsPost.id, author_id: authenticated.userId, parent_id: replyTo?.id ?? null, body: commentText.trim() });
      if (error) { setFeedback("Commentaire non publié. Patientez avant de réessayer."); return; }
      setCommentText(""); setReplyTo(null); await openComments(commentsPost);
    } finally { commentPending.current = false; setCommentBusy(false); }
  }

  async function deleteComment(comment: CommentRow) {
    if (!authenticated || comment.author_id !== authenticated.userId || !commentsPost) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("post_comments").delete().eq("id", comment.id);
    if (error) setFeedback("Le commentaire n’a pas pu être supprimé.");
    else await openComments(commentsPost);
  }

  async function reportComment(comment: CommentRow) {
    if (!authenticated) { onRequireAuth(); return; }
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.rpc("report_post_comment", { target_comment_id: comment.id, target_reason: "contenu_inapproprie" });
      setFeedback(error ? "Le signalement n’a pas pu être envoyé." : "Signalement transmis à la modération.");
    }
  }

  async function retryVideo(post: FeedPost) {
    if (videoRefreshing.has(post.id)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setFeedback("La vidéo ne peut pas être rechargée hors connexion."); return; }
    setVideoRefreshing((current) => new Set(current).add(post.id));
    try {
      // Signed media URLs expire. A retry must resolve fresh Storage URLs,
      // rather than asking the browser to request the expired URL again.
      const refreshed = await refreshFeedPostMedia(post.id);
      if (!refreshed) { setFeedback("Le média de cette vidéo n’est pas accessible pour le moment."); return; }
      setPosts((current) => current.map((item) => item.id === post.id ? mapFeedPost(refreshed) : item));
      setVideoLoading((current) => new Set(current).add(post.id));
      setVideoErrors((current) => { const next = new Set(current); next.delete(post.id); return next; });
      setFeedback("");
    } catch {
      setFeedback("Cette vidéo n’a pas pu être rechargée. Vérifiez votre connexion.");
    } finally {
      setVideoRefreshing((current) => { const next = new Set(current); next.delete(post.id); return next; });
    }
  }

  function rememberPlayback(post: FeedPost) {
    const video = videos.current[visiblePosts.findIndex(item => item.id === post.id)];
    if (video) saveVideoResume(post.id, video.currentTime, pausedPosts.has(post.id));
  }

  async function book(post: FeedPost) {
    rememberPlayback(post);
    if (!post.serviceId || !post.serviceTitle || post.durationMinutes === null || post.priceAmount === null) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.rpc("record_post_booking_click", { target_post_id: post.id, target_session_hash: await getSessionHash() });
    onBook(post.authorId, { id: post.serviceId, title: post.serviceTitle, duration_minutes: post.durationMinutes, price_amount: post.priceAmount }, post.id);
  }

  async function openProvider(post: FeedPost) {
    rememberPlayback(post);
    const supabase = getSupabaseBrowserClient();
    if (supabase) void supabase.rpc("record_social_profile_visit", { target_provider_id: post.authorId, target_post_id: post.id, target_session_hash: await getSessionHash() });
    onOpenProvider(post.authorId);
  }

  const selectFilter = useCallback((filter: SocialFeedFilter) => {
    filterAnchor.current = visiblePosts[activeIndex]?.id ?? null;
    setFeedFilter(filter);
    setShowLocation(filter === "Près de moi");
  }, [activeIndex, visiblePosts]);

  const activePost = visiblePosts[activeIndex];
  const header = useMemo(() => collection ? <header className="social-feed-header gallery-player-header"><button onClick={collection.onBack} aria-label={t("Retour à la galerie")}>‹ {t("Retour à la galerie")}</button></header> : <header className="social-feed-header"><div className="feed-title-row"><strong>MATA</strong><span>INSPIRATION</span><div className="feed-header-actions"><button disabled={authPending} aria-label={t("Publier une vidéo")} onClick={onPublish}>＋</button><button aria-label={t("Rechercher")} onClick={onDiscover}>⌕</button></div></div><nav className="feed-filter-strip" aria-label={t("Filtres du feed")}>{socialFeedFilters.slice(0, 3).map((filter) => <button key={filter} aria-pressed={feedFilter === filter} className={feedFilter === filter ? "active" : ""} onClick={() => selectFilter(filter)}>{t(filter)}</button>)}</nav>{feedFilter === "Près de moi" && <button className="feed-location-toggle" onClick={() => setShowLocation((value) => !value)}>{location.position ? t("Près de vous · 25 km") : location.area || t("Choisir ma zone")} · {t("Modifier")}</button>}{showLocation && <div className="feed-location-panel"><LocationPicker autoLocate area={location.area} position={location.position} suggestions={[...new Set(location.providers.flatMap((provider) => provider.area.split(",").map((part) => part.trim())).filter(Boolean))]} onChange={location.onChange} /><button onClick={() => setShowLocation(false)}>{t("Voir les résultats")}</button></div>}</header>, [authPending, collection, feedFilter, location, onDiscover, onPublish, selectFilter, showLocation, t]);

  if (state === "loading") return <section className="social-feed-shell" lang={locale}>{header}<div className="feed-skeleton" role="status" aria-label={t("Chargement du feed")} /></section>;
  if (state !== "ready") return <section className="social-feed-shell">{header}<div className="social-feed-empty"><span>▶</span><h1>{state === "error" ? t("Le feed est indisponible") : t("Les premières inspirations arrivent bientôt.")}</h1><p>{state === "error" ? t("Réessayez dans quelques instants.") : t("Explorez les prestations et les professionnels près de vous.")}</p><button onClick={state === "error" ? () => void load() : onDiscover}>{state === "error" ? t("Réessayer") : t("Découvrir les professionnels")}</button></div></section>;

  return <section className="social-feed-shell">{header}<div className="social-feed" inert={Boolean(commentsPost)} aria-label={t("Vidéos beauté")} onScroll={(event) => { const node=event.currentTarget; const index=Math.round(node.scrollTop/Math.max(1,node.clientHeight)); if(index!==activeIndex && index>=0 && index<visiblePosts.length) setActiveIndex(index); }}>
    {visiblePosts.length === 0 && <div className="social-feed-empty following-empty"><span>♡</span><h1>{feedFilter === "Près de moi" ? t("Aucun créateur proche pour le moment") : feedFilter === "Tendances" ? t("Les tendances arrivent") : `${t("Aucune inspiration")} ${t(feedFilter)}`}</h1><p>{feedFilter === "Près de moi" ? t("Élargissez votre recherche ou revenez bientôt : les disponibilités locales sont actualisées en continu.") : t("Essayez une autre catégorie pour découvrir des prestations disponibles.")}</p><button onClick={() => setFeedFilter("Pour toi")}>{t("Explorer le feed")}</button></div>}
    {visiblePosts.map((post, index) => <article className="social-video-card" data-post-id={post.id} key={post.id} ref={(node) => { cards.current[index]=node; }} aria-label={`${t("Publication de")} ${post.businessName}`}>
      {post.postType === "video" ? videoErrors.has(post.id) ? <div className="video-fallback"><span>◇</span><p>{t("Cette vidéo ne peut pas être lue.")}</p><button disabled={videoRefreshing.has(post.id)} onClick={() => void retryVideo(post)}>{t(videoRefreshing.has(post.id) ? "Rechargement…" : "Réessayer")}</button></div> : <video ref={(node) => { videos.current[index]=node; }} src={index===activeIndex || index===activeIndex+1 ? post.videoUrl : undefined} poster={post.thumbnailUrl ?? undefined} muted={muted} loop playsInline preload={index===activeIndex ? "auto" : index===activeIndex+1 ? "metadata" : "none"} onLoadStart={() => setVideoLoading((current) => new Set(current).add(post.id))} onWaiting={() => setVideoLoading((current) => current.has(post.id) ? current : new Set(current).add(post.id))} onPlaying={() => setVideoLoading((current) => { if (!current.has(post.id)) return current; const next = new Set(current); next.delete(post.id); return next; })} onCanPlay={() => setVideoLoading((current) => { const next=new Set(current); next.delete(post.id); return next; })} onLoadedMetadata={event => { const snapshot = readVideoResume(post.id, event.currentTarget.duration); if (snapshot) { event.currentTarget.currentTime = snapshot.time; if (snapshot.paused) setPausedPosts(current => new Set(current).add(post.id)); } }} onTimeUpdate={(event) => { const video=event.currentTarget; saveVideoResume(post.id, video.currentTime, pausedPosts.has(post.id)); const ratio=video.duration ? video.currentTime/video.duration : 0; setProgress((current) => ({ ...current, [post.id]: ratio })); if (ratio>=.95 && !completedViews.current.has(post.id)) { completedViews.current.add(post.id); void getSessionHash().then((hash) => { if (pageRequests.current.signal.aborted) return; return getSupabaseBrowserClient()?.rpc("record_video_view", { target_post_id: post.id, target_session_hash: hash, target_watched_ms: Math.round(video.currentTime*1000), target_completed: true }).abortSignal(pageRequests.current.signal); }); } }} onError={() => setVideoErrors((current) => new Set(current).add(post.id))} /> : post.postType === "before_after" ? <div className="social-before-after"><figure><Image src={post.mediaUrls[0]} alt="Avant" width={540} height={760} unoptimized /><figcaption>{t("Avant")}</figcaption></figure><figure><Image src={post.mediaUrls[1] ?? post.mediaUrls[0]} alt="Après" width={540} height={760} unoptimized /><figcaption>{t("Après")}</figcaption></figure></div> : <Image className="social-photo-media" src={post.mediaUrls[0]} alt={post.title ?? post.caption} width={720} height={960} unoptimized />}
      {videoLoading.has(post.id) && !videoErrors.has(post.id) && <span className="video-loading" role="status">{t("Chargement…")}</span>}
      <div className="video-shade" />
      <div className="video-progress" role="progressbar" aria-label={t("Progression de la vidéo")} aria-valuenow={Math.round((progress[post.id] ?? 0)*100)}><i style={{ transform: `scaleX(${progress[post.id] ?? 0})` }} /></div>
      {post.postType === "video" && !videoErrors.has(post.id) && <><button className="play-toggle" aria-label={t(pausedPosts.has(post.id) ? "Lire la vidéo" : "Mettre la vidéo en pause")} onClick={() => setPausedPosts((current) => { const next=new Set(current); if(next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; })}>{pausedPosts.has(post.id) && index===activeIndex ? "▶" : ""}</button><button className="sound-toggle" aria-label={t(muted ? "Activer le son" : "Couper le son")} onClick={() => setMuted((value) => !value)}>{muted ? "♩×" : "♩"}</button></>}
      <aside className="social-actions" aria-label={t("Interactions de la publication")}>
        <button className="creator-orb" aria-label={`${t("Profil de")} ${post.businessName}`} onClick={() => void openProvider(post)}>{post.avatarUrl ? <Image src={post.avatarUrl} alt="" width={50} height={50} unoptimized /> : post.businessName.slice(0,2).toUpperCase()}</button>
        <button disabled={authPending} aria-pressed={liked.has(post.id)} className={liked.has(post.id) ? "active" : ""} aria-label={t("J’aime")} onClick={() => void toggle("like",post)}>♥</button>
        <button disabled={authPending} aria-label={t("Commentaires")} onClick={() => void openComments(post)}>◌</button>
        <button disabled={authPending} aria-label={t("Partager")} onClick={() => void share(post)}>↗</button>
        <details className="feed-options"><summary aria-label={t("Plus d’options")}>•••</summary><div>
          <button disabled={authPending} aria-pressed={followed.has(post.authorId)} onClick={() => void follow(post)}>{t(followed.has(post.authorId) ? "Se désabonner" : "Suivre")}</button>
          <button disabled={authPending} aria-pressed={saved.has(post.id)} onClick={() => void toggle("save",post)}>{t(saved.has(post.id) ? "Retirer des inspirations" : "Enregistrer")}</button>
          <button disabled={authPending} onClick={() => void report(post)}>{t("Signaler")}</button>
        </div></details>
      </aside>
      <div className="social-caption">
        <button className="creator-name" onClick={() => void openProvider(post)}>{post.businessName === "Professionnel beauté" ? t(post.businessName) : post.businessName}</button>
        {post.city && <span className="feed-public-location">{post.city}</span>}
        {post.serviceId && post.serviceTitle && post.priceAmount !== null && post.durationMinutes !== null && <div className="linked-service">
          <button className="service-profile-link" onClick={() => void book(post)}><strong>{post.serviceTitle}</strong>{feedPrice(post.priceAmount, post.currency, locale) && <span>{feedPrice(post.priceAmount, post.currency, locale)}</span>}</button>
          <div className="feed-booking-actions"><button className="feed-availability" disabled={authPending} onClick={() => void book(post)}>{t("Voir les disponibilités")}</button><button className="feed-book" disabled={authPending} onClick={() => void book(post)}>{t("Réserver")}</button></div>
        </div>}
      </div>
    </article>)}
  </div>{activePost?.isSponsored && <span className="sponsored-label">{t("Contenu sponsorisé")}</span>}
  {commentsPost && <div className="comments-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeComments(); }}>
    <section ref={commentsDialog} className="comments-sheet enhanced-comments" role="dialog" aria-modal="true" aria-label={t("Commentaires")}
      onKeyDown={event => {
        if (event.key === "Escape") closeComments();
        if (event.key === "Tab") {
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)"));
          const first = items[0], last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header onPointerDown={event => { if (event.target instanceof Element && event.target.closest("button")) return; commentDragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={event => { const start = commentDragStart.current; commentDragStart.current = null; if (start !== null && event.clientY - start > 70) closeComments(); }} onPointerCancel={() => { commentDragStart.current = null; }}>
        <strong>{t("Commentaires")}</strong><button aria-label={t("Fermer")} onClick={closeComments}>×</button>
      </header>
      <div className="comment-list">
        {commentsState === "loading" ? <p role="status">{t("Chargement des commentaires…")}</p> : commentsState === "error" ? <p role="alert">{t("Commentaires indisponibles.")} <button onClick={() => void openComments(commentsPost)}>{t("Réessayer")}</button></p> : comments.length ? orderCommentThreads(comments).map(({ comment, depth }) => <article className={depth > 0 ? "comment-reply" : ""} data-comment-id={comment.id} key={comment.id}>
          <span>{comment.profiles?.avatar_url ? <Image src={comment.profiles.avatar_url} alt="" width={36} height={36} unoptimized /> : comment.profiles?.display_name?.slice(0, 1) ?? "M"}</span>
          <div><strong>{comment.profiles?.display_name ?? t("Membre Mata")}</strong><p>{comment.body}</p><time dateTime={comment.created_at}>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(comment.created_at))}</time>
            <div className="comment-actions"><button aria-pressed={Boolean(comment.liked)} disabled={commentLikeBusy.has(comment.id)} onClick={() => void likeComment(comment)} aria-label={t(comment.liked ? "Retirer le J’aime du commentaire" : "Aimer le commentaire")}>{comment.liked ? "♥" : "♡"} {comment.like_count ?? 0}</button>
              {commentsPost.allowComments && <button onClick={() => setReplyTo(comment)}>{t("Répondre")}</button>}
              {authenticated?.userId === comment.author_id ? <button onClick={() => void deleteComment(comment)}>{t("Supprimer")}</button> : <button onClick={() => void reportComment(comment)}>{t("Signaler")}</button>}
            </div>
          </div>
        </article>) : <p className="no-comments">{t("Soyez la première à commenter.")}</p>}
        {commentsState === "ready" && commentsHasMore && <button className="comments-more" disabled={commentsLoadingMore} onClick={() => void openComments(commentsPost, true)}>{t(commentsLoadingMore ? "Chargement…" : "Afficher plus de commentaires")}</button>}
      </div>
      <footer>{feedback && <p role="status">{t(feedback)}</p>}{commentsPost.allowComments ? <>{replyTo && <span className="reply-indicator">{t("Réponse à")} {replyTo.profiles?.display_name ?? t("un membre")} <button aria-label={t("Annuler la réponse")} onClick={() => setReplyTo(null)}>×</button></span>}<textarea aria-label={t("Ajouter un commentaire")} rows={2} value={commentText} maxLength={1000} onChange={event => setCommentText(event.target.value)} placeholder={t(replyTo ? "Écrire une réponse…" : "Ajouter un commentaire…")} /><button disabled={authPending || commentBusy || !commentText.trim()} onClick={() => void addComment()}>{t("Publier")}</button></> : <p>{t("Les commentaires sont désactivés pour cette vidéo.")}</p>}</footer>
    </section>
  </div>}
  {feedback && <p className="feed-feedback" role="status">{t(feedback)}</p>}
  <button disabled={authPending} className="feed-publish-fab" aria-label={t("Ouvrir le Studio créateur")} onClick={onPublish}>＋</button>
  </section>;
}
