"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AuthenticatedProfile } from "./auth-modal";
import { SocialFeed } from "./social-feed";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { mapFeedPost, resolvePrivateMedia, type FeedPost, type SocialFeedRow } from "@/lib/supabase/social-media";
import { feedText } from "@/lib/domain/feed-copy";
import "./profile-video.css";

export type VideoBookingService = { id: string; title: string; duration_minutes: number; price_amount: number };
const PAGE_SIZE = 24;
const emptyLocation = { area: "", position: null, providers: [], onChange: () => undefined };

export function ProfessionalVideoGallery({ providerId, businessName, locale = "fr-SN", authenticated, onRequireAuth, onBook, initialPostId }: {
  providerId: string;
  businessName: string;
  locale?: string;
  authenticated: AuthenticatedProfile | null;
  onRequireAuth: (sourcePostId?: string) => void;
  onBook: (service: VideoBookingService, sourcePostId: string) => void;
  initialPostId?: string;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openedPostId, setOpenedPostId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const cursor = useRef<{ publishedAt: string; id: string } | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const initialOpened = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const scrollPosition = useRef(0);
  const galleryElement = useRef<HTMLElement | null>(null);
  const viewerElement = useRef<HTMLDivElement | null>(null);
  const t = (text: string) => feedText(text, locale);

  const load = useCallback(async (append = false) => {
    if (pending.current) return;
    const api = getSupabaseBrowserClient();
    if (!api) { setStatus("error"); return; }
    const request = ++generation.current;
    pending.current = true;
    if (append) setLoadingMore(true); else setStatus("loading");
    try {
      let query = api.from("social_feed").select("*").eq("author_id", providerId).eq("post_type", "video").order("published_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
      const after = append ? cursor.current : null;
      if (after) query = query.or(`published_at.lt.${after.publishedAt},and(published_at.eq.${after.publishedAt},id.lt.${after.id})`);
      const { data, error } = await query.abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      const rows = [...(data ?? [])] as SocialFeedRow[];
      // A shared gallery link may refer to a video beyond the first page.
      if (!append && initialPostId && !rows.some(row => row.id === initialPostId)) {
        const result = await api.from("social_feed").select("*").eq("author_id", providerId).eq("post_type", "video").eq("id", initialPostId).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
        if (result.error) throw result.error;
        if (result.data) rows.unshift(result.data as SocialFeedRow);
      }
      const resolved = await Promise.all(rows.map(row => resolvePrivateMedia(row)));
      if (!mounted.current || generation.current !== request) return;
      const valid = resolved.filter((row): row is SocialFeedRow => Boolean(row)).map(mapFeedPost);
      if (valid.length !== rows.length) setFeedback("Certaines vidéos sont temporairement indisponibles.");
      setPosts(current => append ? [...current, ...valid.filter(post => !current.some(item => item.id === post.id))] : valid);
      const last = (data ?? []).at(-1) as SocialFeedRow | undefined;
      cursor.current = last ? { publishedAt: last.published_at, id: last.id } : null;
      setHasMore((data ?? []).length === PAGE_SIZE);
      setStatus("ready");
    } catch {
      if (mounted.current && generation.current === request) {
        if (!append) setStatus("error"); else setFeedback("La suite des vidéos n’a pas pu être chargée.");
      }
    } finally {
      if (generation.current === request) { pending.current = false; if (mounted.current) setLoadingMore(false); }
    }
  }, [initialPostId, providerId]);

  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => { if (mounted.current) void load(); });
    return () => { mounted.current = false; };
  }, [load]);

  useEffect(() => {
    if (!initialOpened.current && initialPostId && posts.some(post => post.id === initialPostId)) {
      initialOpened.current = true;
      scrollPosition.current = window.scrollY;
      setOpenedPostId(initialPostId);
    }
  }, [initialPostId, posts]);

  const close = useCallback(() => {
    setOpenedPostId(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition.current, behavior: "instant" });
      previousFocus.current?.focus({ preventScroll: true });
    });
  }, []);
  const loadMore = useCallback(() => { if (hasMore && !pending.current) void load(true); }, [hasMore, load]);
  const collection = useMemo(() => openedPostId ? { posts, initialPostId: openedPostId, onBack: close, onLoadMore: loadMore } : undefined, [close, loadMore, openedPostId, posts]);

  useEffect(() => {
    if (!openedPostId) return;
    const previousOverflow = document.body.style.overflow;
    const background = galleryElement.current?.closest("main");
    const previousInert = background?.inert ?? false;
    document.body.style.overflow = "hidden";
    if (background) background.inert = true;
    viewerElement.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = previousOverflow; if (background) background.inert = previousInert; };
  }, [openedPostId]);

  return <section ref={galleryElement} className="professional-video-gallery" aria-label={t("Vidéos du professionnel")}>
    <h2>{t("Vidéos")}</h2>
    {status === "loading" && <p role="status">{t("Chargement des vidéos…")}</p>}
    {status === "error" && <p role="alert">{t("Les vidéos n’ont pas pu être chargées.")} <button onClick={() => void load()}>{t("Réessayer")}</button></p>}
    {status === "ready" && !posts.length && <p>{t("Aucune vidéo publiée pour le moment.")}</p>}
    <div className="professional-video-grid">{posts.map(post => <button key={post.id} data-gallery-post-id={post.id} aria-label={`${t("Lire la vidéo")} · ${post.serviceTitle ?? businessName}`} onClick={event => {
      previousFocus.current = event.currentTarget; scrollPosition.current = window.scrollY; setOpenedPostId(post.id);
    }}>{post.thumbnailUrl ? <Image src={post.thumbnailUrl} alt={post.serviceTitle ?? businessName} width={240} height={320} sizes="(max-width: 600px) 33vw, 200px" unoptimized /> : <span className="video-thumbnail-placeholder">▶</span>}<span className="video-thumbnail-label">▶ {post.serviceTitle}</span></button>)}</div>
    {hasMore && <button className="gallery-load-more" disabled={loadingMore} onClick={loadMore}>{t(loadingMore ? "Chargement…" : "Voir plus de vidéos")}</button>}
    {feedback && <p role="status">{t(feedback)}</p>}
    {openedPostId && createPortal(<div ref={viewerElement} className="profile-video-viewer" role="dialog" aria-modal="true" aria-label={`${t("Vidéos de")} ${businessName}`} onKeyDown={event => {
      if (event.target instanceof Element && event.target.closest(".comments-sheet")) return;
      if (event.key === "Escape" && !event.defaultPrevented) close();
      if (event.key === "Tab") {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], summary")).filter(item => !item.closest("[inert]") && item.getClientRects().length > 0);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <SocialFeed authenticated={authenticated} collection={collection} onRequireAuth={() => { setOpenedPostId(null); onRequireAuth(openedPostId); }} onDiscover={close} onPublish={() => { window.location.assign("/pro/videos"); }} onOpenProvider={close} onBook={(_authorId, service, sourcePostId) => { setOpenedPostId(null); onBook(service, sourcePostId); }} location={emptyLocation} />
    </div>, document.body)}
  </section>;
}
