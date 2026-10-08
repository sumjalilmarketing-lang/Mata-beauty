"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diversifyFeed, matchesSocialFeedFilter, socialFeedFilters, type SocialFeedFilter } from "@/lib/domain/social-feed";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthenticatedProfile } from "./auth-modal";
import { LocationPicker } from "./location-picker";
import { distanceKm, matchesSearch, type Coordinates } from "@/lib/domain/location";
import { feedPrice, publicProfessionalName } from "@/lib/domain/feed-presentation";
import { feedText } from "@/lib/domain/feed-copy";

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

const FEED_BATCH_SIZE = 8;
const FEED_CACHE_KEY = "mata-social-feed-cache-v2";
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

function mapFeedPost(row: SocialFeedRow): FeedPost {
  return {
    id: row.id, authorId: row.author_id, caption: row.caption, videoUrl: row.video_url, thumbnailUrl: row.thumbnail_url,
    durationSeconds: Number(row.duration_seconds), viewCount: Number(row.view_count), likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count), saveCount: Number(row.save_count), shareCount: Number(row.share_count),
    publishedAt: row.published_at, businessName: publicProfessionalName(row.business_name), slug: row.slug, city: row.city,
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

async function usableSignedUrl(bucketId: string, storagePath: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucketId).createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolvePrivateMedia(row: SocialFeedRow): Promise<SocialFeedRow | null> {
  const privateItems = (row.media_items ?? []).filter((item) => item.bucket_id === "provider-social-media");
  if (!privateItems.length) return row;
  const signedMedia = await Promise.all(privateItems.map((item) => usableSignedUrl(item.bucket_id, item.storage_path)));
  if (signedMedia.some((url) => !url)) return null;
  const primary = privateItems[0];
  const signedThumbnail = primary?.thumbnail_path ? await usableSignedUrl(primary.bucket_id, primary.thumbnail_path) : null;
  return { ...row, video_url: signedMedia[0]!, thumbnail_url: signedThumbnail, media_urls: signedMedia.filter((url): url is string => Boolean(url)) };
}

export function SocialFeed({ authenticated, authPending = false, onRequireAuth, onDiscover, onPublish, onOpenProvider, onBook, location }: {
  location: { area: string; position: Coordinates | null; providers: Array<{ profileId: string; serviceId: string; area: string; address?: string; coordinates?: Coordinates }>; onChange: (area: string, position: Coordinates | null) => void };
  authenticated: AuthenticatedProfile | null;
  authPending?: boolean;
  onRequireAuth: () => void;
  onDiscover: () => void;
  onPublish: () => void;
  onOpenProvider: (authorId: string) => void;
  onBook: (authorId: string, service: { id: string; title: string; duration_minutes: number; price_amount: number }, sourcePostId: string) => void;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
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
  const commentsDialog = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!commentsPost) return;
    const previous = document.activeElement;
    commentsDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [commentsPost]);
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
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

  const visiblePosts = useMemo(() => diversifyFeed(posts
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
      ? (distanceKm(location.position, location.providers.find((item) => item.serviceId === a.serviceId)?.coordinates) ?? Infinity) - (distanceKm(location.position, location.providers.find((item) => item.serviceId === b.serviceId)?.coordinates) ?? Infinity) : 0), [bookingInterests, favoriteProviders, feedFilter, followed, liked, location, posts, realAvailability, saved]);

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
    const cached = readFeedCache();
    if (cached.length) { setPosts(cached); setState("ready"); }
    else setState("loading");
    const { data, error } = await supabase.from("social_feed").select("*").order("published_at", { ascending: false }).order("id", { ascending: false }).limit(FEED_BATCH_SIZE).abortSignal(signal);
    if (signal.aborted || generation !== loadGeneration.current) return;
    if (error) { if (!cached.length) setState("error"); else setFeedback("Réseau lent · inspirations enregistrées affichées."); return; }
    const resolved = await Promise.all((data ?? []).map((row: SocialFeedRow) => resolvePrivateMedia(row)));
    if (signal.aborted || generation !== loadGeneration.current) return;
    const mapped = resolved.filter((row): row is SocialFeedRow => Boolean(row)).map(mapFeedPost);
    const ranked = diversifyFeed(mapped);
    setPosts(ranked);
    writeFeedCache(ranked);
    setHasMore(mapped.length === FEED_BATCH_SIZE);
    const last = (data ?? []).at(-1) as SocialFeedRow | undefined;
    feedCursor.current = last ? { publishedAt: last.published_at, id: last.id } : null;
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
  }, [authenticated]);

  const loadMore = useCallback(async () => {
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
  }, [hasMore]);

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
    const rememberedId = window.sessionStorage.getItem("mata-feed-active-post");
    const rememberedIndex = visiblePosts.findIndex((post) => post.id === rememberedId);
    if (rememberedIndex < 0) return;
    setActiveIndex(rememberedIndex);
    window.requestAnimationFrame(() => cards.current[rememberedIndex]?.scrollIntoView({ block: "start" }));
  }, [state, visiblePosts]);

  useEffect(() => {
    const visibilityChanged = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, []);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      const post = visiblePosts[index];
      if (pageVisible && index === activeIndex && post && !pausedPosts.has(post.id)) void video.play().catch(() => undefined); else video.pause();
    });
    const post = visiblePosts[activeIndex];
    if (!post || !pageVisible) return;
    window.sessionStorage.setItem("mata-feed-active-post", post.id);
    const timer = window.setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const sessionHash = await getSessionHash();
      if (pageRequests.current.signal.aborted) return;
      await supabase.rpc("record_video_view", { target_post_id: post.id, target_session_hash: sessionHash, target_watched_ms: 2000, target_completed: false }).abortSignal(pageRequests.current.signal);
    }, 2000);
    if (activeIndex >= visiblePosts.length - 3) void loadMore();
    return () => window.clearTimeout(timer);
  }, [activeIndex, getSessionHash, loadMore, pageVisible, pausedPosts, visiblePosts]);

  useEffect(() => {
    const post = visiblePosts[activeIndex];
    const video = videos.current[activeIndex];
    if (pageVisible && post && video && !videoLoading.has(post.id) && !pausedPosts.has(post.id)) void video.play().catch(() => undefined);
  }, [activeIndex, pageVisible, pausedPosts, videoLoading, visiblePosts]);

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

  async function openComments(post: FeedPost) {
    const request = ++commentRequest.current;
    setCommentsPost(post); setComments([]); setReplyTo(null); setCommentsState("loading");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setCommentsState("error"); return; }
    const { data, error } = await supabase.from("post_comments").select("id,author_id,parent_id,body,created_at,profiles!post_comments_author_id_fkey(display_name,avatar_url)").eq("post_id", post.id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(50).abortSignal(AbortSignal.timeout(15000));
    if (request !== commentRequest.current) return;
    setCommentsState(error ? "error" : "ready");
    setComments((data ?? []) as unknown as CommentRow[]);
  }

  async function addComment() {
    if (!authenticated) { onRequireAuth(); return; }
    if (!commentsPost || !commentText.trim() || commentPending.current) return;
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

  async function book(post: FeedPost) {
    if (!post.serviceId || !post.serviceTitle || post.durationMinutes === null || post.priceAmount === null) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.rpc("record_post_booking_click", { target_post_id: post.id, target_session_hash: await getSessionHash() });
    onBook(post.authorId, { id: post.serviceId, title: post.serviceTitle, duration_minutes: post.durationMinutes, price_amount: post.priceAmount }, post.id);
  }

  async function openProvider(post: FeedPost) {
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
  const header = useMemo(() => <header className="social-feed-header"><div className="feed-title-row"><strong>MATA</strong><span>INSPIRATION</span><div className="feed-header-actions"><button disabled={authPending} aria-label={t("Publier une vidéo")} onClick={onPublish}>＋</button><button aria-label={t("Rechercher")} onClick={onDiscover}>⌕</button></div></div><nav className="feed-filter-strip" aria-label={t("Filtres du feed")}>{socialFeedFilters.slice(0, 3).map((filter) => <button key={filter} aria-pressed={feedFilter === filter} className={feedFilter === filter ? "active" : ""} onClick={() => selectFilter(filter)}>{t(filter)}</button>)}</nav>{feedFilter === "Près de moi" && <button className="feed-location-toggle" onClick={() => setShowLocation((value) => !value)}>{location.position ? t("Près de vous · 25 km") : location.area || t("Choisir ma zone")} · {t("Modifier")}</button>}{showLocation && <div className="feed-location-panel"><LocationPicker autoLocate area={location.area} position={location.position} suggestions={[...new Set(location.providers.flatMap((provider) => provider.area.split(",").map((part) => part.trim())).filter(Boolean))]} onChange={location.onChange} /><button onClick={() => setShowLocation(false)}>{t("Voir les résultats")}</button></div>}</header>, [authPending, feedFilter, location, onDiscover, onPublish, selectFilter, showLocation, t]);

  if (state === "loading") return <section className="social-feed-shell" lang={locale}>{header}<div className="feed-skeleton" role="status" aria-label={t("Chargement du feed")} /></section>;
  if (state !== "ready") return <section className="social-feed-shell">{header}<div className="social-feed-empty"><span>▶</span><h1>{state === "error" ? t("Le feed est indisponible") : t("Les premières inspirations arrivent bientôt.")}</h1><p>{state === "error" ? t("Réessayez dans quelques instants.") : t("Explorez les prestations et les professionnels près de vous.")}</p><button onClick={state === "error" ? () => void load() : onDiscover}>{state === "error" ? t("Réessayer") : t("Découvrir les professionnels")}</button></div></section>;

  return <section className="social-feed-shell">{header}<div className="social-feed" aria-label={t("Vidéos beauté")} onScroll={(event) => { const node=event.currentTarget; const index=Math.round(node.scrollTop/Math.max(1,node.clientHeight)); if(index!==activeIndex && index>=0 && index<visiblePosts.length) setActiveIndex(index); }}>
    {visiblePosts.length === 0 && <div className="social-feed-empty following-empty"><span>♡</span><h1>{feedFilter === "Près de moi" ? t("Aucun créateur proche pour le moment") : feedFilter === "Tendances" ? t("Les tendances arrivent") : `${t("Aucune inspiration")} ${t(feedFilter)}`}</h1><p>{feedFilter === "Près de moi" ? t("Élargissez votre recherche ou revenez bientôt : les disponibilités locales sont actualisées en continu.") : t("Essayez une autre catégorie pour découvrir des prestations disponibles.")}</p><button onClick={() => setFeedFilter("Pour toi")}>{t("Explorer le feed")}</button></div>}
    {visiblePosts.map((post, index) => <article className="social-video-card" data-post-id={post.id} key={post.id} ref={(node) => { cards.current[index]=node; }} aria-label={`${t("Publication de")} ${post.businessName}`}>
      {post.postType === "video" ? videoErrors.has(post.id) ? <div className="video-fallback"><span>◇</span><p>{t("Cette vidéo ne peut pas être lue.")}</p><button onClick={() => setVideoErrors((current) => { const next=new Set(current); next.delete(post.id); return next; })}>{t("Réessayer")}</button></div> : <video ref={(node) => { videos.current[index]=node; }} src={index===activeIndex || index===activeIndex+1 ? post.videoUrl : undefined} poster={post.thumbnailUrl ?? undefined} muted={muted} loop playsInline preload={index===activeIndex ? "auto" : index===activeIndex+1 ? "metadata" : "none"} onLoadStart={() => setVideoLoading((current) => new Set(current).add(post.id))} onWaiting={() => setVideoLoading((current) => current.has(post.id) ? current : new Set(current).add(post.id))} onPlaying={() => setVideoLoading((current) => { if (!current.has(post.id)) return current; const next = new Set(current); next.delete(post.id); return next; })} onCanPlay={() => setVideoLoading((current) => { const next=new Set(current); next.delete(post.id); return next; })} onTimeUpdate={(event) => { const video=event.currentTarget; const ratio=video.duration ? video.currentTime/video.duration : 0; setProgress((current) => ({ ...current, [post.id]: ratio })); if (ratio>=.95 && !completedViews.current.has(post.id)) { completedViews.current.add(post.id); void getSessionHash().then((hash) => { if (pageRequests.current.signal.aborted) return; return getSupabaseBrowserClient()?.rpc("record_video_view", { target_post_id: post.id, target_session_hash: hash, target_watched_ms: Math.round(video.currentTime*1000), target_completed: true }).abortSignal(pageRequests.current.signal); }); } }} onError={() => setVideoErrors((current) => new Set(current).add(post.id))} /> : post.postType === "before_after" ? <div className="social-before-after"><figure><Image src={post.mediaUrls[0]} alt="Avant" width={540} height={760} unoptimized /><figcaption>{t("Avant")}</figcaption></figure><figure><Image src={post.mediaUrls[1] ?? post.mediaUrls[0]} alt="Après" width={540} height={760} unoptimized /><figcaption>{t("Après")}</figcaption></figure></div> : <Image className="social-photo-media" src={post.mediaUrls[0]} alt={post.title ?? post.caption} width={720} height={960} unoptimized />}
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
  {commentsPost && <div className="comments-backdrop" onMouseDown={(event) => event.target===event.currentTarget && setCommentsPost(null)}><section ref={commentsDialog} className="comments-sheet" onKeyDown={event => { if (event.key === "Escape") { commentRequest.current++; setCommentsPost(null); } if (event.key === "Tab") { const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")); const first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }} role="dialog" aria-modal="true" aria-label={t("Commentaires")}><header><strong>{t("Commentaires")}</strong><button aria-label={t("Fermer")} onClick={() => setCommentsPost(null)}>×</button></header><div>{commentsState === "loading" ? <p role="status">{t("Chargement des commentaires…")}</p> : commentsState === "error" ? <p role="alert">{t("Commentaires indisponibles.")} <button onClick={() => void openComments(commentsPost)}>{t("Réessayer")}</button></p> : comments.length ? comments.map((comment) => <article className={comment.parent_id ? "comment-reply" : ""} key={comment.id}><span>{comment.profiles?.display_name?.slice(0,1) ?? "M"}</span><p><strong>{comment.profiles?.display_name ?? t("Membre Mata")}</strong>{comment.body}<small><button onClick={() => setReplyTo(comment)}>{t("Répondre")}</button>{authenticated?.userId===comment.author_id ? <button onClick={() => void deleteComment(comment)}>{t("Supprimer")}</button> : <button onClick={() => void reportComment(comment)}>{t("Signaler")}</button>}</small></p></article>) : <p className="no-comments">{t("Soyez la première à commenter.")}</p>}</div><footer>{replyTo && <span className="reply-indicator">{t("Réponse à")} {replyTo.profiles?.display_name ?? t("un membre")} <button onClick={() => setReplyTo(null)}>×</button></span>}<input aria-label={t("Ajouter un commentaire")} value={commentText} maxLength={1000} onChange={(event) => setCommentText(event.target.value)} placeholder={t(replyTo ? "Écrire une réponse…" : "Ajouter un commentaire…")} /><button disabled={authPending || commentBusy || !commentText.trim()} onClick={() => void addComment()}>{t("Publier")}</button></footer></section></div>}
  {feedback && <p className="feed-feedback" role="status">{t(feedback)}</p>}
  <button disabled={authPending} className="feed-publish-fab" aria-label={t("Ouvrir le Studio créateur")} onClick={onPublish}>＋</button>
  </section>;
}
