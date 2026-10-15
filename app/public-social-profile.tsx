"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PublicSocialProfileData, SocialProfilePost } from "@/lib/profiles/public-social-profile";
import styles from "./public-social-profile.module.css";

type TabKey = "videos" | "favorites" | "services" | "reviews" | "following";

export function PublicSocialProfile({ profile, initialVideoId = null }: { profile: PublicSocialProfileData; initialVideoId?: string | null }) {
  const [tab, setTab] = useState<TabKey>("videos");
  const [selectedVideo, setSelectedVideo] = useState<SocialProfilePost | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [videoRenewing, setVideoRenewing] = useState(false);
  const [notice, setNotice] = useState("");
  const profilePath = profile.kind === "client" ? "/u/" + encodeURIComponent(profile.slug)
    : profile.kind === "salon" ? "/salons/" + encodeURIComponent(profile.slug)
      : "/professional/" + encodeURIComponent(profile.slug);
  const posts = tab === "favorites" ? profile.favorites : profile.posts;
  const firstService = profile.services[0];
  const initials = useMemo(() => profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "M", [profile.name]);

  useEffect(() => {
    let active = true;
    if (initialVideoId) {
      const found = [...profile.posts, ...profile.favorites].find(post => post.id === initialVideoId);
      if (found) queueMicrotask(() => active && setSelectedVideo(found));
    }
    return () => { active = false; };
  }, [initialVideoId, profile.favorites, profile.posts]);

  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client || profile.kind === "client") return () => { active = false; };
    void client.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const result = await client.from("follows").select("followed_provider_id")
        .eq("follower_id", data.user.id).eq("followed_provider_id", profile.id).maybeSingle();
      if (active) setIsFollowing(Boolean(result.data));
    });
    return () => { active = false; };
  }, [profile.id, profile.kind]);

  function showVideo(post: SocialProfilePost) {
    setSelectedVideo(post);
    const url = new URL(window.location.href);
    url.searchParams.set("video", post.id);
    window.history.replaceState(null, "", url.toString());
  }
  function closeVideo() {
    setSelectedVideo(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("video");
    window.history.replaceState(null, "", url.toString());
  }
  async function renewVideo() {
    if (!selectedVideo || videoRenewing) return;
    setVideoRenewing(true);
    try {
      const response = await fetch(`/api/public/social-posts/${encodeURIComponent(selectedVideo.id)}/media`, { cache: "no-store" });
      if (!response.ok) throw new Error("refresh_failed");
      const refreshed: { videoUrl?: string } = await response.json();
      if (!refreshed.videoUrl) throw new Error("refresh_failed");
      setSelectedVideo(current => current?.id === selectedVideo.id ? { ...current, videoUrl: refreshed.videoUrl! } : current);
    } catch {
      setNotice("Cette vidéo est momentanément indisponible. Réessayez dans un instant.");
    } finally { setVideoRenewing(false); }
  }
  async function follow() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data: session } = await client.auth.getSession();
    if (!session.session) {
      window.location.assign("/?connexion=requise&returnTo=" + encodeURIComponent(profilePath));
      return;
    }
    setFollowBusy(true);
    const { data, error } = await client.rpc("toggle_follow_provider_from_post", {
      target_provider_id: profile.id, target_source_post_id: null,
    });
    setFollowBusy(false);
    if (error) { setNotice("L’abonnement n’a pas pu être modifié. Réessayez."); return; }
    setIsFollowing(Boolean(data));
    setNotice(data ? "Vous suivez maintenant ce profil." : "Vous ne suivez plus ce profil.");
  }
  async function shareProfile() {
    try {
      if (navigator.share) await navigator.share({ title: profile.name, text: "Découvrez ce profil sur MATA Beauty.", url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
      setNotice("Lien du profil copié ou partagé.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setNotice("Le partage n’a pas abouti.");
    }
  }
  function book(serviceId: string) { window.location.assign("/?service=" + encodeURIComponent(serviceId)); }

  const tabItems: { key: TabKey; label: string }[] = profile.kind === "client"
    ? [{ key: "videos", label: "Publications" }, { key: "favorites", label: "Favoris" }, ...(profile.canShowFollows ? [{ key: "following" as const, label: "Abonnements" }] : [])]
    : [{ key: "videos", label: "Vidéos" }, { key: "services", label: "Prestations" }, { key: "reviews", label: "Avis" }];

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/" className={styles.back}>‹ <span>Découvrir</span></Link>
      <Link href="/" className={styles.brand}>MATA <i>BEAUTY</i></Link>
      <button className={styles.shareButton} type="button" onClick={() => void shareProfile()} aria-label="Partager le profil">↗</button>
    </header>

    {profile.kind === "salon" && profile.coverUrl && <div className={styles.cover}><Image src={profile.coverUrl} alt={"Couverture de " + profile.name} fill sizes="(max-width: 760px) 100vw, 1120px" unoptimized priority /></div>}

    <section className={styles.profileCard} aria-label={"Profil " + profile.name}>
      <div className={styles.identityRow}>
        <div className={styles.avatarWrap}>
          {profile.avatarUrl ? <Image className={styles.avatar} src={profile.avatarUrl} alt={"Photo de " + profile.name} width={112} height={112} unoptimized priority /> : <span className={styles.avatarFallback}>{initials}</span>}
          {profile.verified && <span className={styles.verified} aria-label="Profil vérifié">✓</span>}
        </div>
        <div className={styles.identity}>
          <div className={styles.nameLine}><h1>{profile.name}</h1>{profile.verified && <span className={styles.verifiedLabel}>Vérifié</span>}</div>
          <p className={styles.handle}>{profile.handle}</p>
          <p className={styles.location}>{[profile.area, profile.city].filter(Boolean).join(", ")}</p>
        </div>
      </div>
      {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
      {profile.specialties.length > 0 && <div className={styles.specialties} aria-label="Spécialités">{profile.specialties.map(label => <span key={label}>{label}</span>)}</div>}
      {(profile.rating !== null || profile.address) && <div className={styles.metaLine}>
        {profile.rating !== null && <span>★ {profile.rating.toFixed(1)} <small>({profile.reviewCount} avis vérifiés)</small></span>}
        {profile.address && <span>{profile.address}{profile.city ? ", " + profile.city : ""}</span>}
      </div>}

      <div className={styles.stats}>
        {profile.kind === "client" ? <>
          {profile.canShowFollows && <div><strong>{formatCount(profile.followingCount)}</strong><span>Abonnements</span></div>}
          <div><strong>{formatCount(profile.favoritesCount)}</strong><span>Favoris publics</span></div>
          <div><strong>{profile.videoCount}</strong><span>Publications</span></div>
        </> : <>
          <div><strong>{formatCount(profile.followersCount)}</strong><span>Abonnés</span></div>
          <div><strong>{profile.videoCount}</strong><span>Vidéos</span></div>
          <div><strong>{profile.reviewCount}</strong><span>Avis vérifiés</span></div>
        </>}
      </div>

      <div className={styles.actions}>
        {profile.kind === "client" ? profile.isOwner ? <>
          <Link className={styles.primaryButton} href="/app/settings">Modifier le profil</Link>
          <Link className={styles.secondaryButton} href="/app/bookings">Mes réservations</Link>
        </> : <button className={styles.secondaryButton} type="button" onClick={() => void shareProfile()}>Partager</button> : <>
          {profile.services.length > 0 && <button className={styles.primaryButton} type="button" onClick={() => book(firstService!.id)}>Réserver</button>}
          <button className={styles.secondaryButton} type="button" onClick={() => setContactOpen(true)}>Contacter</button>
          {!profile.isOwner && <button className={styles.followButton} type="button" disabled={followBusy} onClick={() => void follow()}>{followBusy ? "…" : isFollowing ? "Abonné ✓" : "Suivre"}</button>}
          {profile.isOwner && <Link className={styles.secondaryButton} href={profile.kind === "salon" ? "/salon/profile" : "/pro/profile"}>Modifier</Link>}
        </>}
      </div>
      {profile.salon && profile.kind === "professional" && <Link className={styles.salonLink} href={"/salons/" + encodeURIComponent(profile.salon.slug)}>
        <span>Découvrir le salon</span><strong>{profile.salon.name}</strong>{profile.salon.city && <small>{profile.salon.city}</small>}<b>›</b>
      </Link>}
      {profile.kind === "client" && !profile.isOwner && <p className={styles.privacyNote}>Les réservations, coordonnées et informations de compte restent privées.</p>}
    </section>

    <nav className={styles.tabs} aria-label="Contenu du profil">
      {tabItems.map(item => <button type="button" key={item.key} aria-current={tab === item.key ? "page" : undefined} className={tab === item.key ? styles.activeTab : ""} onClick={() => setTab(item.key)}>{item.label}</button>)}
    </nav>

    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {tab === "services" && <section className={styles.serviceList} aria-label="Prestations">
      {profile.services.length ? profile.services.map(service => <article className={styles.serviceCard} key={service.id}>
        <div><h2>{service.title}</h2>{service.description && <p>{service.description}</p>}<small>{service.durationMinutes} min · {formatMoney(service.priceAmount, service.currency)}</small></div>
        <button type="button" onClick={() => book(service.id)}>Réserver</button>
      </article>) : <p className={styles.empty}>Aucune prestation active n’est publiée pour le moment.</p>}
    </section>}
    {tab === "reviews" && <section className={styles.reviewList} aria-label="Avis vérifiés">
      {profile.reviews.length ? profile.reviews.map(review => <article className={styles.reviewCard} key={review.id}>
        <strong aria-label={review.rating + " sur 5"}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</strong>
        {review.comment && <p>{review.comment}</p>}
        {review.providerReply && <small>Réponse du professionnel : {review.providerReply}</small>}
        <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("fr-FR")}</time>
      </article>) : <p className={styles.empty}>Aucun avis vérifié publié.</p>}
    </section>}
    {tab === "following" && <section className={styles.followingList} aria-label="Abonnements">
      {profile.following.length ? profile.following.map(provider => <Link href={"/professional/" + encodeURIComponent(provider.slug)} key={provider.slug}><strong>{provider.name}</strong><span>{provider.city}</span></Link>) : <p className={styles.empty}>Aucun abonnement public.</p>}
    </section>}
    {(tab === "videos" || tab === "favorites") && <section className={styles.videoGrid} aria-label={tab === "favorites" ? "Vidéos favorites" : "Publications vidéo"}>
      {posts.map(post => <button className={styles.videoTile} type="button" key={post.id} onClick={() => showVideo(post)} aria-label={"Ouvrir la publication " + (post.caption || post.postType)}>
        {post.thumbnailUrl ? <Image src={post.thumbnailUrl} alt="" fill sizes="(max-width: 760px) 33vw, 260px" unoptimized /> : <span className={styles.videoFallback}>MATA<br/>BEAUTY</span>}
        <span className={styles.playMark}>▶</span>
        <span className={styles.views}>{formatCount(post.viewCount)} vues</span>
      </button>)}
      {posts.length === 0 && <div className={styles.emptyGrid}><strong>{tab === "favorites" ? "Aucune vidéo enregistrée" : profile.kind === "client" ? "Aucune publication personnelle" : "Les vidéos publiées apparaîtront ici"}</strong><p>{profile.kind === "client" ? "Les vidéos enregistrées sont visibles selon vos réglages de confidentialité." : "Seules les publications publiques et approuvées sont affichées."}</p></div>}
    </section>}

    {contactOpen && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setContactOpen(false); }}>
      <section className={styles.contactDialog} role="dialog" aria-modal="true" aria-labelledby="profile-contact-title">
        <button className={styles.closeButton} type="button" onClick={() => setContactOpen(false)} aria-label="Fermer">×</button>
        <span className={styles.eyebrow}>CONTACTER</span><h2 id="profile-contact-title">{profile.name}</h2>
        <p>Les échanges MATA Beauty sont rattachés aux rendez-vous afin de garder le contexte de la prestation.</p>
        {firstService ? <Link className={styles.primaryButton} href={"/?service=" + encodeURIComponent(firstService.id)}>Réserver pour démarrer un échange</Link> : <p className={styles.empty}>Aucune prestation réservable n’est publiée pour le moment.</p>}
        <Link className={styles.secondaryButton} href="/app/messages">Voir mes conversations</Link>
      </section>
    </div>}

    {selectedVideo && <div className={styles.playerBackdrop} role="dialog" aria-modal="true" aria-label="Lecteur vidéo MATA Beauty">
      <button className={styles.playerClose} type="button" onClick={closeVideo} aria-label="Fermer la vidéo">×</button>
      <div className={styles.player}>
        {selectedVideo.videoUrl ? <video key={selectedVideo.videoUrl} src={selectedVideo.videoUrl} poster={selectedVideo.thumbnailUrl ?? undefined} controls autoPlay muted playsInline preload="metadata" onError={() => void renewVideo()} /> : <div className={styles.videoUnavailable}>{videoRenewing ? "Chargement de la vidéo…" : "Vidéo indisponible"}</div>}
        <div className={styles.playerInfo}><small>{selectedVideo.authorName ?? profile.name}</small><p>{selectedVideo.caption || "Réalisation beauté"}</p>
          {selectedVideo.authorSlug && <Link href={"/professional/" + encodeURIComponent(selectedVideo.authorSlug)}>Voir le profil professionnel</Link>}
          {profile.services.length > 0 && <button type="button" onClick={() => book(firstService!.id)}>Réserver</button>}
        </div>
      </div>
    </div>}
  </main>;
}

function formatCount(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("fr-FR", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}
function formatMoney(amount: number, currency: string | null) {
  if (!currency) return amount.toLocaleString("fr-FR") + " · devise à confirmer";
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return amount.toLocaleString("fr-FR") + " " + currency; }
}

