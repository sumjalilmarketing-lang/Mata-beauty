"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { AuthModal, type AuthenticatedProfile } from "./auth-modal";
import { LiveDashboard } from "./live-dashboard";
import { SocialFeed } from "./social-feed";
import { calculateBookingEnd, calculateBookingQuote } from "@/lib/domain/booking";
import { fetchActivePromotions, fetchPublishedProviders, type CatalogPromotion } from "@/lib/supabase/catalog";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadAuthenticatedProfile } from "@/lib/auth/profile";

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
  paymentMethod: "on_site" | "wave" | "orange_money" | "card";
};

type BookingConfirmation = { id: string; date: string; time: string; location: string };
type ProviderService = { id: string; title: string; duration_minutes: number; price_amount: number };
type ProviderDetail = { bio: string | null; services: ProviderService[]; portfolio: string[] };
type BookingSelection = { provider: Provider; service: ProviderService; sourcePostId?: string };
type AvailabilitySlot = { slot_start: string };

const bookingDraftKey = "mata-booking-draft";
const bookingDraftSchema = z.object({
  selection: z.object({
    provider: z.object({
      id: z.string().min(1), profileId: z.string().min(1), serviceId: z.string().min(1), name: z.string(), specialty: z.string(),
      category: z.string(), area: z.string(), price: z.number().int().nonnegative(), rating: z.number(), reviews: z.number().int().nonnegative(),
      initials: z.string(), verified: z.boolean(), homeService: z.boolean(), durationMinutes: z.number().int(), coverUrl: z.string().optional(),
    }),
    service: z.object({ id: z.string().min(1), title: z.string(), duration_minutes: z.number().int(), price_amount: z.number().int().nonnegative() }),
    sourcePostId: z.string().uuid().optional(),
  }),
  request: z.object({
    date: z.string(), time: z.string(), locationMode: z.enum(["salon", "client_address"]), address: z.string(), note: z.string(),
    paymentMethod: z.enum(["on_site", "wave", "orange_money", "card"]),
  }),
});

function readBookingDraft() {
  if (typeof window === "undefined") return null;
  try { return bookingDraftSchema.safeParse(JSON.parse(window.sessionStorage.getItem(bookingDraftKey) ?? "null")).data ?? null; }
  catch { return null; }
}

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

export function MataBeautyApp({ supabaseUrl, supabaseAnonKey }: { supabaseUrl: string; supabaseAnonKey: string }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const oauthReturn = useRef({ intent: null as string | null, authenticated: false });
  const [showSplash, setShowSplash] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [subcategory, setSubcategory] = useState("Tout");
  const [area, setArea] = useState("Dakar, Sénégal");
  const [date, setDate] = useState("");
  const [screen, setScreen] = useState<"feed" | "home" | "results">("feed");
  const [catalog, setCatalog] = useState<Provider[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "live" | "empty" | "error">("loading");
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [nextAvailability, setNextAvailability] = useState<Record<string, string>>({});
  const [upcomingBookings, setUpcomingBookings] = useState<Array<{ id: string; starts_at: string; status: string }>>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [booking, setBooking] = useState<BookingSelection | null>(null);
  const [restoredBookingRequest, setRestoredBookingRequest] = useState<BookingRequest | null>(null);
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

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("mata-theme");
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    void Promise.resolve().then(() => setTheme(savedTheme === "dark" || savedTheme === "light" ? savedTheme : preferredTheme));
    const splashTimer = window.setTimeout(() => setShowSplash(false), 1350);
    const draft = readBookingDraft();
    const parameters = new URLSearchParams(window.location.search);
    oauthReturn.current = { intent: parameters.get("intent"), authenticated: parameters.get("auth") === "google" };
    const authError = parameters.get("auth_error");
    void Promise.resolve().then(() => {
      if (draft) {
        setBooking(draft.selection);
        setProfile(draft.selection.provider);
        setRestoredBookingRequest(draft.request);
      }
      if (authError) {
        const messages: Record<string, string> = {
          google_cancelled: "Connexion Google annulée.", google_provider_error: "Google n’a pas pu autoriser la connexion.",
          invalid_callback: "Retour Google invalide.", oauth_exchange_failed: "La session Google a expiré. Recommencez.",
          profile_creation_failed: "Le profil Mata Beauty n’a pas pu être créé.", professional_request_failed: "La demande professionnelle n’a pas pu être préparée.",
          account_suspended: "Ce compte est suspendu.", oauth_unavailable: "La connexion Google est momentanément indisponible.",
        };
        setNotice(messages[authError] ?? "La connexion Google a échoué.");
      } else if (parameters.get("auth") === "google") {
        setNotice(parameters.get("profile") === "incomplete" ? "Connexion Google réussie. Complétez maintenant votre profil." : "Connexion Google réussie.");
      }
    });
    if (authError || parameters.has("auth")) window.history.replaceState(null, "", window.location.pathname);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (profile) window.scrollTo(0, 0);
  }, [profile]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      window.localStorage.setItem("mata-theme", next);
      return next;
    });
  }

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
    const oauthIntent = oauthReturn.current.intent;
    const oauthAuthenticated = oauthReturn.current.authenticated;
    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!active || !user) return;
      const signedIn = await loadAuthenticatedProfile(supabase, user.id).catch(() => null);
      if (!active || !signedIn) return;
      setAuthenticated(signedIn);
      if (!readBookingDraft() && oauthIntent === "professional" && signedIn.roles.includes("provider")) setView("provider");
      else if (!readBookingDraft() && signedIn.profileIncomplete && oauthAuthenticated) setView("client");
      if (signedIn.roles.includes("client")) {
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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      setAuthenticated(null);
      setFavorites([]);
      setUpcomingBookings([]);
      setBooking(null);
      setProfile(null);
      setView("home");
      window.sessionStorage.removeItem(bookingDraftKey);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !catalog.length) return;
    let active = true;
    void Promise.all(catalog.slice(0, 12).map(async (provider) => {
      const { data } = await supabase.rpc("get_available_slots", {
        target_provider_id: provider.profileId,
        target_provider_service_id: provider.serviceId,
        from_date: today,
        days: 7,
      }).limit(1);
      return [provider.id, ((data ?? []) as AvailabilitySlot[])[0]?.slot_start ?? ""] as const;
    })).then((entries) => {
      if (active) setNextAvailability(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [catalog]);

  function openAccount(section: "client" | "provider" | "admin" = "client") {
    if (authenticated?.roles.includes(section)) setView(section);
    else setAuthRequest({ role: section, mode: "login" });
  }

  function startBooking(selection: BookingSelection) {
    setRestoredBookingRequest(null);
    setBooking(selection);
  }

  function closeBooking() {
    window.sessionStorage.removeItem(bookingDraftKey);
    setRestoredBookingRequest(null);
    setBooking(null);
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

  function openSocialProvider(authorId: string) {
    const provider = catalog.find((item) => item.profileId === authorId);
    if (provider) setProfile(provider);
    else setNotice("Ce profil n’est pas encore disponible dans le catalogue.");
  }

  function bookSocialService(authorId: string, service: ProviderService, sourcePostId: string) {
    const provider = catalog.find((item) => item.profileId === authorId);
    if (provider) startBooking({ provider, service, sourcePostId });
    else setNotice("Cette prestation n’est pas disponible actuellement.");
  }

  async function toggleFavorite(provider: Provider) {
    if (!authenticated?.roles.includes("client")) {
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
    const { provider, service } = booking;
    if (!authenticated?.roles.includes("client")) {
      setAuthRequest({ role: "client", mode: "login" });
      return null;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const startsAt = new Date(`${request.date}T${request.time}:00+00:00`);
    const endsAt = calculateBookingEnd(startsAt, service.duration_minutes);
    const quote = calculateBookingQuote(service.price_amount);
    const { data: created, error } = await supabase.from("bookings").insert({
      client_id: authenticated.userId,
      provider_id: provider.profileId,
      provider_service_id: service.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "pending",
      location_mode: request.locationMode,
      appointment_address: request.locationMode === "client_address" ? request.address.trim() : null,
      total_amount: quote.totalAmount,
      currency: quote.currency,
      client_note: request.note.trim() || null,
      source_post_id: booking.sourcePostId ?? null,
    }).select("id").single();
    if (error || !created) {
      setNotice(error?.code === "23P01" ? "Ce créneau vient d’être réservé." : "La réservation n’a pas pu être enregistrée.");
      return null;
    }
    window.sessionStorage.removeItem(bookingDraftKey);
    if (request.paymentMethod !== "on_site") {
      const { data: sessionData } = await supabase.auth.getSession();
      const paymentResponse = await fetch("/api/payments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ bookingId: created.id, method: request.paymentMethod, attempt: crypto.randomUUID() }),
      });
      if (!paymentResponse.ok) {
        setNotice("La réservation est enregistrée, mais le paiement n’a pas pu être préparé. Aucun débit n’a eu lieu.");
      }
    }
    return { id: created.id, date: request.date, time: request.time, location: request.locationMode === "salon" ? `Chez ${provider.name}` : request.address };
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
  }

  function handleAuthenticated(signedIn: AuthenticatedProfile) {
    setAuthenticated(signedIn);
    setAuthRequest(null);
    if (!booking) setView(signedIn.roles.includes(authRequest?.role ?? "client") ? (authRequest?.role ?? signedIn.role) : signedIn.role);
  }

  if (view !== "home" && authenticated?.roles.includes(view)) {
    return <LiveDashboard role={view} userId={authenticated.userId} displayName="votre espace" onBack={() => setView("home")} onSignOut={signOut} />;
  }

  if (profile) {
    return <><ProviderProfileScreen provider={profile} favorite={favorites.includes(profile.id)} onBack={() => setProfile(null)} onFavorite={() => void toggleFavorite(profile)} onBook={(service) => startBooking({ provider: profile, service })} />{booking && <BookingModal selection={booking} initialDate={date} initialRequest={restoredBookingRequest} authenticated={Boolean(authenticated?.roles.includes("client"))} onClose={closeBooking} onSubmit={confirmBooking} />}{authRequest && <AuthModal initialMode={authRequest.mode} intendedRole={authRequest.role === "provider" ? "provider" : "client"} onClose={() => setAuthRequest(null)} onAuthenticated={handleAuthenticated} />}</>;
  }

  return (
    <main className="premium-mobile-app" data-theme={theme}>
      {showSplash && <div className="mata-splash" role="status" aria-label="Ouverture de Mata Beauty"><Image src="/brand/mata-app-icon.webp" alt="" width={172} height={172} priority unoptimized /><strong>MATA</strong><span>BEAUTY</span><i /></div>}
      {notice && <div className="toast" role="status">{notice}</div>}
      <div className="premium-app-frame">
        {screen === "feed" ? <SocialFeed
          authenticated={authenticated}
          onRequireAuth={() => setAuthRequest({ role: "client", mode: "login" })}
          onDiscover={() => setScreen("home")}
          onPublish={() => openAccount("provider")}
          onOpenProvider={openSocialProvider}
          onBook={bookSocialService}
        /> : screen === "home" ? (
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
            nextAvailability={nextAvailability}
            promotions={promotions}
            upcomingBookings={upcomingBookings}
            favorites={favorites}
            onSearch={runSearch}
            onCategory={selectCategory}
            onViewProvider={setProfile}
            onBook={(provider) => startBooking({ provider, service: defaultService(provider) })}
            onFavorite={(provider) => void toggleFavorite(provider)}
            onAccount={() => openAccount()}
            onProviderRegister={() => setAuthRequest({ role: "provider", mode: "register" })}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <ResultsScreen
            category={category}
            subcategory={subcategory}
            setSubcategory={setSubcategory}
            area={area}
            providers={filteredProviders}
            nextAvailability={nextAvailability}
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
            onBook={(provider) => startBooking({ provider, service: defaultService(provider) })}
            onFavorite={(provider) => void toggleFavorite(provider)}
            onProviderRegister={() => setAuthRequest({ role: "provider", mode: "register" })}
          />
        )}
        <BottomNav active={screen === "feed" ? "feed" : "discover"} onFeed={() => setScreen("feed")} onDiscover={() => setScreen("home")} onPublish={() => openAccount("provider")} onAccount={openAccount} />
      </div>

      {booking && <BookingModal selection={booking} initialDate={date} initialRequest={restoredBookingRequest} authenticated={Boolean(authenticated?.roles.includes("client"))} onClose={closeBooking} onSubmit={confirmBooking} />}
      {authRequest && <AuthModal initialMode={authRequest.mode} intendedRole={authRequest.role === "provider" ? "provider" : "client"} onClose={() => setAuthRequest(null)} onAuthenticated={handleAuthenticated} />}
    </main>
  );
}

function Brand() {
  return <div className="premium-brand"><Image src="/brand/mata-app-icon.webp" alt="Mata Beauty" width={48} height={48} priority unoptimized /><span><strong>MATA</strong><small>BEAUTY</small></span></div>;
}

function HomeScreen({
  authenticated, query, setQuery, area, setArea, date, setDate, suggestions, catalog, catalogState, nextAvailability, promotions,
  upcomingBookings, favorites, onSearch, onCategory, onViewProvider, onBook, onFavorite, onAccount, onProviderRegister, theme, onToggleTheme,
}: {
  authenticated: AuthenticatedProfile | null;
  query: string; setQuery: (value: string) => void; area: string; setArea: (value: string) => void;
  date: string; setDate: (value: string) => void; suggestions: string[]; catalog: Provider[];
  catalogState: "loading" | "live" | "empty" | "error"; nextAvailability: Record<string, string>; promotions: CatalogPromotion[];
  upcomingBookings: Array<{ id: string; starts_at: string; status: string }>; favorites: string[];
  onSearch: (event?: FormEvent) => void; onCategory: (label: string) => void;
  onViewProvider: (provider: Provider) => void; onBook: (provider: Provider) => void; onFavorite: (provider: Provider) => void;
  onAccount: () => void; onProviderRegister: () => void; theme: "light" | "dark"; onToggleTheme: () => void;
}) {
  return <div className="mobile-screen home-screen">
    <header className="mobile-topbar"><Brand /><div><button aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"} onClick={onToggleTheme}>{theme === "dark" ? "☀" : "☾"}</button><button aria-label="Notifications" onClick={onAccount}>◇<i>3</i></button><button className="user-orb" aria-label="Ouvrir mon compte" onClick={onAccount}>{authenticated ? "MB" : "○"}</button></div></header>
    <section className="welcome-copy"><p>Bonjour {authenticated ? "à vous" : "chez Mata"} <span>👋</span></p><h1>Prenez soin de vous,<br />on s’occupe <em>du reste.</em></h1></section>
    <form className="mobile-search" onSubmit={onSearch}><span>⌕</span><input list="premium-suggestions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Que recherchez-vous ?" /><button type="button" aria-label="Ouvrir les filtres" onClick={() => onSearch()}>⌘</button><datalist id="premium-suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist></form>
    <button className="location-card" onClick={() => setArea(area === "Dakar, Sénégal" ? "Tout Dakar" : "Dakar, Sénégal")}><span>⌖</span><span><strong>{area}</strong><small>Changer de localisation</small></span><b>›</b></button>
    <section className="mata-hero-card"><div><span>BEAUTÉ, SIMPLEMENT</span><h2>Trouvez votre prochain coup de cœur.</h2><p>Des professionnels vérifiés et des créneaux disponibles maintenant.</p><button onClick={() => onCategory("Toutes")}>Réserver maintenant</button></div><Image src="/brand/mata-app-icon.webp" alt="" width={180} height={180} unoptimized /></section>
    <div className="section-title"><h2>Catégories populaires</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div>
    <div className="photo-category-grid">{categories.map((item) => <button key={item.label} onClick={() => onCategory(item.label)}><span className="category-photo" style={{ backgroundImage: `url(${categoryAtlas})`, backgroundPosition: item.position }} role="img" aria-label={`Photographie ${item.label}`} /><strong>{item.label}</strong></button>)}</div>
    <div className="section-title"><h2>Disponibles aujourd’hui</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div>
    <CatalogBlock providers={catalog.filter((provider) => isToday(nextAvailability[provider.id])).slice(0, 4)} fallbackProviders={catalog.slice(0, 4)} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister} />
    {catalog.length > 0 && <section className="mata-recommendations"><div className="section-title"><h2>Choisis pour vous</h2><span>✦ Sélection intelligente</span></div><button onClick={() => onViewProvider(catalog[0])}><strong>{catalog[0].name}</strong><small>{catalog[0].specialty} · {catalog[0].rating.toFixed(1)} ★</small><b>Découvrir</b></button></section>}
    {catalog.some((provider) => nextAvailability[provider.id]) && <section className="next-availability-strip"><strong>Prochaines disponibilités</strong>{catalog.filter((provider) => nextAvailability[provider.id]).slice(0, 5).map((provider) => <button key={provider.id} onClick={() => onBook(provider)}><span>{formatSlotLabel(nextAvailability[provider.id])}</span><small>{provider.name}</small></button>)}</section>}
    {promotions.length > 0 && <section className="premium-offers"><div className="section-title"><h2>Offres du moment</h2></div>{promotions.slice(0, 2).map((promotion) => <article key={promotion.id}><span>{promotion.discountType === "percentage" ? `−${promotion.discountValue}%` : `−${formatPrice(promotion.discountValue)}`}</span><div><strong>{promotion.title}</strong><small>{promotion.description}</small></div></article>)}</section>}
    {upcomingBookings.length > 0 && <section className="premium-upcoming"><div className="section-title"><h2>Vos rendez-vous</h2></div>{upcomingBookings.map((booking) => <button key={booking.id} onClick={onAccount}><span>▣</span><div><strong>{new Date(booking.starts_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</strong><small>{booking.status}</small></div><b>›</b></button>)}</section>}
    <div className="mobile-date-helper"><label>Quand souhaitez-vous réserver ?<input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
  </div>;
}

function ResultsScreen({
  category, subcategory, setSubcategory, area, providers, catalogState, nextAvailability, favorites, filtersOpen, setFiltersOpen,
  homeOnly, setHomeOnly, verifiedOnly, setVerifiedOnly, minRating, setMinRating, maxPrice, setMaxPrice,
  onBack, onViewProvider, onBook, onFavorite, onProviderRegister,
}: {
  category: string; subcategory: string; setSubcategory: (value: string) => void; area: string; providers: Provider[];
  catalogState: "loading" | "live" | "empty" | "error"; nextAvailability: Record<string, string>; favorites: string[]; filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void; homeOnly: boolean; setHomeOnly: (value: boolean) => void;
  verifiedOnly: boolean; setVerifiedOnly: (value: boolean) => void; minRating: string; setMinRating: (value: string) => void;
  maxPrice: string; setMaxPrice: (value: string) => void; onBack: () => void;
  onViewProvider: (provider: Provider) => void; onBook: (provider: Provider) => void; onFavorite: (provider: Provider) => void; onProviderRegister: () => void;
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
    <CatalogBlock providers={providers} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister} />
  </div>;
}

function CatalogBlock({ providers, fallbackProviders = [], catalogState, favorites, nextAvailability, onView, onBook, onFavorite, onProviderRegister }: { providers: Provider[]; fallbackProviders?: Provider[]; catalogState: "loading" | "live" | "empty" | "error"; favorites: string[]; nextAvailability: Record<string, string>; onView: (provider: Provider) => void; onBook: (provider: Provider) => void; onFavorite: (provider: Provider) => void; onProviderRegister: () => void }) {
  if (catalogState === "loading") return <div className="mobile-skeletons" aria-label="Chargement"><i /><i /><i /></div>;
  if (catalogState === "empty" || catalogState === "error") return <div className="premium-empty"><span>✦</span><h3>{catalogState === "error" ? "Catalogue indisponible" : "Les premiers talents arrivent"}</h3><p>{catalogState === "error" ? "Vérifiez votre connexion puis réessayez." : "Aucun professionnel approuvé n’est encore publié dans cette zone."}</p><button onClick={onProviderRegister}>Devenir prestataire</button></div>;
  const displayedProviders = providers.length ? providers : fallbackProviders;
  if (!displayedProviders.length) return <div className="premium-empty compact"><span>⌕</span><h3>Aucun résultat</h3><p>Essayez une autre catégorie ou élargissez vos filtres.</p></div>;
  return <div className="premium-provider-list">{displayedProviders.map((provider) => <ProviderCard key={provider.id} provider={provider} nextSlot={nextAvailability[provider.id]} favorite={favorites.includes(provider.id)} onFavorite={() => onFavorite(provider)} onView={() => onView(provider)} onBook={() => onBook(provider)} />)}</div>;
}

function ProviderCard({ provider, nextSlot, favorite, onFavorite, onView, onBook }: { provider: Provider; nextSlot?: string; favorite: boolean; onFavorite: () => void; onView: () => void; onBook: () => void }) {
  return <article className="premium-provider-card" onClick={onView} onKeyDown={(event) => { if (event.key === "Enter") onView(); }} role="button" tabIndex={0}>
    <div className="premium-provider-photo">{provider.coverUrl ? <Image src={provider.coverUrl} alt={`Espace de ${provider.name}`} fill sizes="120px" /> : <span>{provider.initials}</span>}</div>
    <div><div className="provider-name-row"><h3>{provider.name}</h3><button aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={(event) => { event.stopPropagation(); onFavorite(); }}>{favorite ? "♥" : "♡"}</button></div>{provider.verified && <span className="gold-verified">✦ Vérifié</span>}<p>★ {provider.rating.toFixed(1)} ({provider.reviews} avis) · {provider.area}</p>{nextSlot && <p className="next-slot-badge">● {formatSlotLabel(nextSlot)}</p>}<div className="provider-booking-line"><span><strong>{formatPrice(provider.price)}</strong><small>{formatDuration(provider.durationMinutes)}</small></span><button onClick={(event) => { event.stopPropagation(); onBook(); }}>Voir les créneaux</button></div></div>
  </article>;
}

function ProviderProfileScreen({ provider, favorite, onBack, onFavorite, onBook }: { provider: Provider; favorite: boolean; onBack: () => void; onFavorite: () => void; onBook: (service: ProviderService) => void }) {
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
      {tab === "services" && services.map((service) => <button className="profile-service-row" key={service.id} onClick={() => onBook(service)}><span><strong>{service.title}</strong><small><em>{formatPrice(service.price_amount)}</em> · {formatDuration(service.duration_minutes)}</small></span><span>Choisir <b>›</b></span></button>)}
      {tab === "reviews" && <div className="profile-empty-tab"><strong>{provider.rating.toFixed(1)} / 5</strong><p>{provider.reviews ? `${provider.reviews} avis vérifiés sont associés à ce profil.` : "Aucun avis publié pour le moment."}</p></div>}
      {tab === "about" && <div className="profile-empty-tab"><strong>Informations pratiques</strong><p>{detail.bio || `Prestations disponibles à ${provider.area}. Les coordonnées complètes sont communiquées pendant la réservation.`}</p></div>}
    </section>
    <div className="profile-book-bar"><button onClick={() => onBook(services[0])}>Voir les disponibilités</button></div>
  </div></div></main>;
}

function BookingModal({ selection, initialDate, initialRequest, authenticated, onClose, onSubmit }: { selection: BookingSelection; initialDate: string; initialRequest: BookingRequest | null; authenticated: boolean; onClose: () => void; onSubmit: (request: BookingRequest) => Promise<BookingConfirmation | null> }) {
  const { provider, service } = selection;
  const [step, setStep] = useState(initialRequest?.time ? 2 : 1);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [waitingForAuthentication, setWaitingForAuthentication] = useState(false);
  const [form, setForm] = useState<BookingRequest>(initialRequest ?? { date: initialDate || defaultBookingDate, time: "", locationMode: "salon", address: "", note: "", paymentMethod: "on_site" });

  useEffect(() => {
    window.sessionStorage.setItem(bookingDraftKey, JSON.stringify({ selection, request: form }));
  }, [form, selection]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      void Promise.resolve().then(() => setAvailabilityLoading(false));
      return;
    }
    let active = true;
    void Promise.resolve().then(() => { if (active) setAvailabilityLoading(true); });
    void supabase.rpc("get_available_slots", {
      target_provider_id: provider.profileId,
      target_provider_service_id: service.id,
      from_date: form.date,
      days: 1,
    }).then(({ data, error }) => {
      if (!active) return;
      setSlots(error ? [] : ((data ?? []) as AvailabilitySlot[]).map((slot) => new Date(slot.slot_start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" })));
      setAvailabilityLoading(false);
    });
    return () => { active = false; };
  }, [form.date, provider.profileId, service.id]);

  const quickDates = useMemo(() => buildQuickDates(), []);
  async function confirm() {
    setSubmitting(true);
    const result = await onSubmit(form);
    setSubmitting(false);
    if (result) setConfirmation(result);
    else if (!authenticated) setWaitingForAuthentication(true);
  }
  useEffect(() => {
    if (!authenticated || !waitingForAuthentication) return;
    void Promise.resolve().then(async () => {
      setWaitingForAuthentication(false);
      setSubmitting(true);
      const result = await onSubmit(form);
      if (result) setConfirmation(result);
      setSubmitting(false);
    });
  }, [authenticated, form, onSubmit, waitingForAuthentication]);
  const canConfirm = Boolean(form.time) && (form.locationMode === "salon" || Boolean(form.address.trim()));
  return <div className="modal-backdrop premium-booking-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal premium-booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <header className="booking-screen-header"><button aria-label="Fermer" onClick={onClose}>‹</button><div><h2 id="booking-title">Réserver</h2><p>{provider.name} · réservation rapide</p></div></header>
      {confirmation ? <BookingSuccess provider={provider} confirmation={confirmation} onClose={onClose} /> : <>
        <div className="fast-booking-progress" aria-label={`Étape ${step} sur 2`}><span className={step >= 1 ? "active" : ""}>1 <small>Créneau</small></span><i /><span className={step >= 2 ? "active" : ""}>2 <small>Confirmation</small></span></div>
        <div className="premium-booking-content">
          {step === 1 && <><div className="fast-service-summary"><span>{provider.coverUrl ? <Image src={provider.coverUrl} alt="" fill sizes="54px" /> : provider.initials}</span><div><strong>{service.title}</strong><small>{provider.name} · {formatDuration(service.duration_minutes)}</small></div><b>{formatPrice(service.price_amount)}</b></div><h3>Quand êtes-vous disponible ?</h3><div className="quick-date-strip">{quickDates.map((item) => <button key={item.date} className={form.date === item.date ? "active" : ""} onClick={() => setForm({ ...form, date: item.date, time: "" })}><small>{item.weekday}</small><strong>{item.day}</strong><span>{item.month}</span></button>)}<label><small>Autre</small><strong>＋</strong><input aria-label="Choisir une autre date" type="date" min={today} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, time: "" })} /></label></div><div className="slot-section-title"><strong>Créneaux disponibles</strong><small>Mis à jour en direct</small></div>{availabilityLoading ? <div className="slot-loading">Recherche des meilleurs créneaux…</div> : slots.length ? <div className="premium-slot-grid">{slots.map((time) => <button className={form.time === time ? "active" : ""} key={time} onClick={() => { setForm({ ...form, time }); setStep(2); }}>{time}</button>)}</div> : <div className="no-slots">Aucun créneau publié ce jour. Essayez une autre date.</div>}</>}
          {step === 2 && <><h3>Vérifiez et confirmez</h3><div className="booking-recap-card"><div className="recap-photo">{provider.coverUrl ? <Image src={provider.coverUrl} alt="" fill sizes="70px" /> : provider.initials}</div><div><strong>{service.title}</strong><small>{formatBookingDate(form.date)} à {form.time} · {formatDuration(service.duration_minutes)}</small><small>{provider.name}</small></div><b>{formatPrice(service.price_amount)}</b></div><fieldset className="location-choice"><legend>Où ?</legend><label><input type="radio" name="location" checked={form.locationMode === "salon"} onChange={() => setForm({ ...form, locationMode: "salon" })} /><span><strong>Chez le professionnel</strong><small>{provider.area}</small></span></label>{provider.homeService && <label><input type="radio" name="location" checked={form.locationMode === "client_address"} onChange={() => setForm({ ...form, locationMode: "client_address" })} /><span><strong>À mon domicile</strong><small>Le professionnel se déplace</small></span></label>}</fieldset>{form.locationMode === "client_address" && <label>Adresse<textarea autoFocus value={form.address} placeholder="Votre adresse complète" onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>}<fieldset className="location-choice"><legend>Paiement</legend><label><input type="radio" name="payment" checked={form.paymentMethod === "on_site"} onChange={() => setForm({ ...form, paymentMethod: "on_site" })} /><span><strong>Sur place</strong><small>Aucun débit aujourd’hui</small></span></label><label><input type="radio" name="payment" disabled /><span><strong>Wave, Orange Money ou carte</strong><small>Ouverture après validation de la sandbox</small></span></label></fieldset><details className="booking-options"><summary>Ajouter une note (facultatif)</summary><label>Note<textarea maxLength={1000} value={form.note} placeholder="Précision utile pour le professionnel" onChange={(event) => setForm({ ...form, note: event.target.value })} /></label></details><div className="payment-note">Paiement sur place · aucun débit aujourd’hui.</div></>}
        </div>
        {step === 2 && <div className="premium-booking-nav"><button className="back-button" onClick={() => setStep(1)}>Modifier</button><button disabled={submitting || !canConfirm} onClick={() => void confirm()}>{submitting ? "Enregistrement…" : "Confirmer · " + formatPrice(service.price_amount)}</button></div>}
      </>}
    </section>
  </div>;
}

function BookingSuccess({ provider, confirmation, onClose }: { provider: Provider; confirmation: BookingConfirmation; onClose: () => void }) {
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${provider.specialty} · ${provider.name}`)}&dates=${confirmation.date.replaceAll("-", "")}T${confirmation.time.replace(":", "")}00/${confirmation.date.replaceAll("-", "")}T${confirmation.time.replace(":", "")}00`;
  return <div className="premium-booking-success"><span>✓</span><p>Demande enregistrée</p><h2>Votre rendez-vous est créé</h2><code>{confirmation.id}</code><dl><div><dt>Prestation</dt><dd>{provider.specialty}</dd></div><div><dt>Date</dt><dd>{confirmation.date} à {confirmation.time}</dd></div><div><dt>Adresse</dt><dd>{confirmation.location}</dd></div><div><dt>Statut</dt><dd>En attente</dd></div></dl><a href={calendarUrl} target="_blank" rel="noreferrer">Ajouter au calendrier</a><button onClick={onClose}>Terminer</button></div>;
}

function BottomNav({ active, onFeed, onDiscover, onPublish, onAccount }: { active: "feed" | "discover"; onFeed: () => void; onDiscover: () => void; onPublish: () => void; onAccount: (section?: "client" | "provider" | "admin") => void }) {
  return <nav className="premium-bottom-nav" aria-label="Navigation de l’application"><button className={active === "feed" ? "active" : ""} onClick={onFeed}><i>⌂</i>Accueil</button><button className={active === "discover" ? "active" : ""} onClick={onDiscover}><i>⌕</i>Découvrir</button><button className="publish-nav" onClick={onPublish}><i>＋</i>Publier</button><button onClick={() => onAccount()}><i>□</i>Réservations</button><button onClick={() => onAccount()}><i>○</i>Profil</button></nav>;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining}` : `${hours} h`;
}

function defaultService(provider: Provider): ProviderService {
  return { id: provider.serviceId, title: provider.specialty, duration_minutes: provider.durationMinutes, price_amount: provider.price };
}

function buildQuickDates() {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      weekday: index === 0 ? "Aujourd’hui" : date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""),
      day: date.getDate(),
      month: date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
    };
  });
}

function formatBookingDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function isToday(slot?: string) {
  if (!slot) return false;
  return new Date(slot).toLocaleDateString("fr-CA", { timeZone: "Africa/Dakar" }) === new Date().toLocaleDateString("fr-CA", { timeZone: "Africa/Dakar" });
}

function formatSlotLabel(slot: string) {
  const date = new Date(slot);
  const prefix = isToday(slot) ? "Aujourd’hui" : date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Dakar" });
  return `${prefix} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" })}`;
}
