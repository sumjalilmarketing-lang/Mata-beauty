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
type ProviderService = { id: string; title: string; duration_minutes: number; price_amount: number };
type ProviderDetail = { bio: string | null; services: ProviderService[]; portfolio: string[] };
type AvailabilityRule = { starts_at: string; ends_at: string; slot_interval_minutes: number };
type AvailabilityException = { starts_at: string; ends_at: string; is_available: boolean };

const categoryAtlas = "/images/categories/mata-category-atlas.webp";
const categories = [
  { label: "Coiffure", icon: "✦", position: "0% 0%" },
  { label: "Tresses", icon: "≋", position: "25% 0%" },
  { label: "Perruques", icon: "◒", position: "50% 0%" },
  { label: "Maquillage", icon: "✧", position: "75% 0%" },
  { label: "Ongles", icon: "◐", position: "100% 0%" },
  { label: "Cils et sourcils", icon: "⌁", position: "0% 100%" },
  { label: "Soins du visage", icon: "♡", position: "25% 100%" },
  { label: "Barbier", icon: "◆", position: "50% 100%" },
  { label: "Épilation", icon: "◇", position: "75% 100%" },
  { label: "Massage et bien-être", icon: "☼", position: "100% 100%" },
] as const;

const subcategories: Record<string, string[]> = {
  Tresses: ["Tout", "Tresses collées", "Vanilles", "Braids", "Knotless", "Cornrows", "Locks"],
  Coiffure: ["Tout", "Brushing", "Lissage", "Coupe", "Coloration", "Cheveux naturels"],
  Ongles: ["Tout", "Manucure", "Pédicure", "Gel", "Nail art"],
};

const formatPrice = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;
const today = new Date().toISOString().slice(0, 10);
const defaultBookingDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export function MataBeautyApp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [subcategory, setSubcategory] = useState("Tout");
  const [area, setArea] = useState("Dakar, Sénégal");
  const [date, setDate] = useState("");
  const [screen, setScreen] = useState<"home" | "results">("home");
  const [catalog, setCatalog] = useState<Provider[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "live" | "empty" | "error">("loading");
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Array<{ id: string; starts_at: string; status: string }>>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [booking, setBooking] = useState<Provider | null>(null);
  const [profile, setProfile] = useState<Provider | null>(null);
  const [view, setView] = useState<"home" | "client" | "provider" | "admin">("home");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [homeOnly, setHomeOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRating, setMinRating] = useState("0");
  const [maxPrice, setMaxPrice] = useState("50000");
  const [notice, setNotice] = useState("");
  const [authenticated, setAuthenticated] = useState<AuthenticatedProfile | null>(null);
  const [authRequest, setAuthRequest] = useState<{ role: "client" | "provider" | "admin"; mode: "login" | "register" } | null>(null);

  const suggestions = useMemo(
    () => [...new Set([...categories.map((item) => item.label), ...catalog.flatMap((provider) => [provider.name, provider.specialty, provider.area])])],
    [catalog],
  );

  const filteredProviders = useMemo(() => {
    const normalized = `${query} ${subcategory === "Tout" ? "" : subcategory}`.trim().toLocaleLowerCase("fr");
    return catalog.filter((provider) => {
      const haystack = `${provider.name} ${provider.specialty} ${provider.category} ${provider.area}`.toLocaleLowerCase("fr");
      return (!normalized || haystack.includes(normalized))
        && (category === "Toutes" || haystack.includes(category.toLocaleLowerCase("fr")))
        && (!homeOnly || provider.homeService)
        && (!verifiedOnly || provider.verified)
        && provider.rating >= Number(minRating)
        && provider.price <= Number(maxPrice);
    });
  }, [catalog, category, homeOnly, maxPrice, minRating, query, subcategory, verifiedOnly]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      void Promise.resolve().then(() => setCatalogState("error"));
      return;
    }
    let active = true;
    void fetchPublishedProviders(supabase).then((items) => {
      if (!active) return;
      const providers: Provider[] = items.map((item) => ({
        ...item,
        initials: item.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      }));
      setCatalog(providers);
      setCatalogState(providers.length ? "live" : "empty");
    }).catch(() => { if (active) setCatalogState("error"); });
    void fetchActivePromotions(supabase).then((items) => { if (active) setPromotions(items); }).catch(() => {});
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
    setScreen("results");
  }

  function selectCategory(label: string) {
    setCategory(label);
    setSubcategory("Tout");
    setQuery("");
    setScreen("results");
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
      setNotice("Le favori n’a pas pu être enregistré.");
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
      setNotice(error?.code === "23P01" ? "Ce créneau vient d’être réservé." : "La réservation n’a pas pu être enregistrée.");
      return null;
    }
    await supabase.from("payments").insert({
      booking_id: created.id,
      payment_method: request.paymentMethod,
      payment_status: "pending",
      amount: quote.totalAmount,
      currency: quote.currency,
      is_test: true,
    });
    return { id: created.id, date: request.date, time: request.time, location: request.locationMode === "salon" ? `Chez ${booking.name}` : request.address };
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

  if (profile) {
    return <ProviderProfileScreen provider={profile} favorite={favorites.includes(profile.id)} onBack={() => setProfile(null)} onFavorite={() => void toggleFavorite(profile)} onBook={() => { setBooking(profile); }} />;
  }

  return (
    <main className="premium-mobile-app">
      {notice && <div className="toast" role="status">{notice}</div>}
      <div className="premium-app-frame">
        {screen === "home" ? (
          <HomeScreen
            authenticated={authenticated}
            query={query}
            setQuery={setQuery}
            area={area}
            setArea={setArea}
            date={date}
            setDate={setDate}
            suggestions={suggestions}
            catalog={catalog}
            catalogState={catalogState}
            promotions={promotions}
            upcomingBookings={upcomingBookings}
            favorites={favorites}
            onSearch={runSearch}
            onCategory={selectCategory}
            onViewProvider={setProfile}
            onFavorite={(provider) => void toggleFavorite(provider)}
            onAccount={() => openAccount()}
            onProviderRegister={() => setAuthRequest({ role: "provider", mode: "register" })}
          />
        ) : (
          <ResultsScreen
            category={category}
            subcategory={subcategory}
            setSubcategory={setSubcategory}
            area={area}
            providers={filteredProviders}
            catalogState={catalogState}
            favorites={favorites}
            filtersOpen={filtersOpen}
            setFiltersOpen={setFiltersOpen}
            homeOnly={homeOnly}
            setHomeOnly={setHomeOnly}
            verifiedOnly={verifiedOnly}
            setVerifiedOnly={setVerifiedOnly}
            minRating={minRating}
            setMinRating={setMinRating}
            maxPrice={maxPrice}
            setMaxPrice={setMaxPrice}
            onBack={() => setScreen("home")}
            onViewProvider={setProfile}
            onFavorite={(provider) => void toggleFavorite(provider)}
            onProviderRegister={() => setAuthRequest({ role: "provider", mode: "register" })}
          />
        )}
        <BottomNav active={screen === "home" ? "home" : "search"} onHome={() => setScreen("home")} onSearch={() => setScreen("results")} onAccount={openAccount} />
      </div>

      {booking && <BookingModal provider={booking} initialDate={date} onClose={() => setBooking(null)} onSubmit={confirmBooking} />}
      {authRequest && <AuthModal initialMode={authRequest.mode} intendedRole={authRequest.role === "provider" ? "provider" : "client"} onClose={() => setAuthRequest(null)} onAuthenticated={(signedIn) => { setAuthenticated(signedIn); setAuthRequest(null); setView(signedIn.role); }} />}
    </main>
  );
}

function Brand() {
  return <div className="premium-brand"><Image src="/favicon.svg" alt="" width={46} height={46} /><span><strong>MATA</strong><small>BEAUTY</small></span></div>;
}

function HomeScreen({
  authenticated, query, setQuery, area, setArea, date, setDate, suggestions, catalog, catalogState, promotions,
  upcomingBookings, favorites, onSearch, onCategory, onViewProvider, onFavorite, onAccount, onProviderRegister,
}: {
  authenticated: AuthenticatedProfile | null;
  query: string; setQuery: (value: string) => void; area: string; setArea: (value: string) => void;
  date: string; setDate: (value: string) => void; suggestions: string[]; catalog: Provider[];
  catalogState: "loading" | "live" | "empty" | "error"; promotions: CatalogPromotion[];
  upcomingBookings: Array<{ id: string; starts_at: string; status: string }>; favorites: string[];
  onSearch: (event?: FormEvent) => void; onCategory: (label: string) => void;
  onViewProvider: (provider: Provider) => void; onFavorite: (provider: Provider) => void;
  onAccount: () => void; onProviderRegister: () => void;
}) {
  return <div className="mobile-screen home-screen">
    <header className="mobile-topbar"><Brand /><div><button aria-label="Notifications" onClick={onAccount}>♢<i>3</i></button><button className="user-orb" aria-label="Ouvrir mon compte" onClick={onAccount}>{authenticated ? "MB" : "○"}</button></div></header>
    <section className="welcome-copy"><p>Bonjour {authenticated ? "à vous" : "chez Mata"} <span>👋</span></p><h1>Prenez soin de vous,<br />on s’occupe <em>du reste.</em></h1></section>
    <form className="mobile-search" onSubmit={onSearch}><span>⌕</span><input list="premium-suggestions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Que recherchez-vous ?" /><button type="button" aria-label="Ouvrir les filtres" onClick={() => onSearch()}>⌘</button><datalist id="premium-suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist></form>
    <button className="location-card" onClick={() => setArea(area === "Dakar, Sénégal" ? "Tout Dakar" : "Dakar, Sénégal")}><span>⌖</span><span><strong>{area}</strong><small>Changer de localisation</small></span><b>›</b></button>
    <div className="section-title"><h2>Catégories populaires</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div>
    <div className="photo-category-grid">{categories.map((item) => <button key={item.label} onClick={() => onCategory(item.label)}><span className="category-photo" style={{ backgroundImage: `url(${categoryAtlas})`, backgroundPosition: item.position }} role="img" aria-label={`Photographie ${item.label}`} /><strong>{item.label}</strong></button>)}</div>
    <div className="section-title"><h2>Prestataires proches</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div>
    <CatalogBlock providers={catalog.slice(0, 4)} catalogState={catalogState} favorites={favorites} onView={onViewProvider} onFavorite={onFavorite} onProviderRegister={onProviderRegister} />
    {promotions.length > 0 && <section className="premium-offers"><div className="section-title"><h2>Offres du moment</h2></div>{promotions.slice(0, 2).map((promotion) => <article key={promotion.id}><span>{promotion.discountType === "percentage" ? `−${promotion.discountValue}%` : `−${formatPrice(promotion.discountValue)}`}</span><div><strong>{promotion.title}</strong><small>{promotion.description}</small></div></article>)}</section>}
    {upcomingBookings.length > 0 && <section className="premium-upcoming"><div className="section-title"><h2>Vos rendez-vous</h2></div>{upcomingBookings.map((booking) => <button key={booking.id} onClick={onAccount}><span>▣</span><div><strong>{new Date(booking.starts_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</strong><small>{booking.status}</small></div><b>›</b></button>)}</section>}
    <div className="mobile-date-helper"><label>Quand souhaitez-vous réserver ?<input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
  </div>;
}

function ResultsScreen({
  category, subcategory, setSubcategory, area, providers, catalogState, favorites, filtersOpen, setFiltersOpen,
  homeOnly, setHomeOnly, verifiedOnly, setVerifiedOnly, minRating, setMinRating, maxPrice, setMaxPrice,
  onBack, onViewProvider, onFavorite, onProviderRegister,
}: {
  category: string; subcategory: string; setSubcategory: (value: string) => void; area: string; providers: Provider[];
  catalogState: "loading" | "live" | "empty" | "error"; favorites: string[]; filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void; homeOnly: boolean; setHomeOnly: (value: boolean) => void;
  verifiedOnly: boolean; setVerifiedOnly: (value: boolean) => void; minRating: string; setMinRating: (value: string) => void;
  maxPrice: string; setMaxPrice: (value: string) => void; onBack: () => void;
  onViewProvider: (provider: Provider) => void; onFavorite: (provider: Provider) => void; onProviderRegister: () => void;
}) {
  const chips = subcategories[category] || ["Tout", category, "À domicile", "Disponible aujourd’hui"];
  return <div className="mobile-screen results-screen">
    <header className="screen-header"><button aria-label="Retour" onClick={onBack}>‹</button><div><h1>{category === "Toutes" ? "Rechercher" : category}</h1><p>{area}</p></div><button aria-label="Filtres" onClick={() => setFiltersOpen(!filtersOpen)}>⌘</button></header>
    <div className="subcategory-strip">{chips.map((item) => <button key={item} className={subcategory === item ? "active" : ""} onClick={() => setSubcategory(item)}>{item}</button>)}</div>
    {filtersOpen && <aside className="mobile-filter-panel">
      <label>Prix maximum <strong>{formatPrice(Number(maxPrice))}</strong><input type="range" min="3000" max="50000" step="1000" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label>
      <label>Note<select value={minRating} onChange={(event) => setMinRating(event.target.value)}><option value="0">Toutes</option><option value="4">4 et plus</option><option value="4.5">4,5 et plus</option></select></label>
      <label><input type="checkbox" checked={homeOnly} onChange={(event) => setHomeOnly(event.target.checked)} /> À domicile</label>
      <label><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /> Vérifié</label>
    </aside>}
    <CatalogBlock providers={providers} catalogState={catalogState} favorites={favorites} onView={onViewProvider} onFavorite={onFavorite} onProviderRegister={onProviderRegister} />
  </div>;
}

function CatalogBlock({ providers, catalogState, favorites, onView, onFavorite, onProviderRegister }: { providers: Provider[]; catalogState: "loading" | "live" | "empty" | "error"; favorites: string[]; onView: (provider: Provider) => void; onFavorite: (provider: Provider) => void; onProviderRegister: () => void }) {
  if (catalogState === "loading") return <div className="mobile-skeletons" aria-label="Chargement"><i /><i /><i /></div>;
  if (catalogState === "empty" || catalogState === "error") return <div className="premium-empty"><span>✦</span><h3>{catalogState === "error" ? "Catalogue indisponible" : "Les premiers talents arrivent"}</h3><p>{catalogState === "error" ? "Vérifiez votre connexion puis réessayez." : "Aucun professionnel approuvé n’est encore publié dans cette zone."}</p><button onClick={onProviderRegister}>Devenir prestataire</button></div>;
  if (!providers.length) return <div className="premium-empty compact"><span>⌕</span><h3>Aucun résultat</h3><p>Essayez une autre catégorie ou élargissez vos filtres.</p></div>;
  return <div className="premium-provider-list">{providers.map((provider) => <ProviderCard key={provider.id} provider={provider} favorite={favorites.includes(provider.id)} onFavorite={() => onFavorite(provider)} onView={() => onView(provider)} />)}</div>;
}

function ProviderCard({ provider, favorite, onFavorite, onView }: { provider: Provider; favorite: boolean; onFavorite: () => void; onView: () => void }) {
  return <article className="premium-provider-card" onClick={onView} onKeyDown={(event) => { if (event.key === "Enter") onView(); }} role="button" tabIndex={0}>
    <div className="premium-provider-photo">{provider.coverUrl ? <Image src={provider.coverUrl} alt={`Espace de ${provider.name}`} fill sizes="120px" /> : <span>{provider.initials}</span>}</div>
    <div><div className="provider-name-row"><h3>{provider.name}</h3><button aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={(event) => { event.stopPropagation(); onFavorite(); }}>{favorite ? "♥" : "♡"}</button></div>{provider.verified && <span className="gold-verified">✦ Vérifié</span>}<p>★ {provider.rating.toFixed(1)} ({provider.reviews} avis)</p><p>⌖ {provider.area}</p><strong>À partir de <em>{formatPrice(provider.price)}</em></strong></div>
  </article>;
}

function ProviderProfileScreen({ provider, favorite, onBack, onFavorite, onBook }: { provider: Provider; favorite: boolean; onBack: () => void; onFavorite: () => void; onBook: () => void }) {
  const [tab, setTab] = useState<"services" | "reviews" | "about">("services");
  const [detail, setDetail] = useState<ProviderDetail>({ bio: null, services: [], portfolio: [] });
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void Promise.all([
      supabase.from("provider_profiles").select("bio").eq("profile_id", provider.profileId).maybeSingle(),
      supabase.from("provider_services").select("id,title,duration_minutes,price_amount").eq("provider_id", provider.profileId).eq("is_active", true).order("price_amount"),
      supabase.from("portfolio_items").select("media_url").eq("provider_id", provider.profileId).order("position").limit(12),
    ]).then(([profileResult, servicesResult, portfolioResult]) => {
      if (!active) return;
      setDetail({
        bio: profileResult.data?.bio ?? null,
        services: (servicesResult.data ?? []) as ProviderService[],
        portfolio: (portfolioResult.data ?? []).map((item) => item.media_url),
      });
    });
    return () => { active = false; };
  }, [provider.profileId]);
  const services = detail.services.length ? detail.services : [{ id: provider.serviceId, title: provider.specialty, duration_minutes: provider.durationMinutes, price_amount: provider.price }];
  return <main className="premium-mobile-app"><div className="premium-app-frame profile-app-frame"><div className="mobile-screen premium-profile-screen">
    <div className="premium-profile-hero">{provider.coverUrl ? <Image src={provider.coverUrl} alt={`Univers de ${provider.name}`} fill priority sizes="430px" /> : <div>{provider.initials}</div>}<div className="profile-hero-actions"><button aria-label="Retour" onClick={onBack}>‹</button><span /><button aria-label="Partager" onClick={() => void navigator.share?.({ title: provider.name, url: window.location.href })}>⇧</button><button aria-label="Favori" onClick={onFavorite}>{favorite ? "♥" : "♡"}</button></div></div>
    <section className="premium-profile-info"><div className="profile-heading-row"><h1>{provider.name}</h1>{provider.verified && <span className="gold-verified">✦ Vérifié</span>}</div><p className="profile-rating">★ {provider.rating.toFixed(1)} ({provider.reviews} avis) <i>•</i> {provider.area}</p><p>{detail.bio || `${provider.specialty}, avec une approche professionnelle et personnalisée.`}</p><div className="profile-facts"><span>◷<strong>Sur rendez-vous</strong><small>Horaires réels</small></span><span>⌂<strong>{provider.homeService ? "À domicile" : "En salon"}</strong><small>{provider.homeService ? "Disponible" : "Sur place"}</small></span><span>◫<strong>Clientèle</strong><small>Mixte</small></span></div>
      {detail.portfolio.length > 0 && <div className="portfolio-strip">{detail.portfolio.map((url, index) => <Image key={url} src={url} alt={`Réalisation ${index + 1} de ${provider.name}`} width={92} height={92} />)}</div>}
    </section>
    <div className="profile-tabs"><button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}>Prestations</button><button className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}>Avis</button><button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>À propos</button></div>
    <section className="profile-tab-content">
      {tab === "services" && services.map((service) => <button className="profile-service-row" key={service.id} onClick={onBook}><span><strong>{service.title}</strong><small>À partir de <em>{formatPrice(service.price_amount)}</em></small></span><span>{formatDuration(service.duration_minutes)} <b>›</b></span></button>)}
      {tab === "reviews" && <div className="profile-empty-tab"><strong>{provider.rating.toFixed(1)} / 5</strong><p>{provider.reviews ? `${provider.reviews} avis vérifiés sont associés à ce profil.` : "Aucun avis publié pour le moment."}</p></div>}
      {tab === "about" && <div className="profile-empty-tab"><strong>Informations pratiques</strong><p>{detail.bio || `Prestations disponibles à ${provider.area}. Les coordonnées complètes sont communiquées pendant la réservation.`}</p></div>}
    </section>
    <div className="profile-book-bar"><button onClick={onBook}>Réserver un rendez-vous</button></div>
  </div></div></main>;
}

function BookingModal({ provider, initialDate, onClose, onSubmit }: { provider: Provider; initialDate: string; onClose: () => void; onSubmit: (request: BookingRequest) => Promise<BookingConfirmation | null> }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [form, setForm] = useState<BookingRequest>({ date: initialDate || defaultBookingDate, time: "", locationMode: "salon", address: "", note: "", paymentMethod: "on_site" });
  const steps = ["Prestation", "Professionnel", "Date", "Heure", "Confirmation"];

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) setAvailabilityLoading(true); });
    const start = `${form.date}T00:00:00+00:00`;
    const end = `${form.date}T23:59:59+00:00`;
    void Promise.all([
      supabase.from("availability_rules").select("starts_at,ends_at,slot_interval_minutes").eq("provider_id", provider.profileId).eq("weekday", new Date(`${form.date}T12:00:00Z`).getUTCDay()),
      supabase.from("availability_exceptions").select("starts_at,ends_at,is_available").eq("provider_id", provider.profileId).gte("ends_at", start).lte("starts_at", end),
    ]).then(([ruleResult, exceptionResult]) => {
      if (!active) return;
      setRules((ruleResult.data ?? []) as AvailabilityRule[]);
      setExceptions((exceptionResult.data ?? []) as AvailabilityException[]);
      setAvailabilityLoading(false);
    });
    return () => { active = false; };
  }, [form.date, provider.profileId]);

  const slots = useMemo(() => buildSlots(form.date, rules, exceptions, provider.durationMinutes), [exceptions, form.date, provider.durationMinutes, rules]);
  const calendarDays = useMemo(() => buildCalendarDays(form.date), [form.date]);
  async function confirm() {
    setSubmitting(true);
    const result = await onSubmit(form);
    setSubmitting(false);
    if (result) setConfirmation(result);
  }
  const canContinue = step !== 4 || Boolean(form.time);
  return <div className="modal-backdrop premium-booking-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal premium-booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <header className="booking-screen-header"><button aria-label="Fermer" onClick={onClose}>‹</button><div><h2 id="booking-title">Réserver</h2><p>{provider.name}</p></div></header>
      {confirmation ? <BookingSuccess provider={provider} confirmation={confirmation} onClose={onClose} /> : <>
        <div className="five-step-progress" aria-label={`Étape ${step} sur 5`}>{steps.map((label, index) => <span className={step >= index + 1 ? "active" : ""} key={label}><i>{index + 1}</i><small>{label}</small></span>)}</div>
        <div className="premium-booking-content">
          {step === 1 && <><h3>Choisissez la prestation</h3><label className="dark-service-choice"><input type="radio" checked readOnly /><span><strong>{provider.specialty}</strong><small>{formatDuration(provider.durationMinutes)}</small></span><b>{formatPrice(provider.price)}</b></label></>}
          {step === 2 && <><h3>Choisissez un professionnel</h3><label className="dark-service-choice"><input type="radio" checked readOnly /><span><strong>Sans préférence</strong><small>Le premier professionnel disponible</small></span></label></>}
          {step === 3 && <><h3>Choisissez une date</h3><div className="calendar-heading"><strong>{new Date(`${form.date}T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</strong><input aria-label="Choisir une autre date" type="date" min={today} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, time: "" })} /></div><div className="calendar-week"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div><div className="calendar-grid">{calendarDays.map((day) => <button key={day.date} disabled={!day.inMonth || day.date < today} className={form.date === day.date ? "active" : ""} onClick={() => setForm({ ...form, date: day.date, time: "" })}>{day.day}</button>)}</div></>}
          {step === 4 && <><h3>Choisissez une heure</h3>{availabilityLoading ? <div className="slot-loading">Chargement des disponibilités…</div> : slots.length ? <div className="premium-slot-grid">{slots.map((time) => <button className={form.time === time ? "active" : ""} key={time} onClick={() => setForm({ ...form, time })}>{time}</button>)}</div> : <div className="no-slots">Aucun créneau publié pour cette date. Choisissez un autre jour.</div>}</>}
          {step === 5 && <><h3>Confirmez votre rendez-vous</h3><div className="booking-recap-card"><div className="recap-photo">{provider.coverUrl ? <Image src={provider.coverUrl} alt="" fill sizes="70px" /> : provider.initials}</div><div><strong>{provider.specialty}</strong><small>{formatDuration(provider.durationMinutes)} · {form.date} à {form.time}</small></div><b>{formatPrice(provider.price)}</b></div><label>Lieu<select value={form.locationMode} onChange={(event) => setForm({ ...form, locationMode: event.target.value as BookingRequest["locationMode"] })}><option value="salon">Chez le prestataire</option>{provider.homeService && <option value="client_address">À mon domicile</option>}</select></label>{form.locationMode === "client_address" && <label>Adresse<textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>}<label>Note<textarea maxLength={1000} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><div className="payment-note">Paiement sur place · Wave et Orange Money restent en mode test.</div><p className="cancellation-note">Annulation possible depuis votre espace selon les conditions du prestataire.</p></>}
        </div>
        <div className="premium-booking-nav">{step > 1 && <button className="back-button" onClick={() => setStep((current) => current - 1)}>Retour</button>}{step < 5 ? <button disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Continuer</button> : <button disabled={submitting || !form.time} onClick={() => void confirm()}>{submitting ? "Enregistrement…" : "Confirmer le rendez-vous"}</button>}</div>
      </>}
    </section>
  </div>;
}

function BookingSuccess({ provider, confirmation, onClose }: { provider: Provider; confirmation: BookingConfirmation; onClose: () => void }) {
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${provider.specialty} · ${provider.name}`)}&dates=${confirmation.date.replaceAll("-", "")}T${confirmation.time.replace(":", "")}00/${confirmation.date.replaceAll("-", "")}T${confirmation.time.replace(":", "")}00`;
  return <div className="premium-booking-success"><span>✓</span><p>Demande enregistrée</p><h2>Votre rendez-vous est créé</h2><code>{confirmation.id}</code><dl><div><dt>Prestation</dt><dd>{provider.specialty}</dd></div><div><dt>Date</dt><dd>{confirmation.date} à {confirmation.time}</dd></div><div><dt>Adresse</dt><dd>{confirmation.location}</dd></div><div><dt>Statut</dt><dd>En attente</dd></div></dl><a href={calendarUrl} target="_blank" rel="noreferrer">Ajouter au calendrier</a><button onClick={onClose}>Terminer</button></div>;
}

function BottomNav({ active, onHome, onSearch, onAccount }: { active: "home" | "search"; onHome: () => void; onSearch: () => void; onAccount: (section?: "client" | "provider" | "admin") => void }) {
  return <nav className="premium-bottom-nav" aria-label="Navigation de l’application"><button className={active === "home" ? "active" : ""} onClick={onHome}><i>⌂</i>Accueil</button><button className={active === "search" ? "active" : ""} onClick={onSearch}><i>⌕</i>Rechercher</button><button onClick={() => onAccount()}><i>▣</i>Rendez-vous</button><button onClick={() => onAccount()}><i>◌</i>Messages</button><button onClick={() => onAccount()}><i>○</i>Profil</button></nav>;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining}` : `${hours} h`;
}

function buildCalendarDays(dateValue: string) {
  const selected = new Date(`${dateValue}T12:00:00`);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - offset + 1);
    return { day: date.getDate(), date: date.toISOString().slice(0, 10), inMonth: date.getMonth() === month };
  });
}

function buildSlots(dateValue: string, rules: AvailabilityRule[], exceptions: AvailabilityException[], durationMinutes: number) {
  const slots: string[] = [];
  for (const rule of rules) {
    const [startHour, startMinute] = rule.starts_at.split(":").map(Number);
    const [endHour, endMinute] = rule.ends_at.split(":").map(Number);
    let cursor = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    while (cursor + durationMinutes <= end) {
      const time = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
      const slotStart = new Date(`${dateValue}T${time}:00+00:00`);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
      const blocked = exceptions.some((exception) => !exception.is_available && slotStart < new Date(exception.ends_at) && slotEnd > new Date(exception.starts_at));
      if (!blocked && slotStart > new Date()) slots.push(time);
      cursor += rule.slot_interval_minutes;
    }
  }
  return [...new Set(slots)];
}
