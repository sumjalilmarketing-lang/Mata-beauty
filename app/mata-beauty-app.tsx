"use client";
import { nextBookingDate } from "@/lib/domain/next-booking-slot";
import { UnreadBadge } from "./unread-inbox";
import { bookingTeamPeople, selectedTeamSlots, type BookingTeamPerson, type BookingTeamSlot } from "@/lib/domain/booking-team";

import Image from "next/image";
import { serviceDepositQuote } from "@/lib/domain/service-deposit";
import { formatServiceMoney } from "@/lib/domain/service-money";
import { bookingText } from "@/lib/domain/booking-copy";
import { BookingSlotConflict, bookingSubmissionError } from "@/lib/domain/booking-submission";
import { useApplicationLocale } from "./use-application-locale";
import { type ReactNode, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { AuthModal, type AuthenticatedProfile } from "./auth-modal";
import { LiveDashboard } from "./live-dashboard";
import { SocialFeed } from "./social-feed";
import { LocationPicker } from "./location-picker";
import { distanceKm, matchesSearch, type Coordinates } from "@/lib/domain/location";
import { calculateBookingEnd, calculateBookingQuote, type BookingCurrency } from "@/lib/domain/booking";
import { isTrustedSandboxCheckoutUrl, type PaymentMethod } from "@/lib/domain/payments";
import { fetchActiveCategories, fetchActivePromotions, fetchPublishedProviders, type CatalogCategory, type CatalogPromotion } from "@/lib/supabase/catalog";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadAuthenticatedProfile } from "@/lib/auth/profile";
import { intendedRoleForDestination, safeOAuthDestination } from "@/lib/auth/redirect";
import { recordProductEvent } from "@/lib/analytics/product-events";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { legalDocuments } from "@/lib/legal-documents";
import Link from "next/link";
import { ServiceImage } from "./service-image";
import { CategoryCarousel } from "./category-carousel";
import { categoryMediaSequence, type CategoryMedia } from "@/lib/catalog/category-media";
import { addCalendarDays, formatWallDate, localDateAt, localWallTimeToInstants } from "@/lib/domain/time-zone";

type Provider = {
  id: string;
  profileId: string;
  serviceId: string;
  depositPercentage?: number;
  categoryId?: string;
  name: string;
  specialty: string;
  category: string;
  area: string;
  address?: string;
  coordinates?: Coordinates;
  price: number;
  rating: number;
  reviews: number;
  initials: string;
  verified: boolean;
  homeService: boolean;
  durationMinutes: number;
  businessId?: string;
  businessSlug?: string;
  countryCode?: string;
  timeZone?: string;
  currency?: BookingCurrency;
  coverUrl?: string;
  serviceMedia?: CategoryMedia;
};

function providerTimeZone(provider: Pick<Provider, "timeZone" | "countryCode">): string {
  return provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC");
}

type BookingRequest = {
  date: string;
  time: string;
  slotStart?: string;
  locationMode: "salon" | "client_address";
  address: string;
  note: string;
  collaboratorId: string;
  paymentMethod: "on_site" | "wave" | "orange_money" | "card";
};

type PaymentCapabilities = {
  onlineCheckoutEnabled: boolean;
  environment: "disabled" | "sandbox";
  provider: "none" | "paydunya";
  methods: PaymentMethod[];
};

type BookingConfirmation = { id: string; startsAt: string; date: string; time: string; location: string; collaboratorName?: string | null; collaboratorPhoto?: string | null };
type ProviderService = { deposit_percentage?: number; id: string; title: string; duration_minutes: number; price_amount: number; currency?: BookingCurrency; business_id?: string | null };
type ProviderDetail = { bio: string | null; services: ProviderService[]; portfolio: string[] };
type BookingSelection = { provider: Provider; service: ProviderService; sourcePostId?: string };
type AvailabilitySlot = { slot_start: string };
type BookableCollaborator = BookingTeamSlot;

const bookingDraftKey = "mata-booking-draft";
const bookingDraftSchema = z.object({
  selection: z.object({
    provider: z.object({
      id: z.string().min(1), profileId: z.string().min(1), serviceId: z.string().min(1), name: z.string(), specialty: z.string(),
      category: z.string(), area: z.string(), address: z.string().optional(), coordinates: z.object({ latitude: z.number(), longitude: z.number() }).optional(), price: z.number().int().nonnegative(), rating: z.number(), reviews: z.number().int().nonnegative(),
      initials: z.string(), verified: z.boolean(), homeService: z.boolean(), currency: z.enum(["XOF", "EUR", "USD", "GBP", "CAD"]).optional(), durationMinutes: z.number().int(), depositPercentage: z.number().int().min(0).max(60).optional(), businessId: z.string().uuid().optional(), countryCode: z.string().length(2).optional(), timeZone: z.string().optional(), coverUrl: z.string().optional(),
    }),
    service: z.object({ deposit_percentage: z.number().int().min(0).max(60).optional(), id: z.string().min(1), title: z.string(), duration_minutes: z.number().int(), price_amount: z.number().int().nonnegative(), currency: z.enum(["XOF", "EUR", "USD", "GBP", "CAD"]).optional(), business_id: z.string().uuid().nullable().optional() }),
    sourcePostId: z.string().uuid().optional(),
  }),
  request: z.object({
    date: z.string(), time: z.string(), locationMode: z.enum(["salon", "client_address"]), address: z.string(), note: z.string(), collaboratorId: z.string().default(""),
    slotStart: z.string().datetime({ offset: true }).optional(), paymentMethod: z.enum(["on_site", "wave", "orange_money", "card"]),
  }),
});
const paymentCapabilitiesSchema = z.object({
  onlineCheckoutEnabled: z.boolean(),
  environment: z.enum(["disabled", "sandbox"]),
  provider: z.enum(["none", "paydunya"]),
  methods: z.array(z.enum(["orange_money", "wave", "card"])),
});
const paymentCheckoutSchema = z.object({
  ok: z.literal(true),
  checkoutUrl: z.string().nullable(),
  payment: z.object({ id: z.string().uuid() }).passthrough(),
});
const paymentStatusSchema = z.object({
  ok: z.literal(true),
  payment: z.object({ payment_status: z.string() }),
});

function readBookingDraft() {
  if (typeof window === "undefined") return null;
  try { return bookingDraftSchema.safeParse(JSON.parse(window.sessionStorage.getItem(bookingDraftKey) ?? "null")).data ?? null; }
  catch { return null; }
}

const formatPrice = (value: number, currency = "XOF", locale = "fr-FR") => formatServiceMoney(value, currency, locale);
const today = new Date().toISOString().slice(0, 10);

export function MataBeautyApp({ supabaseUrl, supabaseAnonKey, initialScreen = "feed", initialServiceId }: { supabaseUrl: string; supabaseAnonKey: string; initialScreen?: "feed" | "home" | "results"; initialServiceId?: string }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const oauthReturn = useRef({ intent: null as string | null, authenticated: false });
  const [showSplash, setShowSplash] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [subcategory, setSubcategory] = useState("Tout");
  const [area, setArea] = useState("");
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [date, setDate] = useState("");
  const [screen, applyScreen] = useState<"feed" | "home" | "results">(initialScreen);
  const [catalog, setCatalog] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "live" | "empty" | "error">("loading");
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [nextAvailability, setNextAvailability] = useState<Record<string, string>>({});
  const [upcomingBookings, setUpcomingBookings] = useState<Array<{ id: string; starts_at: string; status: string }>>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [booking, setBooking] = useState<BookingSelection | null>(null);
  const [pendingSocialBooking, setPendingSocialBooking] = useState<{ authorId: string; service: ProviderService; sourcePostId: string } | null>(null);
  const [restoredBookingRequest, setRestoredBookingRequest] = useState<BookingRequest | null>(null);
  const [profile, setProfile] = useState<Provider | null>(null);
  const [view, setView] = useState<"home" | "client" | "provider" | "admin">("home");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [homeOnly, setHomeOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRating, setMinRating] = useState("0");
  const [maxPrice, setMaxPrice] = useState("50000");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (notice !== "Connectez-vous pour accéder à cet espace.") return;
    const timer = window.setTimeout(() => setNotice(current => current === notice ? "" : current), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [authenticated, setAuthenticated] = useState<AuthenticatedProfile | null>(null);
  const [authPending, setAuthPending] = useState(true);
  const [authRequest, setAuthRequest] = useState<{ role: "client" | "provider" | "admin"; mode: "login" | "register" | "reset"; returnTo?: string } | null>(null);
  const [paymentReturn, setPaymentReturn] = useState<{ id: string; mode: "return" | "cancelled" } | null>(null);
  const [showLaunchWelcome, setShowLaunchWelcome] = useState(false);

  useEffect(() => {
    const target = initialServiceId ?? new URLSearchParams(window.location.search).get("service");
    if (!target) return;
    const parsed = z.string().uuid().safeParse(target);
    if (!parsed.success) return;
    // Restore the user's in-progress booking immediately after OAuth/reload.
    // The catalog may take longer to hydrate (especially on mobile networks);
    // the server still validates that the service is active when booking.
    const draft = readBookingDraft();
    const restoredSelection = draft?.selection.service.id === parsed.data ? draft.selection : null;
    let active = true;
    if (draft && restoredSelection) {
      queueMicrotask(() => {
        if (!active) return;
        setRestoredBookingRequest(draft.request);
        setBooking(restoredSelection);
      });
    }
    if (catalogState !== "live") return () => { active = false; };
    const client = getSupabaseBrowserClient(); if (!client) return () => { active = false; };
    void client.from("provider_services").select("id,provider_id,title,duration_minutes,price_amount,currency,business_id,deposit_percentage").eq("id", parsed.data).eq("is_active", true).is("archived_at", null).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      const provider = catalog.find(item => item.profileId === data?.provider_id && item.serviceId === data?.id);
      if (error || !data || !provider) {
        if (!restoredSelection) setNotice("Cette prestation n’est pas disponible à la réservation.");
        return;
      }
      setRestoredBookingRequest(draft && draft.selection.service.id === data.id ? draft.request : null);
      setBooking({ provider, service: data });
    });
    return () => { active = false; };
  }, [catalog, catalogState, initialServiceId]);

  function setScreen(next: "feed" | "home" | "results", nextCategory = category) {
    const url = new URL(window.location.href);
    // Discovery now lives inside Inspiration. Keep old callers working while
    // expressing their search in the feed URL instead of opening Explorer.
    applyScreen("feed");
    url.pathname = "/";
    url.search = "";
    if (next === "results") {
      url.searchParams.set("search", "1");
      url.searchParams.set("applied", "1");
      if (query) url.searchParams.set("q", query);
      if (area) url.searchParams.set("zone", area);
      if (nextCategory !== "Toutes") {
        const categoryId = categories.find((item) => item.name === nextCategory)?.id;
        if (categoryId) url.searchParams.set("categoryId", categoryId);
        else url.searchParams.set("category", nextCategory);
      }
    }
    if (`${url.pathname}${url.search}` !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const legacyResults = params.get("screen") === "results";
      applyScreen("feed");
      if (legacyResults) {
        params.delete("screen");
        params.set("search", "1");
        params.set("applied", "1");
        window.history.replaceState(window.history.state, "", `/${params.toString() ? `?${params.toString()}` : ""}`);
      }
      setQuery(params.get("q") ?? "");
      setCategory(params.get("category") ?? "Toutes");
      try { setArea((params.get("zone") ?? window.sessionStorage.getItem("mata-location-zone") ?? "").slice(0, 120)); } catch { setArea(params.get("zone") ?? ""); }
      setProfile(null);
    };
    // Apply the URL state before the user can interact. Deferring this update
    // to a microtask can overwrite an immediate navigation click after hydrate.
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const savedTheme = readBrowserStorage("localStorage", "mata-theme");
    const preferredTheme = "dark";
    void Promise.resolve().then(() => setTheme(savedTheme === "dark" || savedTheme === "light" ? savedTheme : preferredTheme));
    const splashTimer = window.setTimeout(() => setShowSplash(false), 1350);
    const draft = readBookingDraft();
    const parameters = new URLSearchParams(window.location.search);
    oauthReturn.current = { intent: parameters.get("intent"), authenticated: parameters.get("auth") === "google" };
    const authError = parameters.get("auth_error");
    const returnTo = safeOAuthDestination(parameters.get("returnTo"));
    const returnedPaymentId = z.string().uuid().safeParse(parameters.get("paymentId"));
    const paymentMode = parameters.get("payment");
    void Promise.resolve().then(() => {
      if (draft && !parameters.has("service")) {
        setBooking(draft.selection);
        setProfile(draft.selection.provider);
        setRestoredBookingRequest(draft.request);
      }
      if (parameters.get("connexion") === "requise") {
        setAuthRequest({ role: intendedRoleForDestination(returnTo), mode: "login", returnTo });
        setNotice("Connectez-vous pour accéder à cet espace.");
      } else if (parameters.get("auth") === "reset") {
        setAuthRequest({ role: "client", mode: "reset", returnTo: "/app" });
      } else if (parameters.get("acces") === "refuse") {
        setNotice("Votre compte ne possède pas l’autorisation requise pour cet espace.");
      }
      if (authError) {
        const messages: Record<string, string> = {
          email_link_invalid: "Le lien de confirmation est expiré, déjà utilisé ou invalide. Connectez-vous si votre adresse est déjà confirmée, ou choisissez « Renvoyer la confirmation » pour terminer votre inscription.",
          workspace_unavailable: "Votre espace est momentanément indisponible. Réessayez dans quelques instants.",
          email_confirmation_unavailable: "La confirmation est momentanément indisponible. Réessayez votre lien dans quelques instants.",
          google_cancelled: "Connexion Google annulée.", google_provider_error: "Google n’a pas pu autoriser la connexion.",
          invalid_callback: "Retour Google invalide.", oauth_exchange_failed: "La session Google a expiré. Recommencez.",
          profile_creation_failed: "Le profil Mata Beauty n’a pas pu être créé.", professional_request_failed: "La demande professionnelle n’a pas pu être préparée.",
          account_suspended: "Ce compte est suspendu.", oauth_unavailable: "La connexion Google est momentanément indisponible.",
        };
        setNotice(messages[authError] ?? "La connexion Google a échoué.");
      } else if (parameters.get("auth") === "google") {
        setNotice(parameters.get("profile") === "incomplete" ? "Connexion Google réussie. Complétez maintenant votre profil." : "Connexion Google réussie.");
      } else if (returnedPaymentId.success && paymentMode === "cancelled") {
        setPaymentReturn({ id: returnedPaymentId.data, mode: "cancelled" });
        setNotice("Paiement sandbox annulé. Aucun débit n’est confirmé et la réservation reste en attente.");
      } else if (returnedPaymentId.success && paymentMode === "return") {
        setPaymentReturn({ id: returnedPaymentId.data, mode: "return" });
        setNotice("Vérification du paiement sandbox en cours…");
      }
    });
    if (authError || parameters.has("auth") || parameters.has("payment")) window.history.replaceState(null, "", window.location.pathname);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (!authenticated || paymentReturn?.mode !== "return") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/payments/status?paymentId=${encodeURIComponent(paymentReturn.id)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const parsed = paymentStatusSchema.safeParse(await response.json().catch(() => null));
      if (!active) return;
      if (!response.ok || !parsed.success) setNotice("Le statut du paiement ne peut pas encore être vérifié. Consultez Mes paiements.");
      else if (parsed.data.payment.payment_status === "paid") setNotice("Paiement confirmé. Votre rendez-vous est confirmé.");
      else if (["failed", "cancelled"].includes(parsed.data.payment.payment_status)) setNotice("Paiement non confirmé. Aucun débit validé.");
      else setNotice("Paiement reçu par la sandbox et en attente de confirmation du webhook.");
    }).catch(() => { if (active) setNotice("Le statut du paiement ne peut pas encore être vérifié. Consultez Mes paiements."); });
    return () => { active = false; };
  }, [authenticated, paymentReturn]);

  useEffect(() => {
    if (profile) window.scrollTo(0, 0);
  }, [profile]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      writeBrowserStorage("localStorage", "mata-theme", next);
      return next;
    });
  }

  const suggestions = useMemo(
    () => [...new Set([...categories.map((item) => item.name), ...catalog.flatMap((provider) => [provider.name, provider.specialty, provider.area])])],
    [catalog, categories],
  );

  const filteredProviders = useMemo(() => {
    const normalized = `${query.replace(/près de moi/gi, "")} ${subcategory === "Tout" ? "" : subcategory}`.trim().toLocaleLowerCase("fr");
    return catalog.filter((provider) => {
      const haystack = `${provider.name} ${provider.specialty} ${provider.category} ${provider.area}`.toLocaleLowerCase("fr");
      const distance = position ? distanceKm(position, provider.coordinates) : null;
      return matchesSearch(normalized, haystack)
        && (category === "Toutes" || haystack.includes(category.toLocaleLowerCase("fr")))
        && (!area.trim() || matchesSearch(area, `${provider.area} ${provider.address ?? ""}`))
        && (!position || (distance !== null && distance <= 25))
        && (!homeOnly || provider.homeService)
        && (!verifiedOnly || provider.verified)
        && provider.rating >= Number(minRating)
        && provider.price <= Number(maxPrice);
    }).sort((a, b) => position ? (distanceKm(position, a.coordinates) ?? Infinity) - (distanceKm(position, b.coordinates) ?? Infinity) : 0);
  }, [area, catalog, category, homeOnly, maxPrice, minRating, position, query, subcategory, verifiedOnly]);

  const changeLocation = useCallback((nextArea: string, nextPosition: Coordinates | null) => {
    setArea(nextArea); setPosition(nextPosition);
    // Keep the manual zone for this tab only. Never persist personal GPS coordinates.
    try { window.sessionStorage.setItem("mata-location-zone", nextArea.slice(0, 120)); } catch { /* Location remains usable without storage. */ }
  }, []);
  const feedLocation = useMemo(() => ({ area, position, providers: catalog, onChange: changeLocation }), [area, position, catalog, changeLocation]);
  const locationPicker = <LocationPicker area={area} position={position} suggestions={[...new Set(catalog.flatMap((provider) => provider.area.split(",").map((part) => part.trim())).filter(Boolean))]} onChange={changeLocation} />;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      void Promise.resolve().then(() => { setCatalogState("error"); setAuthPending(false); });
      return;
    }
    let active = true;
    let catalogRequest = new AbortController();
    const cancelCatalog = () => catalogRequest.abort();
    window.addEventListener("beforeunload", cancelCatalog);
    window.addEventListener("pagehide", cancelCatalog);
    const loadCatalog = () => {
      const signal = catalogRequest.signal;
      void fetchPublishedProviders(supabase, undefined, signal).then((items) => {
      if (!active || signal.aborted) return;
      const providers: Provider[] = items.map((item) => ({
        ...item,
        initials: item.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      }));
      setCatalog(providers);
      setCatalogState(providers.length ? "live" : "empty");
    }).catch(() => { if (active && !signal.aborted) setCatalogState("error"); }); };
    const resumeCatalog = () => {
      if (!catalogRequest.signal.aborted) return;
      catalogRequest = new AbortController();
      loadCatalog();
    };
    window.addEventListener("pageshow", resumeCatalog);
    loadCatalog();
    void fetchActivePromotions(supabase).then((items) => { if (active) setPromotions(items); }).catch(() => {});
    void fetchActiveCategories(supabase).then((items) => { if (active) setCategories(items); }).catch(() => {});
    const oauthIntent = oauthReturn.current.intent;
    const oauthAuthenticated = oauthReturn.current.authenticated;
    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!active || !user) return;
      const signedIn = await loadAuthenticatedProfile(supabase, user.id, AbortSignal.timeout(10_000)).catch(() => null);
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
    }).catch(() => null).finally(() => { if (active) setAuthPending(false); });
    return () => {
      active = false;
      cancelCatalog();
      window.removeEventListener("beforeunload", cancelCatalog);
      window.removeEventListener("pagehide", cancelCatalog);
      window.removeEventListener("pageshow", resumeCatalog);
    };
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
      removeBrowserStorage("sessionStorage", bookingDraftKey);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !catalog.length || screen === "feed") return;
    let active = true;
    void Promise.all(catalog.slice(0, 12).map(async (provider) => {
      const { data } = await supabase.rpc("get_available_slots", {
        target_provider_id: provider.profileId,
        target_provider_service_id: provider.serviceId,
        from_date: localDateAt(new Date(), provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC")),
        days: 7,
      }).limit(1);
      return [provider.id, ((data ?? []) as AvailabilitySlot[])[0]?.slot_start ?? ""] as const;
    })).then((entries) => {
      if (active) setNextAvailability(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [catalog, screen]);

  useEffect(() => {
    if (!pendingSocialBooking) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      let provider = catalog.find((item) => item.profileId === pendingSocialBooking.authorId && item.serviceId === pendingSocialBooking.service.id);
      if (!provider) {
        const client = getSupabaseBrowserClient();
        if (client) {
          try {
            const entries = await fetchPublishedProviders(client, pendingSocialBooking.authorId);
            const item = entries.find((entry) => entry.serviceId === pendingSocialBooking.service.id);
            if (item) provider = { ...item, initials: item.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() };
          } catch {
            if (active) { setNotice("La prestation n’a pas pu être chargée. Réessayez."); setPendingSocialBooking(null); }
            return;
          }
        }
      }
      if (!active) return;
      if (provider) {
        setNotice("");
        setRestoredBookingRequest(null);
        setBooking({ provider, service: { ...pendingSocialBooking.service, currency: pendingSocialBooking.service.currency ?? provider.currency ?? "XOF", deposit_percentage: provider.depositPercentage ?? 0 }, sourcePostId: pendingSocialBooking.sourcePostId });
        setPendingSocialBooking(null);
      } else {
        setNotice("Cette prestation n’est pas disponible actuellement.");
        setPendingSocialBooking(null);
      }
    });
    return () => { active = false; };
  }, [catalog, pendingSocialBooking]);

  function openAccount(section: "client" | "provider" | "admin" = "client") {
    if (authenticated?.roles.includes(section)) window.location.assign(section === "provider" ? "/pro" : section === "admin" ? "/admin" : "/app");
    else setAuthRequest({ role: section, mode: "login" });
  }

  function openClientPage(page: "bookings" | "messages" | "profile") {
    const returnTo = `/app/${page}`;
    if (authenticated?.roles.includes("client")) window.location.assign(returnTo);
    else setAuthRequest({ role: "client", mode: "login", returnTo });
  }

  function startBooking(selection: BookingSelection) {
    setRestoredBookingRequest(null);
    const matchingProvider = catalog.find((item) => item.serviceId === selection.service.id && item.profileId === selection.provider.profileId);
    setBooking({ ...selection, service: { ...selection.service, currency: selection.service.currency ?? matchingProvider?.currency ?? selection.provider.currency ?? "XOF", deposit_percentage: matchingProvider?.depositPercentage ?? selection.service.deposit_percentage ?? 0 }, provider: matchingProvider ?? { ...selection.provider, address: undefined, coordinates: undefined, businessId: selection.service.business_id ?? undefined } });
    const client = getSupabaseBrowserClient();
    if (client) void recordProductEvent(client, "booking_started", { provider_id: selection.provider.profileId, service_id: selection.service.id, source: selection.sourcePostId ? "video" : "catalog" });
  }

  function closeBooking() {
    removeBrowserStorage("sessionStorage", bookingDraftKey);
    setRestoredBookingRequest(null);
    setBooking(null);
  }

  function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setScreen("results");
    const client = getSupabaseBrowserClient();
    if (client) void recordProductEvent(client, "search", { query: query.trim().slice(0, 80), area });
  }

  function selectCategory(label: string) {
    setCategory(label);
    setSubcategory("Tout");
    setQuery("");
    setScreen("results", label);
    const client = getSupabaseBrowserClient();
    if (client) void recordProductEvent(client, "category_viewed", { category: label, area });
  }

  function viewProvider(provider: Provider) {
    const client = getSupabaseBrowserClient();
    if (client) void recordProductEvent(client, "provider_viewed", { provider_id: provider.profileId, category: provider.category });
    window.location.assign(provider.businessSlug ? "/salons/" + encodeURIComponent(provider.businessSlug) : "/professional/" + encodeURIComponent(provider.profileId));
  }

  function openSocialProvider(authorId: string) {
    window.location.assign("/professional/" + encodeURIComponent(authorId));
  }

  function bookSocialService(authorId: string, service: ProviderService, sourcePostId: string) {
    const provider = catalog.find((item) => item.profileId === authorId && item.serviceId === service.id);
    if (provider) startBooking({ provider, service, sourcePostId });
    else {
      setPendingSocialBooking({ authorId, service, sourcePostId });
      setNotice("Ouverture des créneaux…");
    }
  }

  async function toggleFavorite(provider: Provider) {
    if (!authenticated?.roles.includes("client")) {
      setAuthRequest({ role: "client", mode: "login" });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const exists = favorites.includes(provider.profileId);
    const request = exists
      ? supabase.from("favorites").delete().eq("client_id", authenticated.userId).eq("provider_id", provider.profileId)
      : supabase.from("favorites").insert({ client_id: authenticated.userId, provider_id: provider.profileId });
    const { error } = await request;
    if (error) {
      setNotice("Le favori n’a pas pu être enregistré.");
      return;
    }
    setFavorites((current) => exists ? current.filter((id) => id !== provider.profileId) : [...current, provider.profileId]);
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
    const timeZone = providerTimeZone(provider);
    const startsAt = request.slotStart ? new Date(request.slotStart) : resolveBookingWallTime(request.date, request.time, timeZone);
    if (!Number.isFinite(startsAt.getTime())) {
      setNotice("Ce créneau n’est plus valide. Choisissez une nouvelle disponibilité.");
      return null;
    }
    const endsAt = calculateBookingEnd(startsAt, service.duration_minutes);
    const quote = calculateBookingQuote(service.price_amount, 0, service.currency ?? "XOF");
    const { data: created, error } = await supabase.from("bookings").insert({
      client_id: authenticated.userId,
      provider_id: provider.profileId,
      provider_service_id: service.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "pending",
      location_mode: request.locationMode,
      appointment_address: request.locationMode === "client_address" ? request.address.trim() : null,
      collaborator_id: request.collaboratorId || null,
      total_amount: quote.totalAmount,
      currency: quote.currency,
      client_note: request.note.trim() || null,
      source_post_id: booking.sourcePostId ?? null,
    }).select("id,starts_at,collaborator_name,collaborator_avatar_url").abortSignal(AbortSignal.timeout(20_000)).single();
    if (error?.code === "23P01") throw new BookingSlotConflict();
    if (error || !created) {
      setNotice("La réservation n’a pas pu être enregistrée.");
      return null;
    }
    void recordProductEvent(supabase, "booking_completed", { booking_id: created.id, provider_id: provider.profileId, source: booking.sourcePostId ? "video" : "catalog" });
    removeBrowserStorage("sessionStorage", bookingDraftKey);
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
        return { id: created.id, startsAt: created.starts_at, collaboratorName: created.collaborator_name, collaboratorPhoto: created.collaborator_avatar_url, ...bookingLocalDateTime(created.starts_at, timeZone), location: request.locationMode === "salon" ? [provider.name, provider.address, provider.area].filter(Boolean).join(" · ") : request.address };
      }
      const checkout = paymentCheckoutSchema.safeParse(await paymentResponse.json().catch(() => null));
      if (!checkout.success || !checkout.data.checkoutUrl || !isTrustedSandboxCheckoutUrl(checkout.data.checkoutUrl)) {
        setNotice("La réservation est enregistrée, mais aucun checkout sandbox fiable n’est disponible. Aucun débit n’a eu lieu.");
        return { id: created.id, startsAt: created.starts_at, collaboratorName: created.collaborator_name, collaboratorPhoto: created.collaborator_avatar_url, ...bookingLocalDateTime(created.starts_at, timeZone), location: request.locationMode === "salon" ? [provider.name, provider.address, provider.area].filter(Boolean).join(" · ") : request.address };
      }
      setNotice("Redirection sécurisée vers PayDunya Sandbox…");
      window.location.assign(checkout.data.checkoutUrl);
      return null;
    }
    return { id: created.id, startsAt: created.starts_at, collaboratorName: created.collaborator_name, collaboratorPhoto: created.collaborator_avatar_url, ...bookingLocalDateTime(created.starts_at, timeZone), location: request.locationMode === "salon" ? [provider.name, provider.address, provider.area].filter(Boolean).join(" · ") : request.address };
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
  }

  function handleAuthenticated(signedIn: AuthenticatedProfile) {
    setNotice("");
    if (!booking) {
      if (authRequest?.role === "provider" && !signedIn.roles.includes("provider")) { window.location.assign("/app/application"); return; }
      const requested = authRequest?.returnTo ? safeOAuthDestination(authRequest.returnTo) : null;
      if (signedIn.role === "admin" && (!requested || ["/", "/app", "/app/profile"].includes(requested))) {
        window.location.assign("/auth/workspace");
        return;
      }
      if (requested && requested !== "/") {
        window.location.assign(requested);
        return;
      }
      const destination = signedIn.roles.includes(authRequest?.role ?? "client") ? (authRequest?.role ?? signedIn.role) : signedIn.role;
      window.location.assign(destination === "provider" ? "/pro" : destination === "admin" ? "/admin" : "/app");
      return;
    }
    setAuthenticated(signedIn);
    setAuthRequest(null);
  }

  if (view !== "home" && authenticated?.roles.includes(view)) {
    return <LiveDashboard role={view} userId={authenticated.userId} displayName="votre espace" onBack={() => setView("home")} onSignOut={signOut} />;
  }

  if (profile) {
    return <><ProviderProfileScreen provider={profile} favorite={favorites.includes(profile.profileId)} onBack={() => setProfile(null)} onFavorite={() => void toggleFavorite(profile)} onBook={(service) => startBooking({ provider: profile, service })} />{booking && <BookingModal selection={booking} initialDate={date} initialRequest={restoredBookingRequest} authenticated={Boolean(authenticated?.roles.includes("client"))} onClose={closeBooking} onSubmit={confirmBooking} />}{authRequest && <AuthModal initialMode={authRequest.mode} intendedRole={authRequest.role === "provider" ? "provider" : "client"} returnTo={authRequest.returnTo} onClose={() => setAuthRequest(null)} onAuthenticated={handleAuthenticated} />}</>;
  }

  return (
    <main className="premium-mobile-app" data-theme={theme}>
      {showSplash && <div className="mata-splash" role="status" aria-label="Ouverture de Mata Beauty"><Image src="/brand/mata-app-icon.webp" alt="" width={172} height={172} priority unoptimized /><strong>MATA</strong><span>BEAUTY</span><i /></div>}
      {notice && <div className={authRequest ? "toast toast-auth" : "toast"} role="status">{notice}</div>}
      <div className="premium-app-frame">
        {screen === "feed" ? <SocialFeed
          categories={categories}
          location={feedLocation}
          authenticated={authenticated}
          authPending={authPending && !authenticated}
          onRequireAuth={() => setAuthRequest({ role: "client", mode: "login" })}
          onPublish={() => openAccount("provider")}
          onOpenProvider={openSocialProvider}
          onBook={bookSocialService}
        /> : screen === "home" ? (
          <HomeScreen
            locationPicker={locationPicker} nearbyProviders={filteredProviders}
            authenticated={authenticated}
            query={query}
            setQuery={setQuery}
            area={area}
            setArea={setArea}
            date={date}
            setDate={setDate}
            suggestions={suggestions}
            categories={categories}
            catalog={catalog}
            catalogState={catalogState}
            nextAvailability={nextAvailability}
            promotions={promotions}
            upcomingBookings={upcomingBookings}
            favorites={favorites}
            onSearch={runSearch}
            onCategory={selectCategory}
            onViewProvider={viewProvider}
            onBook={(provider) => startBooking({ provider, service: defaultService(provider) })}
            onFavorite={(provider) => void toggleFavorite(provider)}
            onAccount={() => openAccount()}
            onProviderRegister={() => setAuthRequest({ role: "provider", mode: "register" })}
            onInspiration={() => setScreen("feed")}
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
            categoryServices={[...new Set(catalog.filter((provider) => category === "Toutes" || provider.category === category).map((provider) => provider.specialty))]}
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
            onViewProvider={viewProvider}
            onBook={(provider) => startBooking({ provider, service: defaultService(provider) })}
            onFavorite={(provider) => void toggleFavorite(provider)}
            onProviderRegister={() => setAuthRequest({ role: "provider", mode: "register" })}
          />
        )}
        <BottomNav authenticated={Boolean(authenticated)} active="inspiration" onFeed={() => setScreen("feed")} onAccount={openClientPage} />
      </div>

      {showLaunchWelcome && <LaunchWelcome area={area} categories={categories} onArea={setArea} onCategory={(value) => { setCategory(value); }} onClose={() => { writeBrowserStorage("localStorage", "mata-launch-welcome", "done"); setShowLaunchWelcome(false); }} />}

      {booking && <BookingModal selection={booking} initialDate={date} initialRequest={restoredBookingRequest} authenticated={Boolean(authenticated?.roles.includes("client"))} onClose={closeBooking} onSubmit={confirmBooking} />}
      {authRequest && <AuthModal initialMode={authRequest.mode} intendedRole={authRequest.role === "provider" ? "provider" : "client"} returnTo={authRequest.returnTo} onClose={() => setAuthRequest(null)} onAuthenticated={handleAuthenticated} />}
    </main>
  );
}

function Brand() {
  return <div className="premium-brand"><Image src="/brand/mata-app-icon.webp" alt="Mata Beauty" width={48} height={48} priority unoptimized /><span><strong>MATA</strong><small>BEAUTY</small></span></div>;
}

function LaunchWelcome({ area, categories, onArea, onCategory, onClose }: { area: string; categories: CatalogCategory[]; onArea: (value: string) => void; onCategory: (value: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<"location" | "preferences">("location");
  return <aside className="launch-welcome" aria-label="Personnaliser Mata Beauty"><div><button className="launch-welcome-close" aria-label="Explorer sans personnaliser" onClick={onClose}>×</button><span>BIENVENUE SUR MATA BEAUTY</span><h2>{step === "location" ? "Où cherchez-vous ?" : "Qu’est-ce qui vous inspire ?"}</h2><p>{step === "location" ? "Une localisation suffit pour afficher les talents et créneaux pertinents." : "Choisissez une catégorie ou explorez tout immédiatement. Le compte viendra au moment de réserver."}</p>{step === "location" ? <><div className="launch-location-options"><button className={area === "Dakar, Sénégal" ? "active" : ""} onClick={() => onArea("Dakar, Sénégal")}>Dakar</button><button className={area === "Tout Dakar" ? "active" : ""} onClick={() => onArea("Tout Dakar")}>Tout Dakar</button></div><button className="launch-next" onClick={() => setStep("preferences")}>Continuer</button></> : <><div className="launch-category-options">{categories.slice(0, 8).map((item) => <button key={item.id} onClick={() => onCategory(item.name)}>{item.name}</button>)}</div><button className="launch-next" onClick={onClose}>Explorer Inspiration</button></>}</div></aside>;
}

function HomeScreen({
  authenticated, query, setQuery, area, locationPicker, nearbyProviders, date, setDate, suggestions, categories, catalog, catalogState, nextAvailability, promotions,
  upcomingBookings, favorites, onSearch, onCategory, onViewProvider, onBook, onFavorite, onAccount, onProviderRegister, onInspiration, theme, onToggleTheme,
}: {
  locationPicker: ReactNode; nearbyProviders: Provider[];
  authenticated: AuthenticatedProfile | null;
  query: string; setQuery: (value: string) => void; area: string; setArea: (value: string) => void;
  date: string; setDate: (value: string) => void; suggestions: string[]; categories: CatalogCategory[]; catalog: Provider[];
  catalogState: "loading" | "live" | "empty" | "error"; nextAvailability: Record<string, string>; promotions: CatalogPromotion[];
  upcomingBookings: Array<{ id: string; starts_at: string; status: string }>; favorites: string[];
  onSearch: (event?: FormEvent) => void; onCategory: (label: string) => void;
  onViewProvider: (provider: Provider) => void; onBook: (provider: Provider) => void; onFavorite: (provider: Provider) => void;
  onAccount: () => void; onProviderRegister: () => void; onInspiration: () => void; theme: "light" | "dark"; onToggleTheme: () => void;
}) {
  const [carouselsPaused, setCarouselsPaused] = useState(false);
  const categoryMedia = useMemo(() => new Map(categories.map(item => [item.id, categoryMediaSequence(item.slug, catalog.flatMap(provider => provider.serviceMedia ? [provider.serviceMedia] : []))])), [categories, catalog]);
  return <div className="mobile-screen home-screen">
    <header className="mobile-topbar"><Brand /><div><button aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"} onClick={onToggleTheme}>{theme === "dark" ? "☀" : "☾"}</button><button className="user-orb" aria-label="Ouvrir mon compte" onClick={onAccount}>{authenticated ? "MB" : "○"}</button></div></header>
    <section className="welcome-copy"><h1>Explorer</h1></section>
    <form className="mobile-search" onSubmit={onSearch}><span>⌕</span><input list="premium-suggestions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Que recherchez-vous ?" /><button type="button" aria-label="Ouvrir les filtres" onClick={() => onSearch()}>⌘</button><datalist id="premium-suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist></form>
    {locationPicker}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query || "salon beauté"} ${area}`)}`} target="_blank" rel="noreferrer">Voir sur Google Maps</a>
    <div className="section-title"><h2>Catégories populaires</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div>
    <div className="category-animation-control"><button aria-pressed={carouselsPaused} onClick={() => setCarouselsPaused(value => !value)}>{carouselsPaused ? "Reprendre le défilement des images" : "Mettre les images en pause"}</button></div>
    <div className="photo-category-grid">{categories.map(item => { const media = categoryMedia.get(item.id) ?? []; return <CategoryCarousel key={`${item.id}:${media[0]?.src}`} name={item.name} icon={item.icon} media={media} paused={carouselsPaused} onOpen={() => onCategory(item.name)} />; })}</div>
    {categories.length === 0 && catalogState !== "loading" && <div className="premium-empty compact"><span>◇</span><h3>Aucune catégorie active</h3><p>Les catégories publiées par l’administration apparaîtront ici.</p></div>}
    <div className="section-title"><h2>Disponibles aujourd’hui</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div>
    {catalog.some((provider) => isToday(nextAvailability[provider.id], provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC"))) ? <CatalogBlock providers={catalog.filter((provider) => isToday(nextAvailability[provider.id], provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC"))).slice(0, 4)} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister} /> : <div className="premium-empty compact"><span>◷</span><h3>Aucun créneau aujourd’hui</h3><p>Consultez les prochains créneaux réellement publiés.</p></div>}
    {catalog.some((provider) => isTomorrow(nextAvailability[provider.id], provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC"))) && <><div className="section-title"><h2>Disponibles demain</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div><CatalogBlock providers={catalog.filter((provider) => isTomorrow(nextAvailability[provider.id], provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC"))).slice(0, 4)} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister}/></>}
    {catalog.some((provider) => isLaterThisWeek(nextAvailability[provider.id], provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC"))) && <><div className="section-title"><h2>Cette semaine</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div><CatalogBlock providers={catalog.filter((provider) => isLaterThisWeek(nextAvailability[provider.id], provider.timeZone ?? (provider.countryCode === "SN" ? "Africa/Dakar" : "UTC"))).slice(0, 4)} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister}/></>}
    {catalog.length > 0 && <><div className="section-title"><h2>Près de vous</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div><CatalogBlock providers={nearbyProviders.slice(0, 3)} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister}/><div className="section-title"><h2>Meilleurs avis</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div><CatalogBlock providers={[...catalog].sort((a,b) => b.rating-a.rating || b.reviews-a.reviews).slice(0, 3)} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister}/><div className="section-title"><h2>Nouveaux talents</h2><button onClick={() => onCategory("Toutes")}>Voir tout</button></div><CatalogBlock providers={catalog.slice(-3).reverse()} catalogState={catalogState} favorites={favorites} nextAvailability={nextAvailability} onView={onViewProvider} onBook={onBook} onFavorite={onFavorite} onProviderRegister={onProviderRegister}/><section className="launch-inspiration-cta"><span>▶ INSPIRATION</span><h2>Découvrez les dernières transformations.</h2><button onClick={onInspiration}>Ouvrir le feed</button></section></>}
    {catalog.length > 0 && <section className="mata-recommendations"><div className="section-title"><h2>Choisis pour vous</h2><span>✦ Sélection intelligente</span></div><button onClick={() => onViewProvider(catalog[0])}><strong>{catalog[0].name}</strong><small>{catalog[0].specialty} · {catalog[0].rating.toFixed(1)} ★</small><b>Découvrir</b></button></section>}
    {catalog.some((provider) => nextAvailability[provider.id]) && <section className="next-availability-strip"><strong>Prochaines disponibilités</strong>{catalog.filter((provider) => nextAvailability[provider.id]).slice(0, 5).map((provider) => <button key={provider.id} onClick={() => onBook(provider)}><span>{formatSlotLabel(nextAvailability[provider.id], provider.timeZone)}</span><small>{provider.name}</small></button>)}</section>}
    {promotions.length > 0 && <section className="premium-offers"><div className="section-title"><h2>Offres du moment</h2></div>{promotions.slice(0, 2).map((promotion) => <article key={promotion.id}><span>{promotion.discountType === "percentage" ? `−${promotion.discountValue}%` : `−${formatPrice(promotion.discountValue)}`}</span><div><strong>{promotion.title}</strong><small>{promotion.description}</small></div></article>)}</section>}
    {upcomingBookings.length > 0 && <section className="premium-upcoming"><div className="section-title"><h2>Vos rendez-vous</h2></div>{upcomingBookings.map((booking) => <button key={booking.id} onClick={onAccount}><span>▣</span><div><strong>{new Date(booking.starts_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</strong><small>{booking.status}</small></div><b>›</b></button>)}</section>}
    <div className="mobile-date-helper"><label>Quand souhaitez-vous réserver ?<input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
    <footer className="launch-legal-links">{legalDocuments.map(([slug,label]) => <Link key={slug} href={`/legal/${slug}`}>{label}</Link>)}</footer>
  </div>;
}

function ResultsScreen({
  category, subcategory, setSubcategory, area, providers, categoryServices, catalogState, nextAvailability, favorites, filtersOpen, setFiltersOpen,
  homeOnly, setHomeOnly, verifiedOnly, setVerifiedOnly, minRating, setMinRating, maxPrice, setMaxPrice,
  onBack, onViewProvider, onBook, onFavorite, onProviderRegister,
}: {
  category: string; subcategory: string; setSubcategory: (value: string) => void; area: string; providers: Provider[]; categoryServices: string[];
  catalogState: "loading" | "live" | "empty" | "error"; nextAvailability: Record<string, string>; favorites: string[]; filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void; homeOnly: boolean; setHomeOnly: (value: boolean) => void;
  verifiedOnly: boolean; setVerifiedOnly: (value: boolean) => void; minRating: string; setMinRating: (value: string) => void;
  maxPrice: string; setMaxPrice: (value: string) => void; onBack: () => void;
  onViewProvider: (provider: Provider) => void; onBook: (provider: Provider) => void; onFavorite: (provider: Provider) => void; onProviderRegister: () => void;
}) {
  const chips = ["Tout", ...categoryServices];
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
  if (catalogState === "loading") return <div className="mobile-skeletons" role="status" aria-label="Chargement"><i /><i /><i /></div>;
  if (catalogState === "empty" || catalogState === "error") return <div className="premium-empty"><span>✦</span><h3>{catalogState === "error" ? "Catalogue indisponible" : "Les premiers talents arrivent"}</h3><p>{catalogState === "error" ? "Vérifiez votre connexion puis réessayez." : "Aucun professionnel approuvé n’est encore publié dans cette zone."}</p><button onClick={onProviderRegister}>Devenir prestataire</button></div>;
  const displayedProviders = providers.length ? providers : fallbackProviders;
  if (!displayedProviders.length) return <div className="premium-empty compact"><span>⌕</span><h3>Aucun résultat</h3><p>Essayez une autre catégorie ou élargissez vos filtres.</p></div>;
  return <div className="premium-provider-list">{displayedProviders.map((provider) => <ProviderCard key={provider.id} provider={provider} nextSlot={nextAvailability[provider.id]} favorite={favorites.includes(provider.profileId)} onFavorite={() => onFavorite(provider)} onView={() => onView(provider)} onBook={() => onBook(provider)} />)}</div>;
}

function ProviderCard({ provider, nextSlot, favorite, onFavorite, onView, onBook }: { provider: Provider; nextSlot?: string; favorite: boolean; onFavorite: () => void; onView: () => void; onBook: () => void }) {
  return <article className="premium-provider-card" onClick={onView}>
    <div className="premium-provider-photo">{provider.coverUrl ? <ServiceImage src={provider.coverUrl} category={provider.category} alt={provider.specialty} sizes="120px" caption /> : <span>{provider.initials}</span>}</div>
    <div><div className="provider-name-row"><h3><button className="provider-profile-link" onClick={(event) => { event.stopPropagation(); onView(); }}>{provider.name}</button></h3><button aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={(event) => { event.stopPropagation(); onFavorite(); }}>{favorite ? "♥" : "♡"}</button></div>{provider.verified && <span className="gold-verified">✦ Vérifié</span>}<p>★ {provider.rating.toFixed(1)} ({provider.reviews} avis) · {provider.area}</p>{nextSlot && <p className="next-slot-badge">● {formatSlotLabel(nextSlot, provider.timeZone)}</p>}<div className="provider-booking-line"><span><strong>{formatPrice(provider.price, provider.currency)}</strong><small>{formatDuration(provider.durationMinutes)}</small></span><button onClick={(event) => { event.stopPropagation(); onBook(); }}>Voir les créneaux</button></div></div>
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
      supabase.from("provider_services").select("id,title,duration_minutes,price_amount,currency,business_id,deposit_percentage").eq("provider_id", provider.profileId).eq("is_active", true).order("price_amount"),
      supabase.from("portfolio_items").select("storage_path").eq("provider_id", provider.profileId).order("sort_order").limit(12),
    ]).then(([profileResult, servicesResult, portfolioResult]) => {
      if (!active) return;
      setDetail({
        bio: profileResult.data?.bio ?? null,
        services: (servicesResult.data ?? []) as ProviderService[],
        portfolio: (portfolioResult.data ?? []).map((item) => supabase.storage.from("portfolios").getPublicUrl(item.storage_path).data.publicUrl),
      });
    });
    return () => { active = false; };
  }, [provider.profileId]);
  const services = detail.services.length ? detail.services : [defaultService(provider)];
  return <main className="premium-mobile-app"><div className="premium-app-frame profile-app-frame"><div className="mobile-screen premium-profile-screen">
    <div className="premium-profile-hero">{provider.coverUrl ? <ServiceImage src={provider.coverUrl} category={provider.category} alt={provider.specialty} priority sizes="430px" /> : <div>{provider.initials}</div>}<div className="profile-hero-actions"><button aria-label="Retour" onClick={onBack}>‹</button><span /><button aria-label="Partager" onClick={() => void navigator.share?.({ title: provider.name, url: window.location.href })}>⇧</button><button aria-label="Favori" onClick={onFavorite}>{favorite ? "♥" : "♡"}</button></div></div>
    <section className="premium-profile-info"><div className="profile-heading-row"><h1>{provider.name}</h1>{provider.verified && <span className="gold-verified">✦ Vérifié</span>}</div><p className="profile-rating">★ {provider.rating.toFixed(1)} ({provider.reviews} avis) <i>•</i> {provider.area}</p><p>{detail.bio || `${provider.specialty}, avec une approche professionnelle et personnalisée.`}</p><div className="profile-facts"><span>◷<strong>Sur rendez-vous</strong><small>Horaires réels</small></span><span>⌂<strong>{provider.homeService ? "À domicile" : "En salon"}</strong><small>{provider.homeService ? "Disponible" : "Sur place"}</small></span><span>◫<strong>Clientèle</strong><small>Mixte</small></span></div>
      {detail.portfolio.length > 0 && <div className="portfolio-strip">{detail.portfolio.map((url, index) => <Image key={url} src={url} alt={`Réalisation ${index + 1} de ${provider.name}`} width={92} height={92} />)}</div>}
    </section>
    <div className="profile-tabs"><button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}>Prestations</button><button className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}>Avis</button><button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>À propos</button></div>
    <section className="profile-tab-content">
      {tab === "services" && services.map((service) => <button className="profile-service-row" key={service.id} onClick={() => onBook(service)}><span><strong>{service.title}</strong><small><em>{formatPrice(service.price_amount, service.currency)}</em> · {formatDuration(service.duration_minutes)}</small></span><span>Choisir <b>›</b></span></button>)}
      {tab === "reviews" && <div className="profile-empty-tab"><strong>{provider.rating.toFixed(1)} / 5</strong><p>{provider.reviews ? `${provider.reviews} avis vérifiés sont associés à ce profil.` : "Aucun avis publié pour le moment."}</p></div>}
      {tab === "about" && <div className="profile-empty-tab"><strong>Informations pratiques</strong><p>{detail.bio || `Prestations disponibles à ${provider.area}. Les coordonnées complètes sont communiquées pendant la réservation.`}</p></div>}
    </section>
    <div className="profile-book-bar"><button onClick={() => onBook(services[0])}>Voir les disponibilités</button></div>
  </div></div></main>;
}

function BookingModal({ selection, initialDate, initialRequest, authenticated, onClose, onSubmit }: { selection: BookingSelection; initialDate: string; initialRequest: BookingRequest | null; authenticated: boolean; onClose: () => void; onSubmit: (request: BookingRequest) => Promise<BookingConfirmation | null> }) {
  const locale = useApplicationLocale();
  const t = (text: string) => bookingText(text, locale);
  const { provider, service } = selection;
  const [step, setStep] = useState(initialRequest?.slotStart ? 2 : 1);
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const [submissionError, setSubmissionError] = useState("");
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [slotRows, setSlotRows] = useState<AvailabilitySlot[]>([]);
  const [teamEnabled, setTeamEnabled] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityBlocked,setAvailabilityBlocked]=useState(false);
  const [findingNext,setFindingNext]=useState(false);
  const [nextNotice,setNextNotice]=useState("");
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [waitingForAuthentication, setWaitingForAuthentication] = useState(false);
  const [paymentCapabilities, setPaymentCapabilities] = useState<PaymentCapabilities>({ onlineCheckoutEnabled: false, environment: "disabled", provider: "none", methods: [] });
  const [paymentCapabilitiesLoading, setPaymentCapabilitiesLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<BookableCollaborator[]>([]);
  const [teamPeople, setTeamPeople] = useState<BookingTeamPerson[]>([]);
  const timeZone = providerTimeZone(provider);
  const localToday = localDateAt(new Date(), timeZone);
  const [form, setForm] = useState<BookingRequest>(initialRequest ?? { date: initialDate || addCalendarDays(localToday, 1), time: "", locationMode: "salon", address: "", note: "", collaboratorId: "", paymentMethod: "on_site" });
  const depositQuote = serviceDepositQuote(service.price_amount, service.deposit_percentage ?? provider.depositPercentage ?? 0, service.currency ?? "XOF");
  const onlinePaymentAvailable = depositQuote.percentage === 0 && paymentCapabilities.onlineCheckoutEnabled && (service.currency ?? "XOF") === "XOF";

  useEffect(() => {
    writeBrowserStorage("sessionStorage", bookingDraftKey, JSON.stringify({ selection, request: form }));
  }, [form, selection]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch("/api/payments/capabilities", { cache: "no-store", signal: controller.signal })
      .then(async (response) => paymentCapabilitiesSchema.safeParse(await response.json().catch(() => null)))
      .then((parsed) => {
        if (!active || !parsed.success) return;
        setPaymentCapabilities(parsed.data);
        if (!parsed.data.onlineCheckoutEnabled || (service.currency ?? "XOF") !== "XOF") setForm((current) => current.paymentMethod === "on_site" ? current : { ...current, paymentMethod: "on_site" });
      })
      .catch(() => undefined)
      .finally(() => { if (active) setPaymentCapabilitiesLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [service.currency]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      void Promise.resolve().then(() => { setAvailabilityLoading(false); setAvailabilityError(true); });
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    void Promise.resolve().then(() => { if (active) { setAvailabilityLoading(true); setAvailabilityError(false); } });
    void supabase.rpc("get_booking_team_availability", {
      target_service_id: service.id,
      from_date: form.date,
    }).abortSignal(controller.signal).then(({ data, error }) => {
      window.clearTimeout(timeout);
      if (!active) return;
      const availability = data as { teamEnabled: boolean; blockedReason?: string; people?: BookingTeamPerson[]; slots: BookableCollaborator[] } | null;
      setTeamEnabled(Boolean(availability?.teamEnabled));
      setAvailabilityBlocked(availability?.blockedReason === "salon_not_published");
      setNextNotice("");
      setTeamPeople(error || !availability?.teamEnabled ? [] : bookingTeamPeople(availability.people, availability.slots));
      setSlotRows(error ? [] : availability?.slots ?? []);
      setCollaborators(error || !availability?.teamEnabled ? [] : availability.slots);
      setAvailabilityError(Boolean(error));
      setAvailabilityLoading(false);
    });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [form.date, provider.profileId, service.id, availabilityAttempt]);

  async function findNextAvailability(){
    const api=getSupabaseBrowserClient();if(!api||findingNext)return;
    setFindingNext(true);setNextNotice("");
    const requestedDate=form.date,requestedPerson=form.collaboratorId;
    try{
      const result=teamEnabled
        ?await api.rpc("get_team_available_slots",{target_provider_service_id:service.id,from_date:addCalendarDays(form.date,1),days:14}).abortSignal(AbortSignal.timeout(15000))
        :await api.rpc("get_available_slots",{target_provider_id:provider.profileId,target_provider_service_id:service.id,from_date:addCalendarDays(form.date,1),days:14}).abortSignal(AbortSignal.timeout(15000));
      if(result.error)throw result.error;
      const rows=(result.data??[]) as {slot_start:string;collaborator_id?:string}[];
      const next=nextBookingDate(rows,timeZone,teamEnabled,requestedPerson);
      if(next)setForm(current=>current.date===requestedDate&&current.collaboratorId===requestedPerson?{...current,date:next,time:"",slotStart:undefined}:current);
      else setNextNotice(t("Aucun créneau disponible dans les 14 prochains jours."));
    }catch{setNextNotice(t("La recherche n’a pas abouti. Réessayez."));}
    finally{setFindingNext(false);}
  }
  const availablePeople = teamPeople;
  const slotSource = teamEnabled ? selectedTeamSlots(collaborators, form.collaboratorId ?? "") : slotRows;
  const uniqueSlots = [...new Map(slotSource.map(slot => [slot.slot_start, slot])).values()];
  const slots = uniqueSlots.map((slot) => ({
    instant: slot.slot_start,
    label: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(slot.slot_start)),
  }));

  const quickDates = buildQuickDates(timeZone, locale);
  const confirm = useCallback(async () => {
    if (submissionPending.current) return;
    submissionPending.current = true;
    setSubmitting(true);
    setSubmissionError("");
    try {
      const result = await onSubmit(form);
      if (result) setConfirmation(result);
      else if (!authenticated) setWaitingForAuthentication(true);
      else setSubmissionError("La confirmation n’a pas pu être vérifiée. Consultez vos rendez-vous avant de réessayer.");
    } catch (error: unknown) {
      if (bookingSubmissionError(error) === "conflict") {
        setSubmissionError("Ce créneau vient d’être réservé. Choisissez une nouvelle disponibilité.");
        setForm(current => ({ ...current, time: "", slotStart: undefined }));
        setSlotRows([]);
        setCollaborators([]);
        setAvailabilityAttempt(attempt => attempt + 1);
        setStep(1);
      } else {
        setSubmissionError("La confirmation n’a pas pu être vérifiée. Consultez vos rendez-vous avant de réessayer.");
      }
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }, [authenticated, form, onSubmit, setForm]);
  useEffect(() => {
    if (!authenticated || !waitingForAuthentication) return;
    void Promise.resolve().then(() => {
      setWaitingForAuthentication(false);
      void confirm();
    });
  }, [authenticated, confirm, waitingForAuthentication]);
  const canConfirm = Boolean(form.time && form.slotStart) && (form.locationMode === "salon" || Boolean(form.address.trim()));
  return <div className="modal-backdrop premium-booking-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal premium-booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
      <header className="booking-screen-header"><button aria-label={t("Fermer")} onClick={onClose}>‹</button><div><h2 id="booking-title">{t("Réserver")}</h2><p>{provider.name} {" · "}{t("réservation rapide")}</p></div></header>
      {confirmation ? <BookingSuccess provider={provider} service={service} confirmation={confirmation} onClose={onClose} /> : <>
        <div className="fast-booking-progress" aria-label={`${t("Étape")} ${step} ${t("sur")} 2`}><span className={step >= 1 ? "active" : ""}>1 <small>{t("Créneau")}</small></span><i /><span className={step >= 2 ? "active" : ""}>2 <small>{t("Confirmation")}</small></span></div>
        <div className="premium-booking-content">
          {submissionError && <p role="alert" className="booking-submit-error">{t(submissionError)}</p>}
          {step === 1 && <><div className="fast-service-summary"><span>{provider.coverUrl ? <ServiceImage src={provider.coverUrl} category={provider.category} alt={service.title} sizes="54px" /> : provider.initials}</span><div><strong>{service.title}</strong><small>{provider.name} · {formatDuration(service.duration_minutes)}</small></div><b>{formatPrice(service.price_amount, service.currency, locale)}</b></div><h3>{t("Quand êtes-vous disponible ?")}</h3><p>{t("Heure locale de l’établissement")}{" · "}{timeZone}</p><div className="quick-date-strip">{quickDates.map((item) => <button key={item.date} className={form.date === item.date ? "active" : ""} onClick={() => setForm({ ...form, date: item.date, time: "", slotStart: undefined })}><small>{item.weekday}</small><strong>{item.day}</strong><span>{item.month}</span></button>)}<label><small>{t("Autre")}</small><strong>＋</strong><input aria-label={t("Choisir une autre date")} type="date" min={localToday} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, time: "", slotStart: undefined })} /></label></div>{teamEnabled && !availabilityLoading && <fieldset className="booking-team-choice"><legend>{t("Avec qui réserver ?")}</legend><label><input type="radio" name="employee-choice" checked={!form.collaboratorId} onChange={() => setForm({ ...form, collaboratorId: "", time: "", slotStart: undefined })} />{t("Sans préférence — une personne disponible")}</label>{availablePeople.map(person => <label key={person.collaborator_id}><input type="radio" name="employee-choice" checked={form.collaboratorId === person.collaborator_id} onChange={() => setForm({ ...form, collaboratorId: person.collaborator_id, time: "", slotStart: undefined })} />{person.avatar_url && <Image unoptimized src={person.avatar_url} alt={person.display_name} width={48} height={48} />}<span><strong>{person.display_name}</strong><small>{person.title}</small><small>{person.specialties.join(" · ")}</small>{!collaborators.some(slot => slot.collaborator_id === person.collaborator_id) && <small>{t("Aucun créneau ce jour — choisissez une autre date")}</small>}</span></label>)}{!availablePeople.length && <p>{t("Aucun collaborateur réservable pour cette prestation.")}</p>}</fieldset>}<div className="slot-section-title"><strong>{t("Créneaux disponibles")}</strong><small>{t("Mis à jour en direct")}</small></div>{availabilityLoading ? <div className="slot-loading">{t("Recherche des meilleurs créneaux…")}</div> : availabilityBlocked ? <div role="status" className="no-slots">{t("Cette prestation n’est pas encore ouverte à la réservation. Le salon doit terminer sa publication.")}</div> : availabilityError ? <div role="alert" className="no-slots">{t("Les disponibilités n’ont pas pu être chargées. Vérifiez votre connexion.")}<button onClick={() => setAvailabilityAttempt((attempt) => attempt + 1)}>{t("Réessayer")}</button></div> : slots.length ? <div className="premium-slot-grid">{slots.map((slot) => <button className={form.slotStart === slot.instant ? "active" : ""} key={slot.instant} onClick={() => { const instant = new Date(slot.instant); setForm({ ...form, time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(instant), slotStart: instant.toISOString() }); setStep(2); }}>{slot.label}</button>)}</div> : <div className="no-slots">{t(form.collaboratorId ? "Aucun créneau pour cette personne ce jour. Essayez une autre date ou changez de personne." : "Aucun créneau publié ce jour. Essayez une autre date.")}<button type="button" onClick={() => setAvailabilityAttempt((attempt) => attempt + 1)}>{t("Actualiser les disponibilités")}</button><button type="button" disabled={findingNext} onClick={()=>void findNextAvailability()}>{t(findingNext?"Recherche…":"Voir les prochaines disponibilités")}</button>{nextNotice && <p role="status">{nextNotice}</p>}</div>}</>}
          {step === 2 && <>
            <h3>{t("Vérifiez et confirmez")}</h3>
            <div className="booking-recap-card"><div className="recap-photo">{provider.coverUrl ? <ServiceImage src={provider.coverUrl} category={provider.category} alt={service.title} sizes="70px" /> : provider.initials}</div><div><strong>{service.title}</strong><small>{formatBookingDate(form.date, locale)} {" "}{t("à")}{" "}{form.time} · {formatDuration(service.duration_minutes)}</small><small>{provider.name} · {timeZone}</small></div><b>{formatPrice(service.price_amount, service.currency, locale)}</b></div>
            <section className="booking-money-summary" aria-label={t("Détail du prix")}>
              <h4>{t("Détail du prix")}</h4><p>{t("Prix total")}{" : "}<strong>{formatPrice(depositQuote.totalAmount, service.currency, locale)}</strong></p>
              <p>{t("Acompte prévu")}{" ("}{depositQuote.percentage}{" %) : "}<strong>{formatPrice(depositQuote.depositAmount, service.currency, locale)}</strong></p>
              <p>{t("Solde après paiement de l’acompte")}{" : "}{formatPrice(depositQuote.balanceAmount, service.currency, locale)}</p>
              {depositQuote.percentage > 0 && <p>{t("Répartition prévue à l’activation du paiement en ligne.")}</p>}
              <p><strong>{t("À payer aujourd’hui")}{" : "}{formatPrice(0, service.currency, locale)}</strong></p>
              <p>{t("Aucun acompte encaissé. À régler sur place")}{" : "}<strong>{formatPrice(depositQuote.totalAmount, service.currency, locale)}</strong></p>
            </section>
            {teamEnabled && <p>{t("Professionnel :")}{" "}{availablePeople.find(person => person.collaborator_id === form.collaboratorId)?.display_name ?? t("Affectation automatique à une personne qualifiée et disponible")}</p>}
            <fieldset className="location-choice"><legend>{t("Où ?")}</legend><label><input type="radio" name="location" checked={form.locationMode === "salon"} onChange={() => setForm({ ...form, locationMode: "salon" })} /><span><strong>{t("Chez le professionnel")}</strong><small>{provider.address ? `${provider.address} · ${provider.area}` : `${provider.area} · ${t("adresse à confirmer avec le professionnel")}`}</small></span></label>{provider.homeService && <label><input type="radio" name="location" checked={form.locationMode === "client_address"} onChange={() => setForm({ ...form, locationMode: "client_address" })} /><span><strong>{t("À mon domicile")}</strong><small>{t("Le professionnel se déplace")}</small></span></label>}</fieldset>
            {form.locationMode === "client_address" && <label>{t("Adresse")}<textarea autoFocus value={form.address} placeholder={t("Votre adresse complète")} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>}
            <fieldset className="location-choice"><legend>{t("Paiement")}</legend>
              <label><input type="radio" name="payment" checked={form.paymentMethod === "on_site"} onChange={() => setForm({ ...form, paymentMethod: "on_site" })} /><span><strong>{t("Sur place")}</strong><small>{t("Aucun débit aujourd’hui")}</small></span></label>
              {onlinePaymentAvailable ? <>
                {paymentCapabilities.methods.includes("wave") && <label><input type="radio" name="payment" checked={form.paymentMethod === "wave"} onChange={() => setForm({ ...form, paymentMethod: "wave" })} /><span><strong>{t("Wave · Paiement de démonstration")}</strong><small>{t("PayDunya Sandbox · aucun argent réel")}</small></span></label>}
                {paymentCapabilities.methods.includes("orange_money") && <label><input type="radio" name="payment" checked={form.paymentMethod === "orange_money"} onChange={() => setForm({ ...form, paymentMethod: "orange_money" })} /><span><strong>{t("Orange Money · Paiement de démonstration")}</strong><small>{t("PayDunya Sandbox · aucun argent réel")}</small></span></label>}
                {paymentCapabilities.methods.includes("card") && <label><input type="radio" name="payment" checked={form.paymentMethod === "card"} onChange={() => setForm({ ...form, paymentMethod: "card" })} /><span><strong>{t("Carte · Paiement de démonstration")}</strong><small>{t("PayDunya Sandbox · aucune carte réelle")}</small></span></label>}
              </> : <label><input type="radio" name="payment" disabled /><span><strong>{t("Wave, Orange Money ou carte")}</strong><small>{paymentCapabilitiesLoading ? t("Vérification…") : t("Le paiement en ligne n’est pas encore disponible")}</small></span></label>}
            </fieldset>
            <section className="booking-cancellation-policy" aria-label={t("Politique d’annulation")}><h4>{t("Politique d’annulation")}</h4><p>{t("Annulation gratuite au moins 48 h avant le rendez-vous. Si le professionnel annule, les sommes versées sont intégralement remboursées. À moins de 48 h ou en cas d’absence, seul l’acompte effectivement payé peut être conservé, sous réserve des droits applicables.")}</p><p>{t("Aucun acompte payé : aucune retenue d’acompte.")}</p><Link href="/legal/annulation" target="_blank" rel="noopener noreferrer">{t("Lire la politique d’annulation")}</Link></section>
            <details className="booking-options"><summary>{t("Note")}</summary><label>{t("Note")}<textarea maxLength={1000} value={form.note} placeholder={t("Précision utile pour le professionnel")} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label></details>
            <div className="payment-note">{form.paymentMethod === "on_site" ? t("Paiement sur place · aucun débit aujourd’hui.") : t("Paiement de démonstration · aucun argent réel.")}</div>
          </>}
        </div>
        {step === 2 && <div className="premium-booking-nav"><button className="back-button" onClick={() => setStep(1)}>{t("Modifier")}</button><button disabled={submitting || !canConfirm} onClick={() => void confirm()}>{submitting ? t("Enregistrement…") : form.paymentMethod === "on_site" ? t("Confirmer · ") + formatPrice(service.price_amount, service.currency, locale) : t("Continuer vers la sandbox · ") + formatPrice(service.price_amount, service.currency, locale)}</button></div>}
      </>}
    </section>
  </div>;
}

function BookingSuccess({ provider, service, confirmation, onClose }: { provider: Provider; service: ProviderService; confirmation: BookingConfirmation; onClose: () => void }) {
  const locale = useApplicationLocale();
  const t = (text: string) => bookingText(text, locale);
  const start = new Date(confirmation.startsAt);
  const end = new Date(start.getTime() + service.duration_minutes * 60000);
  const calendarDate = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(".000", "");
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${service.title} · ${provider.name}`)}&dates=${calendarDate(start)}/${calendarDate(end)}`;
  return <div className="premium-booking-success"><span>✓</span><p>{t("Demande enregistrée")}</p><h2>{t("Votre rendez-vous est créé")}</h2><dl><div><dt>{t("Professionnel")}</dt><dd>{provider.name}</dd></div><div><dt>{t("Votre intervenant")}</dt><dd>{confirmation.collaboratorPhoto && <Image unoptimized src={confirmation.collaboratorPhoto} alt="" width={48} height={48} />}{confirmation.collaboratorName ?? (service.business_id || provider.businessId ? t("Votre professionnel sera confirmé par le salon.") : provider.name)}</dd></div><div><dt>{t("Prestation")}</dt><dd>{service.title}</dd></div><div><dt>{t("Date")}</dt><dd>{formatBookingDate(localDateAt(start, providerTimeZone(provider)), locale)} {" "}{t("à")}{" "}{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: providerTimeZone(provider), timeZoneName: "short" }).format(start)}</dd></div><div><dt>{t("Adresse")}</dt><dd>{confirmation.location}</dd></div><div><dt>{t("Prix")}</dt><dd>{formatPrice(service.price_amount, service.currency, locale)}</dd></div><div><dt>{t("Paiement")}</dt><dd>{t("À régler sur place · aucun débit en ligne")}</dd></div><div><dt>{t("Statut")}</dt><dd>{t("En attente de confirmation du professionnel")}</dd></div></dl><Link href={`/app/messages?booking=${encodeURIComponent(confirmation.id)}`}>{t("Message")}</Link><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(confirmation.location)}`} target="_blank" rel="noreferrer">{t("Itinéraire")}</a><BookingMicroFeedback bookingId={confirmation.id}/><a href={calendarUrl} target="_blank" rel="noreferrer">{t("Ajouter au calendrier")}</a><button onClick={onClose}>{t("Terminer")}</button></div>;
}

function BookingMicroFeedback({ bookingId }: { bookingId: string }) {
  const locale = useApplicationLocale();
  const t = (text: string) => bookingText(text, locale);
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  async function answer(response: "yes" | "no") {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const client = getSupabaseBrowserClient(); if (!client) throw Error("unavailable");
      const auth = await client.auth.getUser(); if (auth.error || !auth.data.user) throw Error("unauthorized");
      const result = await client.from("micro_feedback").insert({profile_id:auth.data.user.id,context:"booking",response,booking_id:bookingId}).abortSignal(AbortSignal.timeout(12_000));
      if (result.error) throw result.error;
      setSent(true);
    } catch { setError("Votre retour n’a pas pu être enregistré. Réessayez."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <aside className="micro-feedback"><strong>{t("Votre réservation a-t-elle été simple ?")}</strong>{sent ? <small>{t("Merci pour votre retour.")}</small> : <div><button disabled={busy} onClick={() => void answer("yes")}>{t("👍 Oui")}</button><button disabled={busy} onClick={() => void answer("no")}>{t("👎 Non")}</button></div>}{error && <p role="alert">{t(error)}</p>}</aside>;
}

function BottomNav({ authenticated, active, onFeed, onAccount }: { authenticated: boolean; active: "inspiration"; onFeed: () => void; onAccount: (page: "bookings" | "messages" | "profile") => void }) {
  const locale = useApplicationLocale();
  const t = (text: string) => bookingText(text, locale);
  return <nav className="premium-bottom-nav" aria-label={t("Navigation de l’application")}><button className={`inspiration-nav ${active === "inspiration" ? "active" : ""}`} onClick={onFeed}><i>▶</i>Inspiration</button><button onClick={() => onAccount("bookings")}><i className="inbox-icon">□{authenticated && <UnreadBadge kind="bookings"/>}</i>{t("Rendez-vous")}</button><button onClick={() => onAccount("messages")}><i className="inbox-icon">✉{authenticated && <UnreadBadge kind="messages"/>}</i>{t("Messages")}</button><button aria-label={authenticated ? t("Profil") : t("Se connecter à MATA Beauty")} onClick={() => onAccount("profile")}><i aria-hidden>○</i>{authenticated ? t("Profil") : t("Se connecter")}</button></nav>;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining}` : `${hours} h`;
}

function defaultService(provider: Provider): ProviderService {
  return { deposit_percentage: provider.depositPercentage ?? 0, id: provider.serviceId, title: provider.specialty, duration_minutes: provider.durationMinutes, price_amount: provider.price, currency: provider.currency ?? "XOF", business_id: provider.businessId ?? null };
}

function buildQuickDates(timeZone = "Africa/Dakar", locale = "fr-FR") {
  const base = localDateAt(new Date(), timeZone);
  return Array.from({ length: 6 }, (_, index) => {
    const dateValue = addCalendarDays(base, index);
    const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue) ?? [];
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
    return {
      date: dateValue,
      weekday: index === 0 ? bookingText("Aujourd’hui", locale) : new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date).replace(".", ""),
      day: date.getUTCDate(),
      month: date.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }).replace(".", ""),
    };
  });
}

function formatBookingDate(dateValue: string, locale = "fr-FR") {
  return formatWallDate(dateValue, locale);
}

function parseDateParts(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return { year, month, day };
}

function resolveBookingWallTime(date: string, time: string, timeZone: string) {
  const { year, month, day } = parseDateParts(date);
  const [hour, minute] = time.split(":").map(Number);
  const candidates = localWallTimeToInstants({ year, month, day, hour, minute }, timeZone);
  if (candidates.length !== 1) return new Date(Number.NaN);
  return candidates[0];
}

function bookingLocalDateTime(instant: string, timeZone: string) {
  const date = new Date(instant);
  return {
    date: localDateAt(date, timeZone),
    time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" }).format(date),
  };
}

function isToday(slot?: string, timeZone = "Africa/Dakar") {
  if (!slot) return false;
  return localDateAt(new Date(slot), timeZone) === localDateAt(new Date(), timeZone);
}

function daysFromToday(slot?: string, timeZone = "Africa/Dakar") {
  if (!slot) return Number.POSITIVE_INFINITY;
  const target = new Date(`${localDateAt(new Date(slot), timeZone)}T12:00:00Z`);
  const current = new Date(`${localDateAt(new Date(), timeZone)}T12:00:00Z`);
  return Math.round((target.getTime() - current.getTime()) / 86_400_000);
}

function isTomorrow(slot?: string, timeZone = "Africa/Dakar") { return daysFromToday(slot, timeZone) === 1; }
function isLaterThisWeek(slot?: string, timeZone = "Africa/Dakar") { const days = daysFromToday(slot, timeZone); return days >= 2 && days <= 7; }

function formatSlotLabel(slot: string, timeZone = "Africa/Dakar") {
  const date = new Date(slot);
  const prefix = isToday(slot, timeZone) ? "Aujourd’hui" : date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone });
  return `${prefix} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone })}`;
}

