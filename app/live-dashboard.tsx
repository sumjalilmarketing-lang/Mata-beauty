"use client";
import { BookingReschedule } from "./booking-reschedule";
import { BookingFeedback } from "./booking-feedback";

import Link from "next/link";
import { ServiceEditor, type EditableService } from "./service-editor";
import { ActivityLocationSettings } from "./activity-location-settings";
import { activityLocationReady, serviceDetailsError } from "@/lib/domain/service-creation";
import Image from "next/image";
import { formatServiceMoney } from "@/lib/domain/service-money";
import { bookingTimeZone } from "@/lib/domain/booking-time-zone";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canTransitionBooking, type BookingStatus } from "@/lib/domain/booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { BookingMessages } from "./booking-messages";
import { VideoPublisher } from "./video-publisher";
import { SocialDashboard } from "./social-dashboard";
import { ClientControlCenter } from "./client-control-center";
import { ProviderLaunchChecklist } from "./provider-launch-checklist";
import { ProfessionalDocuments } from "./professional-documents";
import { ReferralCard } from "./referral-card";
import { ProviderLogoEditor } from "./provider-logo-editor";
import { NotificationCenter } from "./notification-center";
import { BookingReview } from "./booking-review";
import { ClientBookingGroups } from "./client-booking-groups";
import { BookingCancellationDialog } from "./booking-cancellation-dialog";
import type { ClientBookingItem } from "@/lib/domain/client-bookings";

type Role = "client" | "provider" | "admin";
type ProviderStatus = "draft" | "pending_review" | "approved" | "rejected" | "suspended";
type BookingRow = {
  id: string;
  provider_id: string;
  provider_service_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  total_amount: number;
  currency: string;
  location_mode: "salon" | "client_address";
  appointment_address: string | null;
  collaborator_name: string | null;
  collaborator_avatar_url: string | null;
  provider_services: { title: string; duration_minutes: number; business_id: string | null; is_active: boolean; archived_at: string | null } | null;
};
type BookingQueryRow = Omit<BookingRow, "provider_services"> & {
  provider_services: BookingRow["provider_services"] | Array<NonNullable<BookingRow["provider_services"]>>;
};
type ProviderBookingIdentity = { logo_url: string | null; profile_id: string; business_name: string; slug: string | null; city: string; base_address: string | null; cover_url: string | null; country_code: string | null; timezone: string | null };
type BusinessBookingIdentity = { id: string; name: string; address: string; city: string; area: string | null; logo_url: string | null; timezone: string | null };
type NotificationRow = {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
type ProviderProfileRow = {
  profile_id: string;
  business_name: string;
  bio: string | null;
  city: string;
  country_code: string | null;
  region: string | null;
  timezone: string | null;
  currency: string | null;
  service_mode: "salon" | "mobile" | "both";
  status: ProviderStatus;
  activity_type: "independent" | "salon" | "barber_shop" | "makeup_artist" | "hairdresser" | "nail_artist" | "esthetician" | "care_specialist" | "other";
  years_experience: number;
  base_address: string | null;
  languages: string[];
  cancellation_policy: string | null;
  onboarding_progress: number;
};
type ClientAccountRow = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  marketing_consent: boolean;
  city: string | null;
  default_address: string | null;
  preferences: Record<string, unknown>;
};
type PendingProviderRow = {
  profile_id: string;
  business_name: string;
  city: string;
  status: ProviderStatus;
  created_at: string;
};
type BaseServiceRow = {
  id: string;
  name: string;
};

const providerStatusLabels: Record<ProviderStatus, string> = {
  draft: "Brouillon",
  pending_review: "En cours de validation",
  approved: "Profil publié",
  rejected: "À corriger",
  suspended: "Suspendu",
};

export function LiveDashboard({
  role,
  userId,
  displayName,
  onBack,
  onSignOut,
  moduleKey,
}: {
  role: Role;
  moduleKey?: string;
  userId: string;
  displayName: string;
  onBack: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [clientBookingItems, setClientBookingItems] = useState<ClientBookingItem[]>([]);
  const [activeClientBookingItems, setActiveClientBookingItems] = useState<ClientBookingItem[]>([]);
  const [clientBookingStats, setClientBookingStats] = useState({ upcoming: 0, pending: 0, past: 0 });
  const [bookingPage, setBookingPage] = useState(0);
  const [bookingsHaveMore, setBookingsHaveMore] = useState(false);
  const [loadingMoreBookings, setLoadingMoreBookings] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [providerProfile, setProviderProfile] = useState<ProviderProfileRow | null>(null);
  const [businessTimeZones, setBusinessTimeZones] = useState<Record<string, string | null>>({});
  const [clientProfile, setClientProfile] = useState<ClientAccountRow | null>(null);
  const [pendingProviders, setPendingProviders] = useState<PendingProviderRow[]>([]);
  const [ownServices, setOwnServices] = useState<EditableService[]>([]);
  const [baseServices, setBaseServices] = useState<BaseServiceRow[]>([]);
  const [adminMetrics, setAdminMetrics] = useState({ users: 0, providersPending: 0, reportsOpen: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [savingService, setSavingService] = useState(false);
  const servicePending = useRef(false);
  const [messageBooking, setMessageBooking] = useState<{ id: string; serviceTitle: string } | null>(null);
  const [pendingCancellation, setPendingCancellation] = useState<ClientBookingItem | null>(null);

  const clientBookingPageSize = 50;

  async function decorateClientBookings(rows: readonly BookingQueryRow[]): Promise<ClientBookingItem[]> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || rows.length === 0) return [];
    const providerIds = [...new Set(rows.map((row) => row.provider_id))];
    const businessIds = [...new Set(rows.map((row) => {
      const service = Array.isArray(row.provider_services) ? row.provider_services[0] : row.provider_services;
      return service?.business_id ?? null;
    }).filter((id): id is string => Boolean(id)))];
    const [providerResult, profileResult, businessResult] = await Promise.all([
      supabase.from("provider_profiles").select("profile_id,business_name,slug,city,base_address,logo_url,cover_url,country_code,timezone").in("profile_id", providerIds),
      supabase.from("profiles").select("id,avatar_url").in("id", providerIds),
      businessIds.length ? supabase.from("businesses").select("id,name,address,city,area,logo_url,timezone").in("id", businessIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (providerResult.error) throw providerResult.error;
    if (businessResult.error) throw businessResult.error;
    const providers = new Map(((providerResult.data ?? []) as ProviderBookingIdentity[]).map((item) => [item.profile_id, item]));
    const avatars = new Map(((profileResult.data ?? []) as Array<{ id: string; avatar_url: string | null }>).map((item) => [item.id, item.avatar_url]));
    const businesses = new Map(((businessResult.data ?? []) as BusinessBookingIdentity[]).map((item) => [item.id, item]));
    return rows.map((row) => {
      const service = Array.isArray(row.provider_services) ? row.provider_services[0] ?? null : row.provider_services;
      const businessId = service?.business_id ?? null;
      const business = businessId ? businesses.get(businessId) : undefined;
      const provider = providers.get(row.provider_id);
      const providerName = business?.name || provider?.business_name || "Professionnel";
      const address = business
        ? [business.address, business.area, business.city].filter(Boolean).join(", ")
        : [provider?.base_address, provider?.city].filter(Boolean).join(", ");
      return {
        id: row.id,
        groupId: businessId ? `business:${businessId}` : `provider:${row.provider_id}`,
        providerId: row.provider_id,
        providerName,
        providerSlug: provider?.slug ?? null,
        providerImage: business?.logo_url ?? provider?.logo_url ?? avatars.get(row.provider_id) ?? provider?.cover_url ?? null,
        address: address || null,
        timeZone: business?.timezone ?? provider?.timezone ?? (provider?.country_code === "SN" ? "Africa/Dakar" : "UTC"),
        serviceId: row.provider_service_id,
        serviceBookable: Boolean(service?.is_active && !service.archived_at),
        serviceName: service?.title ?? "Prestation beauté",
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        amount: row.total_amount,
        currency: row.currency,
      };
    });
  }

  async function loadMoreClientBookings() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || loadingMoreBookings || !bookingsHaveMore) return;
    setLoadingMoreBookings(true);
    try {
      const nextPage = bookingPage + 1;
      const start = nextPage * clientBookingPageSize;
      const { data, error: queryError } = await supabase.from("bookings")
        .select("id,provider_id,provider_service_id,starts_at,ends_at,status,total_amount,currency,location_mode,appointment_address,collaborator_name,collaborator_avatar_url,provider_services(title,duration_minutes,business_id,is_active,archived_at)")
        .eq("client_id", userId).order("starts_at", { ascending: false }).range(start, start + clientBookingPageSize);
      if (queryError) throw queryError;
      const pageRows = ((data ?? []) as unknown as BookingQueryRow[]);
      setBookingsHaveMore(pageRows.length > clientBookingPageSize);
      const items = await decorateClientBookings(pageRows.slice(0, clientBookingPageSize));
      setClientBookingItems((current) => [...current, ...items]);
      setBookingPage(nextPage);
    } catch (caught) {
      setError(publicErrorMessage(caught, "Impossible de charger les rendez-vous suivants."));
    } finally {
      setLoadingMoreBookings(false);
    }
  }

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Votre espace est momentanément indisponible.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (role === "admin") {
        const [users, pending, reports, providerRows] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("provider_profiles").select("profile_id", { count: "exact", head: true }).eq("status", "pending_review"),
          supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
          supabase
            .from("provider_profiles")
            .select("profile_id,business_name,city,status,created_at")
            .eq("status", "pending_review")
            .order("created_at", { ascending: true }),
        ]);
        const firstError = users.error ?? pending.error ?? reports.error ?? providerRows.error;
        if (firstError) throw firstError;
        setAdminMetrics({
          users: users.count ?? 0,
          providersPending: pending.count ?? 0,
          reportsOpen: reports.count ?? 0,
        });
        setPendingProviders((providerRows.data ?? []) as PendingProviderRow[]);
      } else {
        const ownerColumn = role === "client" ? "client_id" : "provider_id";
        const owned = role === "provider" ? await supabase.from("businesses").select("id").eq("owner_id", userId).is("archived_at", null) : null;
        if (owned?.error) throw owned.error;
        const businessIds = (owned?.data ?? []).map((item: { id: string }) => item.id);
        let bookingQuery = supabase.from("bookings")
          .select("id,provider_id,provider_service_id,starts_at,ends_at,status,total_amount,currency,location_mode,appointment_address,collaborator_name,collaborator_avatar_url,provider_services(title,duration_minutes,business_id,is_active,archived_at)")
          ;
        bookingQuery = role === "provider" && businessIds.length
          ? bookingQuery.or(`provider_id.eq.${userId},business_id.in.(${businessIds.join(",")})`)
          : bookingQuery.eq(ownerColumn, userId);
        bookingQuery = bookingQuery.order(role === "provider" ? "created_at" : "starts_at", { ascending: false });
        if (role === "client" && moduleKey === "bookings") bookingQuery = bookingQuery.range(0, clientBookingPageSize);
        else bookingQuery = bookingQuery.limit(200);
        const { data, error: bookingError } = await bookingQuery;
        if (bookingError) throw bookingError;
        const queryRows = (data ?? []) as unknown as BookingQueryRow[];
        const rows = role === "client" && moduleKey === "bookings" ? queryRows.slice(0, clientBookingPageSize) : queryRows;
        const mappedBookings = rows.map((booking) => ({
          ...booking,
          provider_services: Array.isArray(booking.provider_services) ? booking.provider_services[0] ?? null : booking.provider_services,
        }));
        setBookings(mappedBookings);
        if (role === "client" && moduleKey === "bookings") {
          setBookingPage(0);
          setBookingsHaveMore(queryRows.length > clientBookingPageSize);
          setClientBookingItems(await decorateClientBookings(rows));
          const activeItems: BookingQueryRow[] = [];
          const now = new Date().toISOString();
          for (let offset = 0; ; offset += clientBookingPageSize) {
            const { data: activeData, error: activeError } = await supabase.from("bookings")
              .select("id,provider_id,provider_service_id,starts_at,ends_at,status,total_amount,currency,location_mode,appointment_address,collaborator_name,collaborator_avatar_url,provider_services(title,duration_minutes,business_id,is_active,archived_at)")
              .eq("client_id", userId).in("status", ["pending", "confirmed", "in_progress"])
              .or(`ends_at.gte.${now},status.eq.in_progress`).order("starts_at", { ascending: true })
              .range(offset, offset + clientBookingPageSize - 1);
            if (activeError) throw activeError;
            const batch = (activeData ?? []) as unknown as BookingQueryRow[];
            activeItems.push(...batch);
            if (batch.length < clientBookingPageSize) break;
          }
          setActiveClientBookingItems(await decorateClientBookings(activeItems));
          const [upcomingCount, pendingCount, pastCount] = await Promise.all([
            supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", userId).in("status", ["confirmed", "in_progress"]).or(`ends_at.gte.${now},status.eq.in_progress`),
            supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", userId).eq("status", "pending").gte("ends_at", now),
            supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", userId).lt("ends_at", now).neq("status", "in_progress"),
          ]);
          const countsError = upcomingCount.error ?? pendingCount.error ?? pastCount.error;
          if (countsError) throw countsError;
          setClientBookingStats({ upcoming: upcomingCount.count ?? 0, pending: pendingCount.count ?? 0, past: pastCount.count ?? 0 });
        } else {
          setClientBookingItems([]);
          setActiveClientBookingItems([]);
          setClientBookingStats({ upcoming: 0, pending: 0, past: 0 });
          setBookingsHaveMore(false);
        }

        if (role === "client") {
          const [accountResult, clientResult] = await Promise.all([
            supabase.rpc("get_my_private_profile"),
            supabase.from("client_profiles").select("city,default_address,preferences").eq("profile_id", userId).single(),
          ]);
          if (accountResult.error) throw accountResult.error;
          if (clientResult.error) throw clientResult.error;
          setClientProfile({ ...accountResult.data, ...clientResult.data } as ClientAccountRow);
        }

        if (role === "provider") {
          const businessIds = [...new Set(mappedBookings.map((booking) => booking.provider_services?.business_id).filter((id): id is string => Boolean(id)))];
          const [profileResult, serviceResult, ownResult, businessResult] = await Promise.all([
            supabase
              .from("provider_profiles")
              .select("profile_id,business_name,bio,city,country_code,region,timezone,currency,service_mode,status,activity_type,years_experience,base_address,languages,cancellation_policy,onboarding_progress")
              .eq("profile_id", userId)
              .maybeSingle(),
            supabase.from("services").select("id,name").eq("is_active", true).order("name"),
            supabase.from("provider_services").select("id,business_id,service_id,title,description,price_amount,duration_minutes,currency,deposit_percentage,is_active,archived_at,updated_at").eq("provider_id", userId).is("archived_at", null).order("title"),
            businessIds.length ? supabase.from("businesses").select("id,timezone").in("id", businessIds) : Promise.resolve({ data: [], error: null }),
          ]);
          if (profileResult.error) throw profileResult.error;
          if (serviceResult.error) throw serviceResult.error;
          if (businessResult.error) throw businessResult.error;
          setBusinessTimeZones(Object.fromEntries((businessResult.data ?? []).map((business: { id: string; timezone: string | null }) => [business.id, business.timezone])));
          setProviderProfile(profileResult.data as ProviderProfileRow | null);
          setBaseServices((serviceResult.data ?? []) as BaseServiceRow[]);
          if (ownResult.error) throw ownResult.error;
          setOwnServices(ownResult.data ?? []);
        }
      }
      const { data: notificationData, error: notificationError } = await supabase
        .from("notifications")
        .select("id,title,body,read_at,created_at")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (notificationError) throw notificationError;
      setNotifications((notificationData ?? []) as NotificationRow[]);
    } catch (caught) {
      setError(publicErrorMessage(caught, "Impossible de charger le tableau de bord."));
    } finally {
      setLoading(false);
    }
  }, [moduleKey, role, userId]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  useEffect(() => {
    if (role === "admin") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let reloadTimer: number | undefined;
    const channel = supabase.channel(`client-bookings:${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bookings",
        ...(role === "client" ? { filter: `client_id=eq.${userId}` } : {}),
      }, () => {
        if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
        reloadTimer = window.setTimeout(() => void load(), 150);
      })
      .subscribe();
    const refreshFallback = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      window.clearInterval(refreshFallback);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [load, moduleKey, role, userId]);

  useEffect(() => {
    if (!loading && window.location.hash.startsWith("#booking-")) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [loading, bookings]);

  const metrics = useMemo(() => {
    if (role === "admin") {
      return [
        [String(adminMetrics.users), "Utilisateurs"],
        [String(adminMetrics.providersPending), "Validations en attente"],
        [String(adminMetrics.reportsOpen), "Signalements ouverts"],
      ];
    }
    const confirmed = bookings.filter((booking) => booking.status === "confirmed").length;
    const completed = bookings.filter((booking) => booking.status === "completed");
    const revenue = Object.entries(completed.reduce<Record<string, number>>((sum, booking) => ({ ...sum, [booking.currency]: (sum[booking.currency] ?? 0) + booking.total_amount }), {}))
      .map(([currency, amount]) => formatServiceMoney(amount, currency)).join(" · ") || "—";
    return role === "provider"
      ? [[String(bookings.length), "Réservations"], [String(confirmed), "Confirmées"], [revenue, "Revenus théoriques"]]
      : [[String(bookings.filter((booking) => new Date(booking.starts_at) >= new Date()).length), "À venir"], [String(completed.length), "Terminées"], [String(notifications.filter((item) => !item.read_at).length), "Notifications non lues"]];
  }, [adminMetrics, bookings, notifications, role]);

  async function updateStatus(booking: BookingRow, status: BookingStatus) {
    if (!canTransitionBooking(booking.status, status)) {
      setFeedback("Cette transition de statut est interdite.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setFeedback("");
    const { data: updated, error: updateError } = await supabase.from("bookings").update({ status }).eq("id", booking.id).eq("status", booking.status).select("id").maybeSingle();
    if (updateError || !updated) {
      setFeedback(publicErrorMessage(updateError, "La réservation a changé ou n’est plus accessible. Actualisez la liste."));
      return;
    }
    setFeedback("Réservation mise à jour.");
    await load();
  }

  async function cancelClientBooking(booking: ClientBookingItem) {
    if (!canTransitionBooking(booking.status, "cancelled_by_client")) {
      setFeedback("Cette réservation ne peut plus être annulée depuis votre espace.");
      return false;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return false;
    const { data: updated, error: updateError } = await supabase.from("bookings").update({ status: "cancelled_by_client" }).eq("id", booking.id).eq("client_id", userId).in("status", ["pending", "confirmed"]).select("id").maybeSingle();
    if (updateError || !updated) {
      setFeedback(publicErrorMessage(updateError, "La réservation n’a pas pu être annulée."));
      return false;
    }
    setFeedback("Votre rendez-vous a été annulé.");
    setPendingCancellation(null);
    await load();
    return true;
  }

  async function saveProviderProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const formData = new FormData(event.currentTarget);
    const businessName = String(formData.get("businessName") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const serviceMode = String(formData.get("serviceMode") ?? "salon");
    const activityType = String(formData.get("activityType") ?? "independent");
    const yearsExperience = Number(formData.get("yearsExperience"));
    const baseAddress = String(formData.get("baseAddress") ?? "").trim();
    const languages = String(formData.get("languages") ?? "fr").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const cancellationPolicy = String(formData.get("cancellationPolicy") ?? "").trim();
    if (!businessName || !city || !["salon", "mobile", "both"].includes(serviceMode)) {
      setFeedback("Le nom, la ville et le mode de prestation sont obligatoires.");
      return;
    }
    const { data: progress, error: updateError } = await supabase.rpc("save_professional_onboarding", {
      target_business_name: businessName, target_bio: bio, target_city: city, target_service_mode: serviceMode,
      target_activity_type: activityType, target_years_experience: yearsExperience, target_base_address: baseAddress,
      target_languages: languages, target_cancellation_policy: cancellationPolicy,
    });
    if (updateError) setFeedback(updateError.message);
    else {
      setFeedback(`Brouillon enregistré · progression ${progress ?? 0} %.`);
      await load();
    }
  }

  async function saveClientProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const formData = new FormData(event.currentTarget);
    const preferences = String(formData.get("preferences") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const { error: updateError } = await supabase.rpc("save_client_profile", {
      target_first_name: String(formData.get("firstName") ?? ""), target_last_name: String(formData.get("lastName") ?? ""),
      target_phone: String(formData.get("phone") ?? ""), target_city: String(formData.get("city") ?? ""),
      target_address: String(formData.get("address") ?? ""), target_preferences: { categories: preferences },
      target_marketing_consent: formData.get("marketingConsent") === "on",
    });
    if (updateError) setFeedback(updateError.message);
    else { setFeedback("Votre profil client est enregistré."); await load(); }
  }

  async function submitProviderForReview() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: rpcError } = await supabase.rpc("submit_provider_for_review");
    if (rpcError) setFeedback(rpcError.message);
    else {
      setFeedback("Votre profil a été envoyé à l’équipe Mata Beauty.");
      await load();
    }
  }

  async function addProviderService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (servicePending.current) return;
    if (!activityLocationReady(providerProfile)) { setFeedback("Enregistrez le pays, le fuseau horaire et la devise dans le bloc juste au-dessus du formulaire."); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !providerProfile?.currency) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const details = { serviceId: String(values.get("serviceId") ?? ""), title: String(values.get("title") ?? "").trim(), durationMinutes: Number(values.get("durationMinutes")), priceAmount: Number(values.get("priceAmount")) };
    const invalid = serviceDetailsError(details);
    if (invalid) { setFeedback(invalid); return; }
    servicePending.current = true; setSavingService(true); setFeedback("");
    try {
      const { error } = await supabase.from("provider_services").insert({ provider_id: userId, service_id: details.serviceId, title: details.title, duration_minutes: details.durationMinutes, price_amount: details.priceAmount, currency: providerProfile.currency });
      if (error) throw error;
      form.reset(); setFeedback("Prestation ajoutée."); await load();
    } catch (error) { setFeedback(publicErrorMessage(error, "La prestation n’a pas été créée. Vos champs sont conservés ; vérifiez les réglages et réessayez.")); }
    finally { servicePending.current = false; setSavingService(false); }
  }

  async function moderateProvider(profileId: string, decision: "approved" | "rejected") {
    const action = decision === "approved" ? "approuver" : "refuser";
    if (!window.confirm(`Confirmer : ${action} ce profil prestataire ?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("provider_profiles")
      .update({ status: decision, verified_at: decision === "approved" ? new Date().toISOString() : null })
      .eq("profile_id", profileId)
      .eq("status", "pending_review");
    if (updateError) setFeedback(updateError.message);
    else {
      setFeedback(decision === "approved" ? "Prestataire approuvé et publié." : "Profil renvoyé pour correction.");
      await load();
    }
  }

  const show = (...keys: string[]) => !moduleKey || keys.includes(moduleKey);
  const DashboardContainer = moduleKey ? "section" : "main";

  return (
    <DashboardContainer className={moduleKey ? "focused-dashboard" : "dashboard"}>
      {!moduleKey && <aside className="sidebar">
        <button className="brand brand-button" onClick={onBack}><span className="brand-mark">M</span><span>Mata <i>Beauty</i></span></button>
        <p className="role-pill">Espace {role}</p>
        <nav>
          <button className="active" onClick={() => void load()}>⌂ Vue d’ensemble</button>
          {role !== "admin" && <button onClick={() => document.getElementById("live-bookings")?.scrollIntoView({ behavior: "smooth" })}>▣ Réservations</button>}
          {role !== "admin" && <button onClick={() => document.getElementById(messageBooking ? "booking-conversation" : "live-bookings")?.scrollIntoView({ behavior: "smooth" })}>✉ Messages</button>}
          <button onClick={() => document.getElementById("live-notifications")?.scrollIntoView({ behavior: "smooth" })}>◌ Notifications <i>{notifications.filter((item) => !item.read_at).length}</i></button>
        </nav>
        <button className="back-link" onClick={() => void onSignOut()}>Se déconnecter</button>
      </aside>}
      {pendingCancellation && <BookingCancellationDialog serviceName={pendingCancellation.serviceName} providerName={pendingCancellation.providerName} onDismiss={() => setPendingCancellation(null)} onConfirm={() => cancelClientBooking(pendingCancellation)} />}
      <section className="dashboard-main">
        {show("dashboard") && <><div className="dashboard-top">
          <div><p className="eyebrow">Votre activité</p><h1>{displayName ? `Bonjour, ${displayName}` : "Mon activité"}</h1><p>Retrouvez vos rendez-vous et vos prochaines étapes.</p></div>
          <span className="live-badge">Connecté</span>
        </div>
        </>}
        {feedback && <p className="dashboard-feedback" role="status">{feedback}</p>}
        {error && <div className="dashboard-error" role="alert"><p>{error}</p><button className="outline-button" onClick={() => void load()}>Réessayer</button></div>}
        {show("dashboard") && (loading ? (
          <div className="metric-grid" role="status" aria-label="Chargement"><article className="skeleton-card" /><article className="skeleton-card" /><article className="skeleton-card" /></div>
        ) : (
          <><div className="metric-grid">{metrics.map(([value, label]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>{role === "provider" && <p className="dashboard-scope-note">Indicateurs calculés sur les 200 réservations les plus récentes chargées. Les revenus théoriques ne sont pas un solde encaissé.</p>}</>
        ))}
        {role === "client" && show("profile") && <ClientControlCenter userId={userId} />}
        {role === "client" && !moduleKey && <ReferralCard type="client" />}
        {role === "client" && !moduleKey && clientProfile && <details className="panel onboarding-panel legacy-profile-form"><summary>Informations rapides</summary><article>
          <div className="panel-heading"><div><h2>Mon profil beauté</h2><p>Ces informations personnalisent vos recommandations et vos rendez-vous.</p></div></div>
          <form className="dashboard-form" onSubmit={(event) => void saveClientProfile(event)}>
            <label>Prénom<input name="firstName" required minLength={2} defaultValue={clientProfile.first_name ?? ""} /></label>
            <label>Nom<input name="lastName" required minLength={2} defaultValue={clientProfile.last_name ?? ""} /></label>
            <label>Téléphone<input name="phone" type="tel" autoComplete="tel" defaultValue={clientProfile.phone ?? ""} placeholder="+221 77 000 00 00" /></label>
            <label>Ville<input name="city" autoComplete="address-level2" defaultValue={clientProfile.city ?? ""} /></label>
            <label className="wide">Adresse habituelle<input name="address" autoComplete="street-address" defaultValue={clientProfile.default_address ?? ""} /></label>
            <label className="wide">Préférences beauté, séparées par des virgules<input name="preferences" defaultValue={Array.isArray(clientProfile.preferences.categories) ? clientProfile.preferences.categories.join(", ") : ""} placeholder="Tresses, soins du visage, maquillage" /></label>
            <label className="wide legal-consent"><input name="marketingConsent" type="checkbox" defaultChecked={clientProfile.marketing_consent} /><span>Recevoir les nouveautés des professionnels suivis. Facultatif.</span></label>
            <button className="primary-button" type="submit">Enregistrer mon profil</button>
          </form>
        </article></details>}
        {role === "client" && show("inspirations") && <SocialDashboard role="client" userId={userId} />}

        {role === "provider" && providerProfile && (
          <>
          {show("dashboard") && <ProviderLaunchChecklist userId={userId} />}
          {!moduleKey && <ReferralCard type="provider" />}
          {!moduleKey && <VideoPublisher userId={userId} providerApproved={providerProfile.status === "approved"} onPublished={load} />}
          {show("statistics") && <SocialDashboard role="provider" userId={userId} />}
          {show("public-profile", "services") && <article className="panel onboarding-panel">
            {show("public-profile") && <><div className="panel-heading">
              <div><h2>Profil professionnel</h2>{providerProfile.status === "pending_review" && <p>Votre demande est en cours de validation. Vous pouvez préparer vos prestations, vos disponibilités et vos brouillons.</p>}<Link href="/salon/profile">Informations de mon salon</Link><p className={`provider-state ${providerProfile.status}`}>{providerStatusLabels[providerProfile.status]}</p><label>Progression {providerProfile.onboarding_progress} %<progress value={providerProfile.onboarding_progress} max="100" /></label></div>
              {["draft", "rejected"].includes(providerProfile.status) && <button className="outline-button" disabled={providerProfile.onboarding_progress < 100} onClick={() => void submitProviderForReview()}>Envoyer pour validation</button>}
            </div>
            <form className="dashboard-form" onSubmit={(event) => void saveProviderProfile(event)}>
              <label>Nom commercial<input name="businessName" required defaultValue={providerProfile.business_name} /></label>
              <label>Ville<input name="city" required defaultValue={providerProfile.city} /></label>
              <label>Mode de prestation<select name="serviceMode" defaultValue={providerProfile.service_mode}><option value="salon">En salon</option><option value="mobile">À domicile</option><option value="both">Salon et domicile</option></select></label>
              <label>Type d’activité<select name="activityType" defaultValue={providerProfile.activity_type}><option value="independent">Indépendant</option><option value="salon">Salon</option><option value="barber_shop">Barber shop</option><option value="makeup_artist">Maquilleur</option><option value="hairdresser">Coiffeur</option><option value="nail_artist">Prothésiste ongulaire</option><option value="esthetician">Esthéticienne</option><option value="care_specialist">Spécialiste soins</option><option value="other">Autre</option></select></label>
              <label>Années d’expérience<input name="yearsExperience" type="number" min={0} max={80} defaultValue={providerProfile.years_experience} /></label>
              <label className="wide">Adresse professionnelle<input name="baseAddress" defaultValue={providerProfile.base_address ?? ""} /></label>
              <label className="wide">Langues, séparées par des virgules<input name="languages" defaultValue={providerProfile.languages.join(", ")} /></label>
              <label className="wide">Présentation (40 caractères minimum avant validation)<textarea name="bio" rows={4} defaultValue={providerProfile.bio ?? ""} /></label>
              <label className="wide">Politique d’annulation (20 caractères minimum)<textarea name="cancellationPolicy" rows={3} defaultValue={providerProfile.cancellation_policy ?? ""} /></label>
              <button className="primary-button" type="submit">Enregistrer le profil</button>
            </form>
            <ProviderLogoEditor userId={userId} /><ProfessionalDocuments providerId={userId} /></>}
            {show("services") && <><h2>Mes prestations</h2>{!loading && !ownServices.length && <p>Créez votre première prestation.</p>}{ownServices.map((service) => <ServiceEditor key={service.id} service={service} catalog={baseServices} userId={userId} businessId={service.business_id ?? undefined} activityCurrency={service.business_id ? null : providerProfile?.currency ?? null} onSaved={value => setOwnServices(current => current.map(item => item.id === value.id ? value : item))} onRemoved={id => { setOwnServices(current => current.filter(item => item.id !== id)); setFeedback("Prestation supprimée du catalogue. Les réservations existantes sont conservées."); }} />)}<Link href="/pro/videos">Retour au Studio</Link>{providerProfile && <ActivityLocationSettings value={providerProfile} onSaved={value => setProviderProfile(current => current ? { ...current, ...value } : current)} />}<form className="dashboard-form service-form" onSubmit={(event) => void addProviderService(event)}>
              <h3 className="wide">Ajouter une prestation</h3>
              <label>Type<select name="serviceId" required defaultValue=""><option value="" disabled>Choisir</option>{baseServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
              <label>Nom de votre prestation<input name="title" required minLength={2} maxLength={120} placeholder="Ex. : Tresses personnalisées" /></label>
              <label>Durée au choix (minutes)<input name="durationMinutes" type="number" inputMode="numeric" required min={15} max={720} step={1} aria-describedby="service-duration-help" /><small id="service-duration-help">De 15 à 720 minutes, à la minute près.</small></label>
              <label>Prix ({providerProfile?.currency ?? "devise à définir"})<input name="priceAmount" type="number" required min={0} step={1} disabled={!activityLocationReady(providerProfile)} /></label>
              <button className="primary-button" type="submit" disabled={!activityLocationReady(providerProfile) || savingService}>{savingService ? "Enregistrement…" : "Ajouter la prestation"}</button>{!activityLocationReady(providerProfile) && <p className="wide" role="status">Pour activer le prix et valider, enregistrez les réglages de votre activité juste au-dessus. Le nom et la durée restent dans ce formulaire.</p>}
            </form></>}
          </article>}
          </>
        )}

        {role === "admin" && (
          <article className="panel" id="provider-moderation">
            <div className="panel-heading"><h2>Prestataires à valider</h2><button onClick={() => void load()}>Actualiser</button></div>
            {!loading && pendingProviders.length === 0 && <div className="compact-empty">Aucun dossier en attente.</div>}
            {pendingProviders.map((provider) => (
              <div className="moderation-row" key={provider.profile_id}>
                <div><strong>{provider.business_name}</strong><small>{provider.city} · envoyé le {new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium" }).format(new Date(provider.created_at))}</small></div>
                <div className="appointment-actions">
                  <button onClick={() => void moderateProvider(provider.profile_id, "approved")}>Approuver</button>
                  <button onClick={() => void moderateProvider(provider.profile_id, "rejected")}>À corriger</button>
                </div>
              </div>
            ))}
          </article>
        )}

        {role === "client" && moduleKey === "bookings" && (
          <article className="panel" id="live-bookings">
            <div className="panel-heading"><div><h2>Mes réservations</h2><p>Une carte par salon ou professionnel, avec l’historique complet de vos rendez-vous.</p></div><button onClick={() => void load()}>Actualiser</button></div>
            {loading ? <div className="compact-empty" role="status">Chargement de vos réservations…</div> : <ClientBookingGroups items={[...activeClientBookingItems, ...clientBookingItems]} clientId={userId} stats={clientBookingStats} hasMore={bookingsHaveMore} loadingMore={loadingMoreBookings} onLoadMore={() => void loadMoreClientBookings()} onCancel={setPendingCancellation} onMessage={(booking) => { setMessageBooking({ id: booking.id, serviceTitle: booking.serviceName }); window.setTimeout(() => document.getElementById("booking-conversation")?.scrollIntoView({ behavior: "smooth" }), 0); }} />}
            {bookingsHaveMore && <button className="client-booking-load-more" type="button" onClick={() => void loadMoreClientBookings()} disabled={loadingMoreBookings}>{loadingMoreBookings ? "Chargement…" : "Charger les rendez-vous plus anciens"}</button>}
          </article>
        )}
        {role !== "admin" && !(role === "client" && moduleKey === "bookings") && show("dashboard", "bookings") && (
          <article className="panel" id="live-bookings">
            <div className="panel-heading"><h2>Réservations</h2><button onClick={() => void load()}>Actualiser</button></div>
            {role === "provider" && <p>Les 200 réservations créées le plus récemment sont affichées, tous statuts confondus. L’agenda permet de consulter une période précise.</p>}
            {!loading && bookings.length === 0 && <div className="compact-empty">Aucun rendez-vous pour le moment.</div>}
            {bookings.map((booking) => {
              const timeZone = bookingTimeZone(booking.provider_services?.business_id ? businessTimeZones[booking.provider_services.business_id] : null, providerProfile?.timezone, providerProfile?.country_code);
              return (
              <div className="appointment live-appointment" key={booking.id} id={`booking-${booking.id}`}>
                <span className="date-block">{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", ...(role === "provider" ? { timeZone } : {}) }).format(new Date(booking.starts_at))}</span>
                <div>
                  <strong>{booking.provider_services?.title ?? "Prestation beauté"}</strong>
                  {booking.collaborator_name && <small>{booking.collaborator_avatar_url && <Image unoptimized src={booking.collaborator_avatar_url} alt="" width={36} height={36} />} Prestation assurée par {booking.collaborator_name}</small>}
                  {role === "provider" && booking.status === "completed" && <BookingFeedback bookingId={booking.id} direction="provider_to_client" />}
                  {role === "client" && booking.status === "completed" && <BookingReview bookingId={booking.id} clientId={userId} providerId={booking.provider_id} performer={booking.collaborator_name} />}
                  <small>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: role === "provider" ? timeZone : undefined }).format(new Date(booking.starts_at))}{role === "provider" && ` · ${timeZone}`} · {Math.round((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60000)} min</small>
                  <small>{booking.location_mode === "client_address" ? booking.appointment_address : "Chez le professionnel"} · {booking.total_amount.toLocaleString("fr-FR")} {booking.currency}</small>
                </div>
                <span className={booking.status === "confirmed" ? "status confirmed" : "status pending"}>{{ pending: "En attente", confirmed: "Confirmé", in_progress: "En cours", completed: "Terminé", declined: "Refusé", cancelled_by_client: "Annulé", cancelled_by_provider: "Annulé", no_show: "Absence", disputed: "Litige" }[booking.status] ?? "Rendez-vous"}</span>
                <div className="appointment-actions">
                  {role === "provider" && ["pending","confirmed"].includes(booking.status) && <BookingReschedule bookingId={booking.id} timeZone={timeZone} onSaved={load} />}
                  {role === "provider" && booking.status === "pending" && <>
                    <button onClick={() => void updateStatus(booking, "confirmed")}>Accepter</button>
                    <button onClick={() => void updateStatus(booking, "declined")}>Refuser</button>
                  </>}
                  {role === "provider" && booking.status === "confirmed" && <button onClick={() => void updateStatus(booking, "in_progress")}>Démarrer</button>}
                  {role === "provider" && booking.status === "in_progress" && <button onClick={() => void updateStatus(booking, "completed")}>Terminer</button>}
                  {role === "client" && ["pending", "confirmed"].includes(booking.status) && <button onClick={() => void updateStatus(booking, "cancelled_by_client")}>Annuler</button>}
                  <button onClick={() => {
                    setMessageBooking({ id: booking.id, serviceTitle: booking.provider_services?.title ?? "Rendez-vous" });
                    window.setTimeout(() => document.getElementById("booking-conversation")?.scrollIntoView({ behavior: "smooth" }), 0);
                  }}>Messages</button>
                </div>
              </div>
              );
            })}
          </article>
        )}
        {role !== "admin" && messageBooking && (
          <BookingMessages
            key={messageBooking.id}
            bookingId={messageBooking.id}
            serviceTitle={messageBooking.serviceTitle}
            userId={userId}
            onClose={() => setMessageBooking(null)}
          />
        )}
        {show("notifications") && <article className="panel notifications-panel" id="live-notifications"><NotificationCenter userId={userId} /></article>}
      </section>
    </DashboardContainer>
  );
}

