"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthModal, type AuthenticatedProfile } from "./auth-modal";
import { ProfessionalVideoGallery, type VideoBookingService } from "./professional-video-gallery";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadAuthenticatedProfile } from "@/lib/auth/profile";
import { feedPrice, publicProfessionalName } from "@/lib/domain/feed-presentation";
import { feedText } from "@/lib/domain/feed-copy";
import { ProfileShareActions } from "./professional/profile-share-actions";
import "./profile-video.css";

export type PublicProfessionalService = VideoBookingService & { currency: string; business_id?: string | null };
export type PublicProfessional = {
  profile_id: string; slug: string; business_name: string; bio: string | null; city: string; area: string | null;
  cover_url: string | null; average_rating: number; review_count: number; verified_at: string | null;
  founder_badge_enabled?: boolean;
};

export function PublicProfessionalProfile({ providerId, initialProfile, authenticated: suppliedAuth, onBack, onBook, favorite, onFavorite, initialPostId }: {
  providerId: string;
  initialProfile?: PublicProfessional;
  authenticated?: AuthenticatedProfile | null;
  onBack?: () => void;
  onBook?: (service: PublicProfessionalService | VideoBookingService, sourcePostId?: string) => void;
  favorite?: boolean;
  onFavorite?: () => void;
  initialPostId?: string;
}) {
  const [profile, setProfile] = useState<PublicProfessional | null>(initialProfile ?? null);
  const [services, setServices] = useState<PublicProfessionalService[]>([]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [localAuth, setLocalAuth] = useState<AuthenticatedProfile | null>(null);
  const [authReturnTo, setAuthReturnTo] = useState<string | null>(null);
  const [locale, setLocale] = useState("fr-SN");
  const [theme, setTheme] = useState("dark");
  const authenticated = suppliedAuth === undefined ? localAuth : suppliedAuth;
  const t = (text: string) => feedText(text, locale);

  useEffect(() => {
    void Promise.resolve().then(() => setTheme(window.localStorage.getItem("mata-theme") === "light" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    const api = getSupabaseBrowserClient();
    if (!api) return;
    let active = true;
    if (suppliedAuth === undefined) {
      const updateAuth = async () => {
        const { data } = await api.auth.getSession();
        try {
          const next = data.session ? await loadAuthenticatedProfile(api, data.session.user.id) : null;
          if (active) setLocalAuth(next);
        } catch { if (active) setLocalAuth(null); }
      };
      void updateAuth();
      const { data: listener } = api.auth.onAuthStateChange(() => { void Promise.resolve().then(updateAuth); });
      return () => { active = false; listener.subscription.unsubscribe(); };
    }
    return () => { active = false; };
  }, [suppliedAuth]);

  useEffect(() => {
    let active = true;
    if (authenticated) void getSupabaseBrowserClient()?.from("profiles").select("locale").eq("id", authenticated.userId).maybeSingle().then(({ data }) => {
      if (active && data?.locale) setLocale(data.locale);
    });
    return () => { active = false; };
  }, [authenticated]);

  useEffect(() => {
    const api = getSupabaseBrowserClient();
    if (!api) return;
    let active = true;
    void Promise.all([
      api.from("provider_profiles").select("profile_id,slug,business_name,bio,city,area,cover_url,average_rating,review_count,verified_at,founder_badge_enabled").eq("profile_id", providerId).eq("status", "approved").abortSignal(AbortSignal.timeout(15000)).maybeSingle(),
      api.from("provider_services").select("id,title,duration_minutes,price_amount,currency,business_id").eq("provider_id", providerId).eq("is_active", true).is("archived_at", null).order("price_amount").abortSignal(AbortSignal.timeout(15000)),
      api.from("profiles").select("avatar_url").eq("id", providerId).abortSignal(AbortSignal.timeout(15000)).maybeSingle(),
      api.from("portfolio_items").select("storage_path").eq("provider_id", providerId).order("sort_order").limit(12).abortSignal(AbortSignal.timeout(15000)),
    ]).then(([provider, availableServices, identity, photos]) => {
      if (!active) return;
      if (provider.error || !provider.data || availableServices.error) { setStatus("error"); return; }
      setProfile(provider.data as PublicProfessional);
      setServices((availableServices.data ?? []) as PublicProfessionalService[]);
      setAvatar(identity.data?.avatar_url ?? null);
      setPortfolio((photos.data ?? []).map(item => api.storage.from("portfolios").getPublicUrl(item.storage_path).data.publicUrl));
      setStatus("ready");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [attempt, providerId]);

  const name = publicProfessionalName(profile?.business_name);
  const profilePath = profile ? `/professional/${encodeURIComponent(profile.slug)}` : "/discover";
  const messagePath = `/app/messages?provider=${encodeURIComponent(providerId)}`;
  function book(service: VideoBookingService, sourcePostId?: string) {
    if (onBook) onBook(service, sourcePostId);
    else {
      const params = new URLSearchParams({ service: service.id, returnTo: sourcePostId ? `${profilePath}?video=${sourcePostId}` : profilePath });
      if (sourcePostId) params.set("sourcePost", sourcePostId);
      window.location.assign(`/?${params}`);
    }
  }
  return <main className="public-professional-page" lang={locale} data-theme={theme}>
    <header className="public-profile-navigation">{onBack ? <button onClick={onBack}>‹ {t("Retour")}</button> : <Link href="/discover">‹ {t("Découvrir")}</Link>}{onFavorite && <button aria-label={t(favorite ? "Retirer des favoris" : "Ajouter aux favoris")} aria-pressed={Boolean(favorite)} onClick={onFavorite}>{favorite ? "♥" : "♡"}</button>}</header>
    {status === "loading" && <p role="status">{t("Chargement du profil…")}</p>}
    {status === "error" && <p role="alert">{t("Ce profil n’est pas disponible pour le moment.")} <button onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>{t("Réessayer")}</button></p>}
    {profile && <>
      <section className="public-profile-identity">
        <div className="public-profile-avatar">{avatar || profile.cover_url ? <Image src={avatar ?? profile.cover_url!} alt={name} width={112} height={112} unoptimized /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>
        <h1>{name}</h1>
        {profile.verified_at && <span className="public-profile-verified">✓ {t("Professionnel vérifié")}</span>}
        {profile.founder_badge_enabled && <span className="founder-badge">★ {t("Professionnel fondateur")}</span>}
        {[profile.area, profile.city].filter((value, index, values) => value && values.indexOf(value) === index).join(", ") && <p className="public-profile-location">{[profile.area, profile.city].filter((value, index, values) => value && values.indexOf(value) === index).join(", ")}</p>}
        {services.length > 0 && <p className="public-profile-specialties">{[...new Set(services.map(service => service.title))].slice(0, 5).join(" · ")}</p>}
        {profile.bio && <p className="public-profile-bio">{profile.bio}</p>}
        <p className="public-profile-rating">{Number(profile.review_count) > 0 ? <>★ {Number(profile.average_rating).toFixed(1)} · {profile.review_count} {t("avis vérifiés")}</> : t("Aucun avis vérifié pour le moment.")}</p>
        <div className="public-profile-actions"><a className="profile-primary-action" href="#professional-services">{t("Réserver")}</a><button onClick={() => authenticated ? window.location.assign(messagePath) : setAuthReturnTo(messagePath)}>{t("Message")}</button></div>
        <details className="public-profile-share"><summary>{t("Partager")}</summary><ProfileShareActions profileUrl={`https://mata-beauty.com${profilePath}`} businessName={name} /></details>
      </section>
      <ProfessionalVideoGallery key={providerId} providerId={providerId} businessName={name} locale={locale} authenticated={authenticated} onRequireAuth={sourcePostId => setAuthReturnTo(`${profilePath}${sourcePostId ? `?video=${sourcePostId}` : ""}`)} onBook={book} initialPostId={initialPostId} />
      {portfolio.length > 0 && <section className="public-profile-portfolio"><h2>{t("Réalisations")}</h2><div className="portfolio-strip">{portfolio.map((url, index) => <Image key={url} src={url} alt={`${name} · ${index + 1}`} width={120} height={120} unoptimized />)}</div></section>}
      <section id="professional-services" className="public-profile-services"><h2>{t("Prestations")}</h2>{status === "ready" && !services.length && <p>{t("Aucune prestation disponible pour le moment.")}</p>}{services.map(service => <button key={service.id} className="public-profile-service" onClick={() => book(service)}><span><strong>{service.title}</strong><small>{service.duration_minutes} min · {feedPrice(service.price_amount, service.currency, locale)}</small></span><span>{t("Réserver")} ›</span></button>)}</section>
    </>}
    {authReturnTo && <AuthModal returnTo={authReturnTo} onClose={() => setAuthReturnTo(null)} onAuthenticated={next => { setLocalAuth(next); const destination = authReturnTo; setAuthReturnTo(null); if (destination.startsWith("/app/messages")) window.location.assign(destination); else if (suppliedAuth !== undefined) window.location.assign(destination); }} />}
  </main>;
}
