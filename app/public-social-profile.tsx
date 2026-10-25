"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PublicSocialProfileData, SocialProfilePost } from "@/lib/profiles/public-social-profile";
import { SocialProfileVideoFrame } from "./social-profile-video-frame";
import { ClientControlCenter } from "./client-control-center";
import styles from "./public-social-profile.module.css";
import { publicMetadataImage } from "@/lib/public-image";

type TabKey = "videos" | "favorites" | "likes" | "services" | "reviews" | "following";

export function PublicSocialProfile({ profile, initialVideoId = null, initialEditMode = false }: { profile: PublicSocialProfileData; initialVideoId?: string | null; initialEditMode?: boolean }) {
  const [tab, setTab] = useState<TabKey>("videos");
  const [selectedVideo, setSelectedVideo] = useState<SocialProfilePost | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [videoRenewing, setVideoRenewing] = useState(false);
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(initialEditMode);
  const [applicationStatus, setApplicationStatus] = useState<string | null | "loading" | "unavailable">("loading");
  const profilePath = profile.kind === "client" ? "/u/" + encodeURIComponent(profile.slug)
    : profile.kind === "salon" ? "/salons/" + encodeURIComponent(profile.slug)
      : "/professional/" + encodeURIComponent(profile.slug);
  const posts = tab === "favorites" ? profile.favorites : tab === "likes" ? profile.likedPosts : profile.posts;
  const firstService = profile.services[0];
  const selectedVideoService = selectedVideo?.serviceId
    ? profile.services.find(service => service.id === selectedVideo.serviceId)
    : undefined;
  const initials = useMemo(() => profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "M", [profile.name]);

  useEffect(() => {
    let active = true;
    if (initialVideoId) {
      const found = [...profile.posts, ...profile.favorites, ...profile.likedPosts].find(post => post.id === initialVideoId);
      if (found) queueMicrotask(() => active && setSelectedVideo(found));
    }
    return () => { active = false; };
  }, [initialVideoId, profile.favorites, profile.likedPosts, profile.posts]);

  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client || profile.kind !== "client" || !profile.isOwner) return () => { active = false; };
    void client.from("professional_onboarding").select("status").eq("provider_id", profile.id).maybeSingle()
      .then(({ data, error }) => { if (active) setApplicationStatus(error ? "unavailable" : data?.status ?? null); });
    return () => { active = false; };
  }, [profile.id, profile.kind, profile.isOwner]);

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
      const refreshed: { videoUrl?: string; thumbnailUrl?: string | null } = await response.json();
      if (!refreshed.videoUrl) throw new Error("refresh_failed");
      setSelectedVideo(current => current?.id === selectedVideo.id ? {
        ...current,
        videoUrl: refreshed.videoUrl!,
        thumbnailUrl: refreshed.thumbnailUrl ?? current.thumbnailUrl,
      } : current);
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
  function bookingHref(serviceId: string) { return "/?service=" + encodeURIComponent(serviceId); }
  function openBooking(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // A full navigation guarantees the root page receives the service query
    // when Next reuses the existing client tree for a query-only route.
    window.location.assign(event.currentTarget.href);
  }

  const tabItems: { key: TabKey; label: string }[] = profile.kind === "client"
    ? [{ key: "videos", label: "Publications" }, { key: "favorites", label: "Enregistrés" }, ...(profile.isOwner ? [{ key: "likes" as const, label: "J’aime" }] : []), ...(profile.canShowFollows ? [{ key: "following" as const, label: "Abonnements" }] : [])]
    : [{ key: "videos", label: "Vidéos" }, { key: "services", label: "Prestations" }, { key: "reviews", label: "Avis" }];

  const structuredProfile = profile.kind === "client" ? null : {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `https://mata-beauty.com${profilePath}`,
    mainEntity: {
      "@type": profile.kind === "salon" ? "BeautySalon" : "HealthAndBeautyBusiness",
      name: profile.name,
      url: `https://mata-beauty.com${profilePath}`,
      ...(profile.bio ? { description: profile.bio } : {}),
      ...(profile.city ? { areaServed: { "@type": "City", name: profile.city } } : {}),
      ...(profile.avatarUrl ? { image: publicMetadataImage(profile.avatarUrl) } : {}),
      ...(profile.services.length ? { hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Prestations publiées",
        itemListElement: profile.services.map(service => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: service.title, ...(service.description ? { description: service.description } : {}) },
          ...(service.currency && /^[A-Z]{3}$/.test(service.currency) ? { price: service.priceAmount, priceCurrency: service.currency } : {}),
          url: `https://mata-beauty.com/service/${encodeURIComponent(service.id)}`,
        })),
      } } : {}),
    },
  };

  return <main className={styles.page}>
    {structuredProfile && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredProfile).replace(/</g, "\\u003c") }} />}
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
          <button className={styles.primaryButton} type="button" aria-expanded={editorOpen} aria-controls="profile-editor" onClick={() => setEditorOpen(open => !open)}>{editorOpen ? "Fermer l’édition" : "Modifier mon profil"}</button>
          <Link className={styles.secondaryButton} href="/app/bookings">Mes rendez-vous</Link>
          <Link className={styles.secondaryButton} href="/app/messages">Mes messages</Link>
        </> : <button className={styles.secondaryButton} type="button" onClick={() => void shareProfile()}>Partager</button> : <>
          {profile.services.length > 0 && <Link className={styles.primaryButton} href={bookingHref(firstService!.id)} onClick={openBooking}>Réserver</Link>}
          <button className={styles.secondaryButton} type="button" onClick={() => setContactOpen(true)}>Contacter</button>
          {!profile.isOwner && <button className={styles.followButton} type="button" disabled={followBusy} onClick={() => void follow()}>{followBusy ? "…" : isFollowing ? "Abonné ✓" : "Suivre"}</button>}
          {profile.isOwner && <Link className={styles.secondaryButton} href={profile.kind === "salon" ? "/salon/profile" : "/pro/profile"}>Modifier</Link>}
        </>}
      </div>
      {profile.kind === "client" && profile.isOwner && <section className={styles.ownerHub} aria-label="Mon compte MATA Beauty">
        <h2>Mon compte</h2>
        <nav className={styles.ownerLinks} aria-label="Raccourcis personnels">
          <Link href="/app/bookings">Rendez-vous et historique</Link>
          <Link href="/app/notifications">Notifications</Link>
          <Link href="/app/favorites">Professionnels favoris</Link>
          <Link href="/app/inspirations">Contenus enregistrés</Link>
          <Link href="/app/settings?edit=1">Paramètres et confidentialité</Link>
        </nav>
        <article className={styles.applicationCard}>
          <div><h3>Devenir professionnel MATA Beauty</h3>
            <p>{applicationStatus === "loading" ? "Chargement du statut de votre candidature…" : applicationStatus === "unavailable" ? "Le statut sera consultable dans votre dossier professionnel." : applicationStatus === "verified" ? "Votre activité est approuvée." : applicationStatus === "submitted" || applicationStatus === "under_review" ? "Votre candidature est en cours de vérification." : applicationStatus === "rejected" ? "Votre candidature a été refusée. Consultez votre dossier pour connaître la suite." : applicationStatus ? "Votre candidature est enregistrée." : "Aucune candidature n’a encore été commencée."}</p>
          </div>
          <Link href={applicationStatus === "verified" ? "/pro" : "/app/application"}>{applicationStatus === "verified" ? "Espace professionnel" : applicationStatus ? "Suivre ma candidature" : "Déposer une candidature"}</Link>
        </article>
      </section>}
      {profile.kind === "client" && profile.isOwner && editorOpen && <section className={styles.profileEditor} id="profile-editor" aria-label="Modifier mon profil et mes paramètres">
        <ClientControlCenter userId={profile.id} section="settings" embedded />
      </section>}
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
        <div><h2><Link href={`/service/${encodeURIComponent(service.id)}`}>{service.title}</Link></h2>{service.description && <p>{service.description}</p>}<small>{service.durationMinutes} min · {formatMoney(service.priceAmount, service.currency)}</small></div>
        <div className={styles.serviceActions}><Link href={`/service/${encodeURIComponent(service.id)}`}>Détails</Link><Link href={bookingHref(service.id)} onClick={openBooking}>Réserver</Link></div>
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
    {(tab === "videos" || tab === "favorites" || tab === "likes") && <section className={styles.videoGrid} aria-label={tab === "favorites" ? "Vidéos enregistrées" : tab === "likes" ? "Vidéos aimées" : "Publications vidéo"}>
      {posts.map(post => <button className={styles.videoTile} type="button" key={post.id} onClick={() => showVideo(post)} aria-label={"Ouvrir la publication " + (post.caption || post.postType)}>
        <SocialProfileVideoFrame videoUrl={post.videoUrl} thumbnailUrl={post.thumbnailUrl} />
        <span className={styles.playMark}>▶</span>
        <span className={styles.views}>{formatCount(post.viewCount)} vues</span>
      </button>)}
      {posts.length === 0 && <div className={styles.emptyGrid}><strong>{tab === "favorites" ? "Aucune vidéo enregistrée" : tab === "likes" ? "Aucune vidéo aimée" : profile.kind === "client" ? "Aucune publication personnelle" : "Les vidéos publiées apparaîtront ici"}</strong><p>{tab === "likes" ? "Les vidéos aimées restent visibles uniquement dans votre compte." : profile.kind === "client" ? "Les vidéos enregistrées sont visibles selon vos réglages de confidentialité." : "Seules les publications publiques et approuvées sont affichées."}</p></div>}
    </section>}

    {contactOpen && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setContactOpen(false); }}>
      <section className={styles.contactDialog} role="dialog" aria-modal="true" aria-labelledby="profile-contact-title">
        <button className={styles.closeButton} type="button" onClick={() => setContactOpen(false)} aria-label="Fermer">×</button>
        <span className={styles.eyebrow}>CONTACTER</span><h2 id="profile-contact-title">{profile.name}</h2>
        <p>Les échanges MATA Beauty sont rattachés aux rendez-vous afin de garder le contexte de la prestation.</p>
        {firstService ? <Link className={styles.primaryButton} href={bookingHref(firstService.id)} onClick={openBooking}>Réserver pour démarrer un échange</Link> : <p className={styles.empty}>Aucune prestation réservable n’est publiée pour le moment.</p>}
        <Link className={styles.secondaryButton} href="/app/messages">Voir mes conversations</Link>
      </section>
    </div>}

    {selectedVideo && <div className={styles.playerBackdrop} role="dialog" aria-modal="true" aria-label="Lecteur vidéo MATA Beauty">
      <button className={styles.playerClose} type="button" onClick={closeVideo} aria-label="Fermer la vidéo">×</button>
      <div className={styles.player}>
        {selectedVideo.videoUrl ? <video key={selectedVideo.videoUrl} src={selectedVideo.videoUrl} poster={selectedVideo.thumbnailUrl ?? undefined} controls autoPlay muted playsInline preload="metadata" onError={() => void renewVideo()} /> : <div className={styles.videoUnavailable}>{videoRenewing ? "Chargement de la vidéo…" : "Vidéo indisponible"}</div>}
        <div className={styles.playerInfo}><small>{selectedVideo.authorName ?? profile.name}</small><p>{selectedVideo.caption || "Réalisation beauté"}</p>
          {selectedVideo.authorSlug && <Link href={"/professional/" + encodeURIComponent(selectedVideo.authorSlug)}>Voir le profil professionnel</Link>}
          {selectedVideoService && <>
            <span className={styles.playerService}>{selectedVideoService.title} · {formatMoney(selectedVideoService.priceAmount, selectedVideoService.currency)}</span>
            <Link href={bookingHref(selectedVideoService.id)} onClick={openBooking}>Réserver cette prestation</Link>
          </>}
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

