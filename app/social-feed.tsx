"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diversifyFeed, matchesSocialFeedFilter, socialFeedFilters, type SocialFeedFilter } from "@/lib/domain/social-feed";
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
const FEED_BATCH_SIZE = 8;
const COMMENT_BATCH_SIZE = 20;
const FEED_CACHE_KEY = "mata-social-feed-cache-v1";
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

async function usableSignedUrl(bucketId: string, storagePath: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const segments = storagePath.split("/");
  const fileName = segments.pop();
  if (!fileName) return null;
  const { data: files, error: listError } = await supabase.storage.from(bucketId).list(segments.join("/"), { limit: 1, search: fileName });
  if (listError || !files?.some((file) => file.name === fileName)) return null;
  const { data, error } = await supabase.storage.from(bucketId).createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolvePrivateMedia(row: SocialFeedRow): Promise<SocialFeedRow | null> {
  const privateItems = (row.media_items ?? []).filter((item) => item.bucket_id === "provider-social-media");
  if (!privateItems.length) {
    const legacyVideoPath = row.video_url.split("/social-videos/")[1]?.split("?")[0];
    if (!legacyVideoPath) return row;
    const signedVideo = await usableSignedUrl("social-videos", decodeURIComponent(legacyVideoPath));
    if (!signedVideo) return null;
    const legacyThumbnailPath = row.thumbnail_url?.split("/social-thumbnails/")[1]?.split("?")[0];
    const signedThumbnail = legacyThumbnailPath ? await usableSignedUrl("social-thumbnails", decodeURIComponent(legacyThumbnailPath)) : null;
    return { ...row, video_url: signedVideo, thumbnail_url: signedThumbnail, media_urls: [signedVideo] };
  }
  const signedMedia = await Promise.all(privateItems.map((item) => usableSignedUrl(item.bucket_id, item.storage_path)));
  if (signedMedia.some((url) => !url)) return null;
  const primary = privateItems[0];
  const signedThumbnail = primary?.thumbnail_path ? await usableSignedUrl(primary.bucket_id, primary.thumbnail_path) : null;
  return { ...row, video_url: signedMedia[0]!, thumbnail_url: signedThumbnail, media_urls: signedMedia.filter((url): url is string => Boolean(url)) };
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
  const [favoriteProviders, setFavoriteProviders] = useState<Set<string>>(new Set());
  const [bookingInterests, setBookingInterests] = useState<Set<string>>(new Set());
  const [feedFilter, setFeedFilter] = useState<SocialFeedFilter>("Pour toi");
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const [videoLoading, setVideoLoading] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [pausedPosts, setPausedPosts] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [realAvailability, setRealAvailability] = useState<Record<string, string | null>>({});
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeHashtag, setActiveHashtag] = useState("");
  const [servicePromotions,setServicePromotions]=useState<Record<string,{title:string;price:number;endsAt:string}>>({});
  const cards = useRef<Array<HTMLElement | null>>([]);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const availabilityRequests = useRef(new Set<string>());
  const filterAnchor = useRef<string | null>(null);
  const appliedFilter = useRef<SocialFeedFilter>("Pour toi");
  const restoredPosition = useRef(false);
  const completedViews = useRef(new Set<string>());

  const visiblePosts = useMemo(() => diversifyFeed(posts
    .map((post) => ({ ...post,
      followed: followed.has(post.authorId) || favoriteProviders.has(post.authorId),
      specialtyAffinity: liked.has(post.id) || saved.has(post.id) || [...bookingInterests].some((term) => `${post.serviceTitle ?? ""} ${post.hashtags.join(" ")}`.toLocaleLowerCase("fr").includes(term)) ? 1 : 0,
      proximityScore: post.city.toLocaleLowerCase("fr").includes("dakar") ? 1 : 0,
      availableSoon: Boolean((realAvailability[post.id] ?? post.availableAt) && new Date(realAvailability[post.id] ?? post.availableAt ?? 0).getTime() < Date.now()+72*3_600_000),
    }))
    .filter((post) => feedFilter === "Abonnements" ? post.followed : matchesSocialFeedFilter(feedFilter, post))
    .filter((post) => !activeHashtag || post.hashtags.includes(activeHashtag))
    .filter((post) => {
      const query = searchQuery.trim().toLocaleLowerCase("fr");
      if (!query) return true;
      return `${post.businessName} ${post.slug} ${post.caption} ${post.title ?? ""} ${post.serviceTitle ?? ""} ${post.city} ${post.locationLabel ?? ""} ${post.hashtags.join(" ")}`.toLocaleLowerCase("fr").includes(query);
    })), [activeHashtag, bookingInterests, favoriteProviders, feedFilter, followed, liked, posts, realAvailability, saved, searchQuery]);

  const getSessionHash = useCallback(async () => {
    const session = window.sessionStorage.getItem("mata-feed-session") ?? crypto.randomUUID();
    window.sessionStorage.setItem("mata-feed-session", session);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }, []);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setState("error"); return; }
    const cached = readFeedCache();
    if (cached.length) { setPosts(cached); setState("ready"); }
    else setState("loading");
    const targetPostId = new URLSearchParams(window.location.search).get("post");
    const [{ data, error }, targetResult] = await Promise.all([
      supabase.from("social_feed").select("*").order("published_at", { ascending: false }).limit(FEED_BATCH_SIZE),
      targetPostId ? supabase.from("social_feed").select("*").eq("id", targetPostId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (error) { if (!cached.length) setState("error"); else setFeedback("Réseau lent · inspirations enregistrées affichées."); return; }
    const sourceRows = [...(targetResult.data ? [targetResult.data as SocialFeedRow] : []), ...(data ?? []).filter((row: SocialFeedRow) => row.id !== targetPostId)];
    const resolved = await Promise.all(sourceRows.map((row: SocialFeedRow) => resolvePrivateMedia(row)));
    const mapped = resolved.filter((row): row is SocialFeedRow => Boolean(row)).map(mapFeedPost);
    const ranked = diversifyFeed(mapped);
    setPosts(ranked);
    writeFeedCache(ranked);
    setHasMore(mapped.length === FEED_BATCH_SIZE);
    setState(mapped.length ? "ready" : "empty");
    const serviceIds=[...new Set(mapped.flatMap(item=>item.serviceId?[item.serviceId]:[]))];
    if(serviceIds.length){const now=new Date().toISOString();const{data:offerRows}=await supabase.from("promotions").select("provider_service_id,title,discount_type,discount_value,promotional_price_amount,ends_at,provider_services(price_amount)").in("provider_service_id",serviceIds).eq("status","published").eq("is_active",true).lte("starts_at",now).gt("ends_at",now);setServicePromotions(Object.fromEntries(((offerRows??[]) as unknown as Array<{provider_service_id:string;title:string;discount_type:"percentage"|"fixed";discount_value:number;promotional_price_amount:number|null;ends_at:string;provider_services:{price_amount:number}|null}>).map(item=>{const base=item.provider_services?.price_amount??0;const promo=item.promotional_price_amount??(item.discount_type==="percentage"?Math.round(base*(1-item.discount_value/100)):Math.max(0,base-item.discount_value));return[item.provider_service_id,{title:item.title,price:promo,endsAt:item.ends_at}]})));}
    const authors = [...new Set(mapped.map((item) => item.authorId))];
    if (authors.length) {
      const { data: counts } = await supabase.rpc("get_provider_follower_counts", { target_provider_ids: authors });
      setFollowerCounts(Object.fromEntries(((counts ?? []) as Array<{ provider_id: string; follower_count: number | string }>).map((item) => [item.provider_id, Number(item.follower_count)])));
    }
    if (authenticated) {
      const ids = mapped.map((item) => item.id);
      const [{ data: likes }, { data: saves }, { data: follows }, { data: favorites }, { data: bookings }] = await Promise.all([
        ids.length ? supabase.from("post_likes").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from("post_saves").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        authors.length ? supabase.from("follows").select("followed_provider_id").in("followed_provider_id", authors) : Promise.resolve({ data: [] }),
        authors.length ? supabase.from("favorites").select("provider_id").in("provider_id", authors) : Promise.resolve({ data: [] }),
        supabase.from("bookings").select("provider_services(title)").eq("client_id", authenticated.userId).order("created_at", { ascending: false }).limit(20),
      ]);
      setLiked(new Set((likes ?? []).map((item) => item.post_id)));
      setSaved(new Set((saves ?? []).map((item) => item.post_id)));
      setFollowed(new Set((follows ?? []).map((item) => item.followed_provider_id)));
      setFavoriteProviders(new Set((favorites ?? []).map((item) => item.provider_id)));
      setBookingInterests(new Set((bookings ?? []).flatMap((item) => { const service=item.provider_services as { title?: string } | null; return (service?.title ?? "").toLocaleLowerCase("fr").split(/\s+/).filter((word) => word.length>=4); })));
    }
  }, [authenticated]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("social_feed").select("*").order("published_at", { ascending: false }).range(posts.length, posts.length + FEED_BATCH_SIZE - 1);
    if (error) return;
    const resolved = await Promise.all((data ?? []).map((row: SocialFeedRow) => resolvePrivateMedia(row)));
    const mapped = resolved.filter((row): row is SocialFeedRow => Boolean(row)).map(mapFeedPost);
    setPosts((current) => { const next = diversifyFeed([...current, ...mapped.filter((item) => !current.some((existing) => existing.id === item.id))]); writeFeedCache(next); return next; });
    setHasMore(mapped.length === FEED_BATCH_SIZE);
  }, [hasMore, posts]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const hashtag = new URLSearchParams(window.location.search).get("hashtag")?.toLocaleLowerCase("fr").replace(/[^a-z0-9_]/g, "") ?? "";
    if (hashtag) setActiveHashtag(hashtag);
  }, []);

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
    videos.current.forEach((video, index) => {
      if (!video) return;
      const post = visiblePosts[index];
      if (index === activeIndex && post && !pausedPosts.has(post.id)) void video.play().catch(() => undefined); else video.pause();
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
  }, [activeIndex, getSessionHash, loadMore, pausedPosts, visiblePosts]);

  useEffect(() => {
    const post = visiblePosts[activeIndex];
    const video = videos.current[activeIndex];
    if (post && video && !videoLoading.has(post.id) && !pausedPosts.has(post.id)) void video.play().catch(() => undefined);
  }, [activeIndex, pausedPosts, videoLoading, visiblePosts]);

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
    setFollowerCounts((current) => ({ ...current, [post.authorId]: Math.max(0, (current[post.authorId] ?? 0) + (data ? 1 : -1)) }));
    setFeedback(data ? `Vous suivez ${post.businessName}.` : `Vous ne suivez plus ${post.businessName}.`);
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
    setFeedback("Partage enregistré.");
  }

  async function report(post: FeedPost) {
    if (!authenticated) { onRequireAuth(); return; }
    if (!window.confirm(`Signaler la vidéo de ${post.businessName} pour contenu inapproprié ?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("report_social_post", { target_post_id: post.id, target_reason: "contenu_inapproprie", target_details: null });
    setFeedback(error ? "Le signalement n’a pas pu être envoyé." : "Signalement transmis à la modération.");
  }

  async function loadComments(post: FeedPost, offset = 0) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setCommentsLoading(true);
    const { data, error } = await supabase.from("post_comments").select("id,author_id,parent_id,body,created_at,profiles!post_comments_author_id_fkey(display_name,avatar_url)").eq("post_id", post.id).eq("is_hidden", false).order("created_at", { ascending: false }).range(offset, offset + COMMENT_BATCH_SIZE - 1);
    setCommentsLoading(false);
    if (error) { setFeedback("Les commentaires sont momentanément indisponibles."); return; }
    const rows = (data ?? []) as unknown as CommentRow[];
    setComments((current) => offset ? [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))] : rows);
    setCommentsHasMore(rows.length === COMMENT_BATCH_SIZE);
  }

  async function openComments(post: FeedPost) {
    setCommentsPost(post); setComments([]); setCommentsHasMore(false); setReplyTo(null);
    await loadComments(post);
  }

  async function addComment() {
    if (!authenticated) { onRequireAuth(); return; }
    if (!commentsPost || !commentText.trim()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("post_comments").insert({ post_id: commentsPost.id, author_id: authenticated.userId, parent_id: replyTo?.id ?? null, body: commentText.trim() });
    if (!error) { setCommentText(""); setReplyTo(null); await loadComments(commentsPost); }
  }

  async function deleteComment(comment: CommentRow) {
    if (!authenticated || comment.author_id !== authenticated.userId || !commentsPost) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase && !((await supabase.from("post_comments").delete().eq("id", comment.id)).error)) await loadComments(commentsPost);
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

  async function openProvider(post: FeedPost) {
    const supabase = getSupabaseBrowserClient();
    if (supabase) void supabase.rpc("record_social_profile_visit", { target_provider_id: post.authorId, target_post_id: post.id, target_session_hash: await getSessionHash() });
    onOpenProvider(post.authorId);
  }

  const selectFilter = useCallback((filter: SocialFeedFilter) => {
    filterAnchor.current = visiblePosts[activeIndex]?.id ?? null;
    setFeedFilter(filter);
  }, [activeIndex, visiblePosts]);

  const selectHashtag = useCallback((tag: string) => {
    const normalized = tag.toLocaleLowerCase("fr").replace(/[^a-z0-9_]/g, "");
    if (!normalized) return;
    setActiveHashtag(normalized);
    setFeedFilter("Pour toi");
    setActiveIndex(0);
    window.history.pushState({}, "", `/feed?hashtag=${encodeURIComponent(normalized)}`);
    window.requestAnimationFrame(() => cards.current[0]?.scrollIntoView({ block: "start" }));
  }, []);

  const clearHashtag = useCallback(() => {
    setActiveHashtag("");
    window.history.pushState({}, "", "/feed");
  }, []);

  const activePost = visiblePosts[activeIndex];
  const header = useMemo(() => <header className={`social-feed-header ${searchOpen ? "searching" : ""}`}><div className="feed-title-row"><strong>MATA</strong><span>INSPIRATION</span><div className="feed-header-actions"><button aria-label="Publier une vidéo" onClick={onPublish}>＋</button><button aria-label="Rechercher dans les vidéos" onClick={() => setSearchOpen((value) => !value)}>⌕</button></div></div>{searchOpen && <div className="feed-search"><input autoFocus aria-label="Rechercher vidéos, professionnels, prestations ou hashtags" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Vidéo, #hashtag, pro, prestation, ville…" /><button onClick={onDiscover}>Catalogue</button></div>}{activeHashtag && <div className="active-hashtag"><span>#{activeHashtag}</span><button aria-label="Effacer le filtre hashtag" onClick={clearHashtag}>×</button></div>}<nav className="feed-filter-strip" aria-label="Filtres du feed">{socialFeedFilters.map((filter) => <button key={filter} aria-pressed={feedFilter === filter} className={feedFilter === filter ? "active" : ""} onClick={() => selectFilter(filter)}>{filter}</button>)}</nav></header>, [activeHashtag, clearHashtag, feedFilter, onDiscover, onPublish, searchOpen, searchQuery, selectFilter]);

  if (state === "loading") return <section className="social-feed-shell">{header}<div className="feed-skeleton" aria-label="Chargement du feed" /></section>;
  if (state !== "ready") return <section className="social-feed-shell">{header}<div className="social-feed-empty"><span>▶</span><h1>{state === "error" ? "Le feed est indisponible" : "Les premières inspirations arrivent"}</h1><p>{state === "error" ? "Réessayez dans quelques instants." : "Découvrez les professionnels ou publiez la première réalisation depuis votre espace créateur."}</p><button onClick={state === "error" ? () => void load() : onDiscover}>{state === "error" ? "Réessayer" : "Découvrir les professionnels"}</button></div></section>;

  return <section className="social-feed-shell">{header}<div className="social-feed" aria-label="Vidéos beauté" onScroll={(event) => { const node=event.currentTarget; const index=Math.round(node.scrollTop/Math.max(1,node.clientHeight)); if(index!==activeIndex && index>=0 && index<visiblePosts.length) setActiveIndex(index); }}>
    {visiblePosts.length === 0 && <div className="social-feed-empty following-empty"><span>♡</span><h1>{feedFilter === "Abonnements" ? "Votre feed Abonnements est prêt" : feedFilter === "Près de moi" ? "Aucun créateur proche pour le moment" : feedFilter === "Tendances" ? "Les tendances arrivent" : activeHashtag ? `Aucune vidéo #${activeHashtag}` : searchQuery ? "Aucun résultat vidéo" : `Aucune inspiration ${feedFilter}`}</h1><p>{feedFilter === "Abonnements" ? "Suivez des professionnels pour retrouver ici uniquement leurs nouvelles publications." : feedFilter === "Près de moi" ? "Élargissez votre recherche ou revenez bientôt : les disponibilités locales sont actualisées en continu." : "Essayez une autre recherche ou catégorie pour découvrir des prestations disponibles."}</p><button onClick={feedFilter === "Abonnements" ? onDiscover : () => { setFeedFilter("Pour toi"); setSearchQuery(""); clearHashtag(); }}>{feedFilter === "Abonnements" ? "Découvrir des professionnels" : "Explorer le feed"}</button></div>}
    {visiblePosts.map((post, index) => <article className="social-video-card" key={post.id} ref={(node) => { cards.current[index]=node; }} aria-label={`Publication de ${post.businessName}`}>
      {post.postType === "video" ? videoErrors.has(post.id) ? <div className="video-fallback"><span>◇</span><p>Cette vidéo ne peut pas être lue.</p><button onClick={() => setVideoErrors((current) => { const next=new Set(current); next.delete(post.id); return next; })}>Réessayer</button></div> : <video ref={(node) => { videos.current[index]=node; }} src={index===activeIndex || index===activeIndex+1 ? post.videoUrl : undefined} poster={post.thumbnailUrl ?? undefined} muted={muted} loop playsInline preload={index===activeIndex ? "auto" : index===activeIndex+1 ? "metadata" : "none"} onLoadStart={() => setVideoLoading((current) => new Set(current).add(post.id))} onCanPlay={() => setVideoLoading((current) => { const next=new Set(current); next.delete(post.id); return next; })} onTimeUpdate={(event) => { const video=event.currentTarget; const ratio=video.duration ? video.currentTime/video.duration : 0; setProgress((current) => ({ ...current, [post.id]: ratio })); if (ratio>=.95 && !completedViews.current.has(post.id)) { completedViews.current.add(post.id); void getSessionHash().then((hash) => getSupabaseBrowserClient()?.rpc("record_video_view", { target_post_id: post.id, target_session_hash: hash, target_watched_ms: Math.round(video.currentTime*1000), target_completed: true })); } }} onError={() => setVideoErrors((current) => new Set(current).add(post.id))} /> : post.postType === "before_after" ? <div className="social-before-after"><figure><Image src={post.mediaUrls[0]} alt="Avant" width={540} height={760} unoptimized /><figcaption>Avant</figcaption></figure><figure><Image src={post.mediaUrls[1] ?? post.mediaUrls[0]} alt="Après" width={540} height={760} unoptimized /><figcaption>Après</figcaption></figure></div> : <Image className="social-photo-media" src={post.mediaUrls[0]} alt={post.title ?? post.caption} width={720} height={960} unoptimized />}
      {videoLoading.has(post.id) && !videoErrors.has(post.id) && <span className="video-loading" role="status">Chargement…</span>}
      <div className="video-shade" />
      <div className="video-progress" role="progressbar" aria-label="Progression de la vidéo" aria-valuenow={Math.round((progress[post.id] ?? 0)*100)}><i style={{ transform: `scaleX(${progress[post.id] ?? 0})` }} /></div>
      {post.postType === "video" && <><button className="play-toggle" aria-label={pausedPosts.has(post.id) ? "Lire la vidéo" : "Mettre la vidéo en pause"} onClick={() => setPausedPosts((current) => { const next=new Set(current); if(next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; })}>{pausedPosts.has(post.id) && index===activeIndex ? "▶" : ""}</button><button className="sound-toggle" aria-label={muted ? "Activer le son" : "Couper le son"} onClick={() => setMuted((value) => !value)}>{muted ? "♩×" : "♩"}</button></>}
      <aside className="social-actions">
        <button className="creator-orb" aria-label={`Profil de ${post.businessName}`} onClick={() => void openProvider(post)}>{post.avatarUrl ? <Image src={post.avatarUrl} alt="" width={50} height={50} unoptimized /> : post.businessName.slice(0,2).toUpperCase()}</button><small className="profile-action-label">Profil</small>
        <button className={`follow-mini ${followed.has(post.authorId) ? "active" : ""}`} aria-label={followed.has(post.authorId) ? "Se désabonner" : "Suivre"} onClick={() => void follow(post)}>{followed.has(post.authorId) ? "✓" : "+"}</button><small className="follower-count">{compact.format(followerCounts[post.authorId] ?? 0)}</small>
        <button className={liked.has(post.id) ? "active" : ""} aria-label="J’aime" onClick={() => void toggle("like",post)}>♥<small>{compact.format(post.likeCount)}</small></button>
        <button aria-label="Commentaires" onClick={() => void openComments(post)}>◌<small>{compact.format(post.commentCount)}</small></button>
        <button className={saved.has(post.id) ? "active" : ""} aria-label="Enregistrer" onClick={() => void toggle("save",post)}>▱<small>{compact.format(post.saveCount)}</small></button>
        <button aria-label="Partager" onClick={() => void share(post)}>↗<small>{compact.format(post.shareCount)}</small></button>
        <button aria-label="Signaler" onClick={() => void report(post)}>⚑<small>Signaler</small></button>
      </aside>
      <div className="social-caption"><button className="creator-name" onClick={() => void openProvider(post)}>@{post.slug} {post.verified && <b>✓</b>}</button><span>{post.locationLabel ?? post.city} · {post.serviceTitle ?? "Beauté professionnelle"} · ★ {post.averageRating.toFixed(1)}</span>{post.title && <strong>{post.title}</strong>}<p>{post.caption}</p>{post.postType === "promotion" && post.promotionDiscount !== null && <span className="social-offer">−{post.promotionDiscount}% · {post.promotionSlots ?? "Places limitées"} place(s)</span>}{post.serviceId&&servicePromotions[post.serviceId]&&<span className="social-offer">{servicePromotions[post.serviceId].title} · {price(servicePromotions[post.serviceId].price)}</span>}<div className="social-hashtags">{(post.hashtags.length ? post.hashtags.slice(0, 5) : ["matabeauty"]).map((tag) => <button key={tag} onClick={() => selectHashtag(tag)}>#{tag}</button>)}</div>{post.serviceId && post.serviceTitle && post.priceAmount !== null && post.durationMinutes !== null && <div className="linked-service"><button className="service-profile-link" onClick={() => void openProvider(post)}><small>PRESTATION · RÉSERVER CETTE PRESTATION</small><strong>{post.serviceTitle}</strong><span>{post.durationMinutes} min · {servicePromotions[post.serviceId]?<><del>{price(post.priceAmount)}</del> {price(servicePromotions[post.serviceId].price)}</>:price(post.priceAmount)}</span><em>{realAvailability[post.id] ? `Prochain créneau ${new Date(realAvailability[post.id] as string).toLocaleString("fr-FR", { weekday: "short", hour:"2-digit", minute:"2-digit" })}` : realAvailability[post.id] === null ? "Voir les prochaines disponibilités" : "Disponibilités en cours…"}</em></button><button onClick={() => void book(post)}>Réserver</button></div>}</div>
    </article>)}
  </div>{activePost?.isSponsored && <span className="sponsored-label">Contenu sponsorisé</span>}
  {commentsPost && <div className="comments-backdrop" onMouseDown={(event) => event.target===event.currentTarget && setCommentsPost(null)}><section className="comments-sheet" role="dialog" aria-modal="true" aria-label="Commentaires"><header><strong>Commentaires</strong><button aria-label="Fermer" onClick={() => setCommentsPost(null)}>×</button></header><div>{comments.length ? comments.map((comment) => <article className={comment.parent_id ? "comment-reply" : ""} key={comment.id}><span>{comment.profiles?.display_name?.slice(0,1) ?? "M"}</span><p><strong>{comment.profiles?.display_name ?? "Membre Mata"}</strong>{comment.body}<small><button onClick={() => setReplyTo(comment)}>Répondre</button>{authenticated?.userId===comment.author_id ? <button onClick={() => void deleteComment(comment)}>Supprimer</button> : <button onClick={() => void reportComment(comment)}>Signaler</button>}</small></p></article>) : !commentsLoading && <p className="no-comments">Soyez la première à commenter.</p>}{commentsLoading && <p className="no-comments">Chargement des commentaires…</p>}{commentsHasMore && !commentsLoading && <button className="load-more-comments" onClick={() => void loadComments(commentsPost, comments.length)}>Afficher plus de commentaires</button>}</div><footer>{replyTo && <span className="reply-indicator">Réponse à {replyTo.profiles?.display_name ?? "un membre"} <button onClick={() => setReplyTo(null)}>×</button></span>}<input aria-label="Ajouter un commentaire" value={commentText} maxLength={1000} onChange={(event) => setCommentText(event.target.value)} placeholder={replyTo ? "Écrire une réponse…" : "Ajouter un commentaire…"} /><button disabled={!commentText.trim()} onClick={() => void addComment()}>Publier</button></footer></section></div>}
  {feedback && <p className="feed-feedback" role="status">{feedback}</p>}
  <button className="feed-publish-fab" aria-label="Ouvrir le Studio créateur" onClick={onPublish}>＋</button>
  </section>;
}
