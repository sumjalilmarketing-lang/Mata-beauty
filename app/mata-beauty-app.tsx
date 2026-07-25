"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthModal, type AuthenticatedProfile } from "./auth-modal";
import { LiveDashboard } from "./live-dashboard";
import { calculateBookingEnd, calculateBookingQuote } from "@/lib/domain/booking";
import { fetchActivePromotions, fetchPublishedProviders, type CatalogPromotion } from "@/lib/supabase/catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Provider = {
  id: string;
  profileId: string;
  serviceId: string;
  name: string;
  specialty: string;
  category: string;
  area: string;
  price: number;
  rating: number;
  reviews: number;
  initials: string;
  verified: boolean;
  homeService: boolean;
  durationMinutes: number;
  coverUrl?: string;
};

type BookingRequest = {
  date: string;
  time: string;
  locationMode: "salon" | "client_address";
  address: string;
  note: string;
  paymentMethod: "on_site" | "wave" | "orange_money";
};

type BookingConfirmation = { id: string; date: string; time: string; location: string };

const categories = [
  ["✂", "Coiffure"], ["≋", "Tresses"], ["◒", "Perruques"], ["✦", "Maquillage"],
  ["◐", "Onglerie"], ["⌁", "Cils et sourcils"], ["♡", "Soins du visage"],
  ["◆", "Barbier"], ["◇", "Épilation"], ["☼", "Massage et bien-être"],
] as const;

const popularServices = [
  "Tresses", "Pose de perruque", "Maquillage mariage", "Manucure",
  "Pédicure", "Extension de cils", "Barbier", "Soin du visage",
];

const formatPrice = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value)} F CFA`;
const defaultBookingDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export function MataBeautyApp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [area, setArea] = useState("Tout Dakar");
  const [date, setDate] = useState("");
  const [catalog, setCatalog] = useState<Provider[]>([]);
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Array<{ id: string; starts_at: string; status: string }>>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "live" | "empty" | "error">("loading");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [booking, setBooking] = useState<Provider | null>(null);
  const [profile, setProfile] = useState<Provider | null>(null);
  const [view, setView] = useState<"home" | "client" | "provider" | "admin">("home");
  const [resultView, setResultView] = useState<"list" | "map">("list");
  const [homeOnly, setHomeOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRating, setMinRating] = useState("0");
  const [maxPrice, setMaxPrice] = useState("50000");
  const [notice, setNotice] = useState("");
  const [authenticated, setAuthenticated] = useState<AuthenticatedProfile | null>(null);
  const [authRequest, setAuthRequest] = useState<{ role: "client" | "provider" | "admin"; mode: "login" | "register" } | null>(null);

  const areas = useMemo(() => ["Tout Dakar", ...new Set(catalog.map((provider) => provider.area))], [catalog]);
  const suggestions = useMemo(
    () => [...new Set([...popularServices, ...categories.map((item) => item[1]), ...catalog.map((provider) => provider.name)])],
    [catalog],
  );
  const filteredProviders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return catalog.filter((provider) => {
      const haystack = `${provider.name} ${provider.specialty} ${provider.category} ${provider.area}`.toLocaleLowerCase("fr");
      return (!normalized || haystack.includes(normalized))
        && (category === "Toutes" || provider.category.toLocaleLowerCase("fr").includes(category.toLocaleLowerCase("fr")))
        && (area === "Tout Dakar" || provider.area === area)
        && (!homeOnly || provider.homeService)
        && (!verifiedOnly || provider.verified)
        && provider.rating >= Number(minRating)
        && provider.price <= Number(maxPrice);
    });
  }, [area, catalog, category, homeOnly, maxPrice, minRating, query, verifiedOnly]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      void Promise.resolve().then(() => setCatalogState("error"));
      return;
    }
    let active = true;
    void fetchPublishedProviders(supabase)
      .then((items) => {
        if (!active) return;
        const realProviders: Provider[] = items.map((item) => ({
          ...item,
          id: item.id,
          initials: item.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        }));
        setCatalog(realProviders);
        setCatalogState(realProviders.length ? "live" : "empty");
      })
      .catch(() => { if (active) setCatalogState("error"); });
    void fetchActivePromotions(supabase).then((items) => {
      if (active) setPromotions(items);
    }).catch(() => {
      if (active) setPromotions([]);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!active || !user) return;
      const { data: account } = await supabase.from("profiles").select("role,is_suspended").eq("id", user.id).maybeSingle();
      if (!active || !account || account.is_suspended) return;
      const signedIn = { userId: user.id, role: account.role } as AuthenticatedProfile;
      setAuthenticated(signedIn);
      if (signedIn.role === "client") {
        const [{ data: favoriteData }, { data: bookingData }] = await Promise.all([
          supabase.from("favorites").select("provider_id").eq("client_id", user.id),
          supabase.from("bookings").select("id,starts_at,status").eq("client_id", user.id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(3),
        ]);
        if (active && favoriteData) setFavorites(favoriteData.map((item) => item.provider_id));
        if (active && bookingData) setUpcomingBookings(bookingData);
      }
    });
    return () => { active = false; };
  }, []);

  function openAccount(section: "client" | "provider" | "admin" = "client") {
    if (authenticated?.role === section) setView(section);
    else setAuthRequest({ role: section, mode: "login" });
  }

  function runSearch(event?: FormEvent) {
    event?.preventDefault();
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleFavorite(provider: Provider) {
    if (!authenticated || authenticated.role !== "client") {
      setAuthRequest({ role: "client", mode: "login" });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const exists = favorites.includes(provider.id);
    const request = exists
      ? supabase.from("favorites").delete().eq("client_id", authenticated.userId).eq("provider_id", provider.profileId)
      : supabase.from("favorites").insert({ client_id: authenticated.userId, provider_id: provider.profileId });
    const { error } = await request;
    if (error) {
      setNotice("Le favori n’a pas pu être enregistré. Réessayez.");
      return;
    }
    setFavorites((current) => exists ? current.filter((id) => id !== provider.id) : [...current, provider.id]);
  }

  async function confirmBooking(request: BookingRequest): Promise<BookingConfirmation | null> {
    if (!booking) return null;
    if (!authenticated || authenticated.role !== "client") {
      setAuthRequest({ role: "client", mode: "login" });
      return null;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const startsAt = new Date(`${request.date}T${request.time}:00+00:00`);
    const endsAt = calculateBookingEnd(startsAt, booking.durationMinutes);
    const quote = calculateBookingQuote(booking.price);
    const { data: created, error } = await supabase.from("bookings").insert({
      client_id: authenticated.userId,
      provider_id: booking.profileId,
      provider_service_id: booking.serviceId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "pending",
      location_mode: request.locationMode,
      appointment_address: request.locationMode === "client_address" ? request.address.trim() : null,
      total_amount: quote.totalAmount,
      currency: quote.currency,
      client_note: request.note.trim() || null,
    }).select("id").single();
    if (error || !created) {
      setNotice(error?.code === "23P01" ? "Ce créneau vient d’être réservé. Choisissez-en un autre." : "La réservation n’a pas pu être enregistrée.");
      return null;
    }
    const { error: paymentError } = await supabase.from("payments").insert({
      booking_id: created.id,
      payment_method: request.paymentMethod,
      payment_status: "pending",
      amount: quote.totalAmount,
      currency: quote.currency,
      is_test: true,
    });
    if (paymentError) setNotice("Rendez-vous créé. Le paiement test sera complété depuis votre espace.");
    return {
      id: created.id,
      date: request.date,
      time: request.time,
      location: request.locationMode === "salon" ? `Chez ${booking.name}` : request.address,
    };
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setAuthenticated(null);
    setView("home");
  }

  if (view !== "home" && authenticated?.role === view) {
    return <LiveDashboard role={view} userId={authenticated.userId} displayName="votre espace" onBack={() => setView("home")} onSignOut={signOut} />;
  }

  return (
    <main className="app-home" id="home">
      {notice && <div className="toast" role="status">{notice}</div>}
      <header className="app-header">
        <a className="app-brand" href="#home" aria-label="Mata Beauty, accueil"><span className="brand-emblem">M</span><span><strong>MATA</strong><small>BEAUTY</small></span></a>
        <button className="location-pill" onClick={() => document.getElementById("search")?.scrollIntoView()}><span>⌖</span><span><small>Votre zone</small><strong>{area}</strong></span></button>
        <div className="app-header-actions">
          <button aria-label="Notifications" onClick={() => openAccount()}>♢</button>
          <button aria-label="Favoris" onClick={() => openAccount()}>♡</button>
          <button className="account-avatar" aria-label="Ouvrir mon compte" onClick={() => openAccount()}>{authenticated ? "MB" : "👤"}</button>
        </div>
      </header>

      <section className="app-intro" id="search">
        <div><p className="eyebrow">Réserver votre beauté à Dakar</p><h1>De quoi avez-vous envie aujourd’hui ?</h1></div>
        <form className="app-search" onSubmit={runSearch}>
          <label><span>Que recherchez-vous ?</span><input list="search-suggestions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tresses, perruque, maquillage…" /></label>
          <label><span>Où ?</span><select value={area} onChange={(event) => setArea(event.target.value)}>{areas.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Quand ?</span><input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} /></label>
          <button className="primary-button search-submit" type="submit">Rechercher</button>
          <datalist id="search-suggestions">{suggestions.map((item) => <option value={item} key={item} />)}</datalist>
        </form>
      </section>

      <section className="compact-section category-section" aria-labelledby="categories-title">
        <div className="compact-heading"><div><p className="eyebrow">Explorer</p><h2 id="categories-title">Catégories</h2></div><button onClick={() => { setCategory("Toutes"); runSearch(); }}>Tout voir</button></div>
        <div className="category-strip">{categories.map(([icon, label]) => <button key={label} className={category === label ? "category-chip active" : "category-chip"} onClick={() => { setCategory(category === label ? "Toutes" : label); runSearch(); }}><i>{icon}</i><span>{label}</span></button>)}</div>
      </section>

      <section className="compact-section popular-section" aria-labelledby="popular-title">
        <div className="compact-heading"><div><p className="eyebrow">En ce moment</p><h2 id="popular-title">Prestations populaires</h2></div></div>
        <div className="service-chips">{popularServices.map((service) => <button key={service} onClick={() => { setQuery(service); runSearch(); }}>{service}<span>→</span></button>)}</div>
      </section>

      <section className="compact-section results-section" id="results" aria-labelledby="results-title">
        <div className="compact-heading results-heading">
          <div><p className="eyebrow">Près de vous</p><h2 id="results-title">Professionnels disponibles</h2><small>{catalogState === "live" ? "Données vérifiées en direct" : catalogState === "loading" ? "Chargement du catalogue…" : "Catalogue Supabase"}</small></div>
          <div className="view-switch" aria-label="Affichage"><button className={resultView === "list" ? "active" : ""} onClick={() => setResultView("list")}>☷ Liste</button><button className={resultView === "map" ? "active" : ""} onClick={() => setResultView("map")}>⌖ Carte</button></div>
        </div>
        <div className="result-layout">
          <aside className="filter-panel" aria-label="Filtres de recherche">
            <div><strong>Filtres</strong><button onClick={() => { setHomeOnly(false); setVerifiedOnly(false); setMinRating("0"); setMaxPrice("50000"); }}>Réinitialiser</button></div>
            <label>Prix maximum <strong>{formatPrice(Number(maxPrice))}</strong><input type="range" min="3000" max="50000" step="1000" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label>
            <label>Note minimale<select value={minRating} onChange={(event) => setMinRating(event.target.value)}><option value="0">Toutes les notes</option><option value="4">4 étoiles et plus</option><option value="4.5">4,5 étoiles et plus</option></select></label>
            <label className="check-filter"><input type="checkbox" checked={homeOnly} onChange={(event) => setHomeOnly(event.target.checked)} /> À domicile</label>
            <label className="check-filter"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /> Profil vérifié</label>
          </aside>
          <div className="result-content">
            {catalogState === "loading" && <div className="provider-skeletons" aria-label="Chargement"><i /><i /><i /></div>}
            {(catalogState === "empty" || catalogState === "error") && <div className="useful-empty"><span>✦</span><h3>{catalogState === "error" ? "Catalogue momentanément indisponible" : "Les premiers professionnels arrivent bientôt"}</h3><p>{catalogState === "error" ? "Vérifiez votre connexion puis actualisez la page." : "Aucun profil approuvé ne correspond encore à cette zone. Devenez partenaire ou revenez prochainement."}</p><button className="outline-button" onClick={() => setAuthRequest({ role: "provider", mode: "register" })}>Référencer mon activité</button></div>}
            {catalogState === "live" && filteredProviders.length === 0 && <div className="useful-empty"><span>⌕</span><h3>Aucun résultat avec ces filtres</h3><p>Élargissez la zone, le prix ou la note pour afficher plus de professionnels.</p></div>}
            {catalogState === "live" && resultView === "list" && <div className="provider-list">{filteredProviders.map((provider) => <ProviderCard key={provider.id} provider={provider} favorite={favorites.includes(provider.id)} onFavorite={() => void toggleFavorite(provider)} onView={() => setProfile(provider)} onBook={() => setBooking(provider)} />)}</div>}
            {catalogState === "live" && resultView === "map" && <div className="map-view"><div className="map-grid" aria-label="Carte indicative des résultats">{filteredProviders.map((provider, index) => <button key={provider.id} style={{ left: `${16 + (index * 27) % 72}%`, top: `${18 + (index * 31) % 64}%` }} onClick={() => setProfile(provider)}><span>{index + 1}</span>{provider.name}</button>)}</div><p>Carte indicative · ouvrez une fiche pour consulter l’adresse complète.</p></div>}
          </div>
        </div>
      </section>

      <section className="compact-section promotions-section">
        <div className="compact-heading"><div><p className="eyebrow">Avantages</p><h2>Offres du moment</h2></div></div>
        {promotions.length ? <div className="promotion-grid">{promotions.map((promotion) => <article key={promotion.id}><span>{promotion.discountType === "percentage" ? `−${promotion.discountValue}%` : `−${formatPrice(promotion.discountValue)}`}</span><h3>{promotion.title}</h3><p>{promotion.description || "Offre active sur une sélection de prestations."}</p><small>Valable jusqu’au {new Date(promotion.endsAt).toLocaleDateString("fr-FR")}</small></article>)}</div> : <div className="promotion-empty"><span>◇</span><div><strong>Aucune promotion active pour le moment</strong><p>Les offres publiées par les professionnels apparaîtront ici automatiquement.</p></div></div>}
      </section>

      <section className="compact-section upcoming-section">
        <div className="compact-heading"><div><p className="eyebrow">Votre agenda</p><h2>Prochains rendez-vous</h2></div></div>
        {upcomingBookings.length ? <div className="upcoming-list">{upcomingBookings.map((item) => <article key={item.id}><span>▣</span><div><strong>{new Date(item.starts_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</strong><small>Réservation {item.id.slice(0, 8)} · {item.status}</small></div><button onClick={() => openAccount()}>Voir</button></article>)}</div> : <div className="account-callout"><div><span>▣</span><div><strong>{authenticated?.role === "client" ? "Aucun rendez-vous à venir" : "Connectez-vous à votre espace client"}</strong><p>Retrouvez les horaires, adresses, messages et options d’annulation au même endroit.</p></div></div><button className="primary-button" onClick={() => openAccount()}>{authenticated?.role === "client" ? "Ouvrir mon agenda" : "Se connecter"}</button></div>}
      </section>

      <section className="founder-banner"><Image src="/mata-founder-hero.png" alt="Fondatrice de Mata Beauty" fill sizes="(max-width: 760px) 35vw, 240px" /><div><p className="eyebrow light">La vision Mata Beauty</p><h2>Le savoir-faire local, accessible en quelques gestes.</h2><p>Une plateforme pensée au Sénégal pour réserver avec confiance.</p></div></section>
      <footer className="app-footer"><div className="app-brand"><span className="brand-emblem">M</span><span><strong>MATA</strong><small>BEAUTY</small></span></div><p>La réservation beauté de confiance au Sénégal.</p><button onClick={() => setAuthRequest({ role: "provider", mode: "register" })}>Devenir partenaire</button><button onClick={() => openAccount("admin")}>Administration</button><small>© 2026 Mata Beauty · Paiements externes en mode test</small></footer>

      <nav className="bottom-nav" aria-label="Navigation de l’application">
        <a className="active" href="#home"><i>⌂</i>Accueil</a><a href="#search"><i>⌕</i>Rechercher</a>
        <button onClick={() => openAccount()}><i>▣</i>Rendez-vous</button><button onClick={() => openAccount()}><i>◌</i>Messages</button><button onClick={() => openAccount()}><i>○</i>Profil</button>
      </nav>

      {profile && <ProfileModal provider={profile} onClose={() => setProfile(null)} onBook={() => { setBooking(profile); setProfile(null); }} favorite={favorites.includes(profile.id)} onFavorite={() => void toggleFavorite(profile)} />}
      {booking && <BookingModal provider={booking} initialDate={date} onClose={() => setBooking(null)} onSubmit={confirmBooking} />}
      {authRequest && <AuthModal initialMode={authRequest.mode} intendedRole={authRequest.role === "provider" ? "provider" : "client"} onClose={() => setAuthRequest(null)} onAuthenticated={(signedIn) => { setAuthenticated(signedIn); setAuthRequest(null); setView(signedIn.role); }} />}
    </main>
  );
}

function ProviderCard({ provider, favorite, onFavorite, onView, onBook }: { provider: Provider; favorite: boolean; onFavorite: () => void; onView: () => void; onBook: () => void }) {
  return <article className="provider-result-card">
    <div className="provider-result-cover">{provider.coverUrl ? <Image src={provider.coverUrl} alt={`Espace de ${provider.name}`} fill sizes="180px" /> : <span>{provider.initials}</span>}<button className={favorite ? "favorite active" : "favorite"} onClick={onFavorite} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}>{favorite ? "♥" : "♡"}</button></div>
    <div className="provider-result-main"><div className="provider-title-line"><h3>{provider.name}</h3>{provider.verified && <span className="verified-inline">✓ Vérifié</span>}</div><p>{provider.specialty}</p><div className="provider-meta"><span>★ {provider.rating.toFixed(1)} ({provider.reviews} avis)</span><span>⌖ {provider.area}</span><span>{provider.homeService ? "Salon & domicile" : "En salon"}</span></div><div className="next-slot"><span>Prochaine disponibilité</span><strong>Consulter l’agenda</strong></div></div>
    <div className="provider-result-action"><small>À partir de</small><strong>{formatPrice(provider.price)}</strong><button className="outline-button" onClick={onView}>Voir</button><button className="primary-button" onClick={onBook}>Réserver</button></div>
  </article>;
}

function ProfileModal({ provider, onClose, onBook, favorite, onFavorite }: { provider: Provider; onClose: () => void; onBook: () => void; favorite: boolean; onFavorite: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-name">
      <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
      <div className="profile-hero">{provider.coverUrl ? <Image src={provider.coverUrl} alt={`Univers de ${provider.name}`} fill sizes="900px" /> : <div className="profile-fallback">{provider.initials}</div>}</div>
      <div className="profile-content">
        <div className="profile-intro"><div><p className="eyebrow">{provider.verified ? "✓ Profil vérifié par Mata Beauty" : "Profil professionnel"}</p><h2 id="profile-name">{provider.name}</h2><p>{provider.specialty} · {provider.area}</p></div><button className="favorite profile-favorite" onClick={onFavorite} aria-label="Ajouter aux favoris">{favorite ? "♥" : "♡"}</button></div>
        <div className="profile-stats"><span><b>{provider.rating.toFixed(1)}</b> note</span><span><b>{provider.reviews}</b> avis</span><span><b>{provider.homeService ? "Oui" : "Non"}</b> domicile</span></div>
        <section className="profile-block"><h3>Prestation disponible</h3><button className="profile-service" onClick={onBook}><span><strong>{provider.specialty}</strong><small>{provider.durationMinutes} min</small></span><b>{formatPrice(provider.price)}</b></button></section>
        <section className="profile-block"><h3>Informations pratiques</h3><p>Zone : {provider.area}. Les coordonnées complètes et conditions d’annulation sont accessibles pendant la réservation.</p></section>
        <div className="profile-sticky-action"><div><small>À partir de</small><strong>{formatPrice(provider.price)}</strong></div><button className="primary-button" onClick={onBook}>Réserver maintenant</button></div>
      </div>
    </section>
  </div>;
}

function BookingModal({ provider, initialDate, onClose, onSubmit }: { provider: Provider; initialDate: string; onClose: () => void; onSubmit: (request: BookingRequest) => Promise<BookingConfirmation | null> }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [form, setForm] = useState<BookingRequest>({ date: initialDate || defaultBookingDate, time: "10:00", locationMode: "salon", address: "", note: "", paymentMethod: "on_site" });
  const steps = ["Prestation", "Professionnel", "Date", "Heure", "Lieu", "Récapitulatif", "Paiement", "Confirmation"];
  async function confirm() {
    setSubmitting(true);
    const result = await onSubmit(form);
    setSubmitting(false);
    if (result) setConfirmation(result);
  }
  const canContinue = step !== 5 || form.locationMode === "salon" || form.address.trim().length >= 5;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <button className="modal-close" onClick={onClose} aria-label="Fermer">×</button>
      {confirmation ? <BookingSuccess provider={provider} confirmation={confirmation} onClose={onClose} /> : <>
        <p className="eyebrow">Réservation sécurisée</p><h2 id="booking-title">Réserver avec {provider.name}</h2>
        <div className="booking-progress-eight" aria-label={`Étape ${step} sur 8`}>{steps.map((label, index) => <span className={step >= index + 1 ? "active" : ""} key={label}><i>{index + 1}</i><small>{label}</small></span>)}</div>
        <div className="booking-step-content">
          {step === 1 && <><h3>Choisissez la prestation</h3><label className="service-choice"><input type="radio" checked readOnly /><span><strong>{provider.specialty}</strong><small>{provider.durationMinutes} min</small></span><b>{formatPrice(provider.price)}</b></label></>}
          {step === 2 && <><h3>Choisissez votre professionnel</h3><label className="service-choice"><input type="radio" checked readOnly /><span><strong>Sans préférence</strong><small>Le professionnel disponible de {provider.name}</small></span></label></>}
          {step === 3 && <><h3>Choisissez la date</h3><label>Date du rendez-vous<input type="date" value={form.date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label></>}
          {step === 4 && <><h3>Choisissez l’heure</h3><div className="slot-grid">{["09:00", "10:00", "11:30", "14:00", "16:30", "18:00"].map((time) => <button className={form.time === time ? "active" : ""} key={time} onClick={() => setForm({ ...form, time })}>{time}</button>)}</div><p className="muted">Les créneaux définitifs sont confirmés par le prestataire.</p></>}
          {step === 5 && <><h3>Où aura lieu la prestation ?</h3><label>Lieu<select value={form.locationMode} onChange={(event) => setForm({ ...form, locationMode: event.target.value as BookingRequest["locationMode"] })}><option value="salon">Chez le prestataire</option>{provider.homeService && <option value="client_address">À mon domicile</option>}</select></label>{form.locationMode === "client_address" && <label>Adresse complète<textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Quartier, rue et repère" /></label>}</>}
          {step === 6 && <><h3>Récapitulatif</h3><div className="booking-summary"><span><small>Prestation</small><strong>{provider.specialty}</strong></span><span><small>Date</small><strong>{form.date} à {form.time}</strong></span><span><small>Lieu</small><strong>{form.locationMode === "salon" ? provider.name : form.address}</strong></span><span><small>Total</small><strong>{formatPrice(provider.price)}</strong></span></div><label>Note facultative<textarea maxLength={1000} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label></>}
          {step === 7 && <><h3>Mode de paiement</h3><label className="service-choice"><input type="radio" checked={form.paymentMethod === "on_site"} onChange={() => setForm({ ...form, paymentMethod: "on_site" })} /><span><strong>Paiement sur place</strong><small>Aucun débit en ligne</small></span></label><label className="service-choice disabled"><input type="radio" disabled /><span><strong>Wave / Orange Money</strong><small>Bientôt disponible · API en mode test</small></span></label></>}
          {step === 8 && <><h3>Confirmez votre rendez-vous</h3><div className="test-banner">Paiement externe en mode test. Votre demande sera persistée dans votre espace.</div><div className="booking-total"><span>Total</span><strong>{formatPrice(provider.price)}</strong></div></>}
        </div>
        <div className="booking-nav">{step > 1 && <button className="outline-button" onClick={() => setStep((current) => current - 1)}>Retour</button>}{step < 8 ? <button className="primary-button" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Continuer</button> : <button className="primary-button" disabled={submitting} onClick={() => void confirm()}>{submitting ? "Enregistrement…" : "Confirmer la réservation"}</button>}</div>
      </>}
    </section>
  </div>;
}

function BookingSuccess({ provider, confirmation, onClose }: { provider: Provider; confirmation: BookingConfirmation; onClose: () => void }) {
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${provider.specialty} · ${provider.name}`)}&dates=${confirmation.date.replaceAll("-", "")}T${confirmation.time.replace(":", "")}00/${confirmation.date.replaceAll("-", "")}T${confirmation.time.replace(":", "")}00`;
  return <div className="booking-success"><span>✓</span><p className="eyebrow">Demande enregistrée</p><h2>Votre rendez-vous est créé</h2><p>Numéro de réservation</p><code>{confirmation.id}</code><dl><div><dt>Prestation</dt><dd>{provider.specialty}</dd></div><div><dt>Prestataire</dt><dd>{provider.name}</dd></div><div><dt>Date</dt><dd>{confirmation.date} à {confirmation.time}</dd></div><div><dt>Adresse</dt><dd>{confirmation.location}</dd></div><div><dt>Prix</dt><dd>{formatPrice(provider.price)}</dd></div><div><dt>Statut</dt><dd>En attente</dd></div></dl><a className="outline-button" href={calendarUrl} target="_blank" rel="noreferrer">Ajouter au calendrier</a><button className="primary-button" onClick={onClose}>Terminer</button></div>;
}
