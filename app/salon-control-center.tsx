"use client";
import { ServiceDurationInput } from "./service-duration-input";
import { TariffPhotoImport } from "./tariff-photo-import";
import { ServiceReferenceField } from "./service-reference-field";
import { serviceReference } from "@/lib/domain/service-reference";
import { SalonHome } from "./salon-home";
import { PhoneInput } from "./phone-input";
import { ProviderReviewBookings } from "./provider-review-bookings";
import { latestRefresh } from "@/lib/ui/latest-refresh";
import { loadSalonBookings } from "@/lib/domain/salon-bookings";
import { BookingReschedule } from "./booking-reschedule";
import { BookingFeedback } from "./booking-feedback";

import Image from "next/image";
import { ServiceEditor } from "./service-editor";
import { ActivityLocationSettings } from "./activity-location-settings";
import { activityLocationReady, serviceDetailsError } from "@/lib/domain/service-creation";
import { formatServiceMoney } from "@/lib/domain/service-money";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceModule } from "@/lib/navigation/spaces";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasPublishedBusinessHours, validateWeeklyBusinessHours } from "@/lib/domain/business-hours";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { TeamManagement, TeamAgenda } from "./team-management";
import { localDateAt, localDateTimeInputToInstant } from "@/lib/domain/time-zone";
import { SUPPORTED_COUNTRIES, SUPPORTED_TIME_ZONES } from "@/lib/domain/international";

type Business = { id: string; name: string; slug: string; description: string | null; phone: string | null; address: string; city: string; area: string | null; country_code: string | null; region: string | null; timezone: string | null; currency: string | null; latitude: number | null; longitude: number | null; logo_url: string | null; cover_url: string | null; status: string; is_active: boolean; archived_at: string | null };
type Service = { id: string; service_id: string; title: string; description: string | null; duration_minutes: number; price_amount: number; currency: string; is_active: boolean; archived_at: string | null; updated_at: string };
type Collaborator = { id: string; display_name: string; title: string | null; is_bookable: boolean; is_active: boolean; archived_at: string | null };
type Booking = { id: string; starts_at: string; ends_at: string; status: string; total_amount: number; currency: string; collaborator_id: string | null; provider_service_id: string };
type Hours = { id: string; weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
type Closure = { id: string; starts_at: string; ends_at: string; reason: string | null };
type Media = { id: string; storage_path: string; media_type: string; sort_order: number };
type CatalogService = { id: string; name: string };
type Review = { id: string; rating: number; comment: string | null; provider_reply: string | null; created_at: string };

const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const supportedModules = new Set(["dashboard", "profile", "team", "services", "agenda", "bookings", "revenue", "statistics", "reviews", "portfolio", "settings"]);

export function SalonControlCenter({ module, userId, collaboratorAccessEnabled = false }: { module: WorkspaceModule; userId: string; collaboratorAccessEnabled?: boolean }) {
  const [businessChoices, setBusinessChoices] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [business, setBusiness] = useState<Business | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hours, setHours] = useState<Hours[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [feedback, setFeedback] = useState("");
  const [bookingRefreshError, setBookingRefreshError] = useState("");
  const [savingService, setSavingService] = useState(false);
  const servicePending = useRef(false);
  const [locating, setLocating] = useState(false);
  const businessForm = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setState("error"); setFeedback("Connexion indisponible. Réessayez."); return; }
    setState("loading");
    setBookingRefreshError("");
    try {
    const { data: businessData, error } = await supabase.from("businesses").select("id,name,slug,description,phone,address,city,area,country_code,region,timezone,currency,latitude,longitude,logo_url,cover_url,status,is_active,archived_at").eq("owner_id", userId).is("archived_at", null).order("created_at").abortSignal(AbortSignal.timeout(12000));
    if (error) { setState("error"); setFeedback(publicErrorMessage(error, "Le salon n’a pas pu être chargé.")); return; }
    const choices = (businessData ?? []) as Business[];
    setBusinessChoices(choices);
    const nextBusiness = (selectedBusinessId ? choices.find(item => item.id === selectedBusinessId) : choices[0]) ?? null; setBusiness(nextBusiness);
    const { data: catalogData } = await supabase.from("services").select("id,name").eq("is_active", true).order("name").abortSignal(AbortSignal.timeout(12000)); setCatalog((catalogData ?? []) as CatalogService[]);
    if (!nextBusiness) { setServices([]); setCollaborators([]); setBookings([]); setHours([]); setClosures([]); setMedia([]); setState("ready"); return; }
    const [serviceResult, collaboratorResult, bookingResult, hoursResult, closureResult, mediaResult, reviewResult] = await Promise.all([
      supabase.from("provider_services").select("id,service_id,title,description,duration_minutes,price_amount,currency,deposit_percentage,is_active,archived_at,updated_at").eq("business_id", nextBusiness.id).is("archived_at", null).order("title").abortSignal(AbortSignal.timeout(12000)),
      supabase.from(collaboratorAccessEnabled ? "collaborators_public" : "collaborators").select("id,display_name,title,is_bookable,is_active,archived_at").eq("business_id", nextBusiness.id).is("archived_at", null).order("display_name").abortSignal(AbortSignal.timeout(12000)),
      supabase.from("bookings").select("id,starts_at,ends_at,status,total_amount,currency,collaborator_id,provider_service_id").eq("business_id", nextBusiness.id).order("starts_at", { ascending: false }).limit(200).abortSignal(AbortSignal.timeout(12000)),
      supabase.from("business_hours").select("id,weekday,opens_at,closes_at,is_closed").eq("business_id", nextBusiness.id).order("weekday").abortSignal(AbortSignal.timeout(12000)),
      supabase.from("business_closures").select("id,starts_at,ends_at,reason").eq("business_id", nextBusiness.id).order("starts_at").abortSignal(AbortSignal.timeout(12000)),
      supabase.from("business_media").select("id,storage_path,media_type,sort_order").eq("business_id", nextBusiness.id).order("sort_order").abortSignal(AbortSignal.timeout(12000)),
      supabase.from("reviews").select("id,rating,comment,provider_reply,created_at").eq("provider_id", userId).eq("is_visible", true).order("created_at", { ascending: false }).abortSignal(AbortSignal.timeout(12000)),
    ]);
    const firstError = [serviceResult, collaboratorResult, bookingResult, hoursResult, closureResult, mediaResult, reviewResult].find((result) => result.error)?.error;
    if (firstError) { setState("error"); setFeedback(publicErrorMessage(firstError, "Certaines données du salon sont indisponibles.")); return; }
    setServices((serviceResult.data ?? []) as Service[]); setCollaborators((collaboratorResult.data ?? []) as Collaborator[]); setBookings((bookingResult.data ?? []) as Booking[]); setHours((hoursResult.data ?? []) as Hours[]); setClosures((closureResult.data ?? []) as Closure[]); setMedia((mediaResult.data ?? []) as Media[]); setReviews((reviewResult.data ?? []) as Review[]); setState("ready");
    } catch { setState("error"); setFeedback("Les données du salon n’ont pas pu être chargées. Réessayez."); }
  }, [userId, collaboratorAccessEnabled, selectedBusinessId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client || !business?.id || state !== "ready") return;
    // Background booking updates must not unmount profile/service editors.
    const businessId = business.id;
    let timer: number | undefined;
    const updates = latestRefresh(
      signal => loadSalonBookings(client, businessId, AbortSignal.any([signal, AbortSignal.timeout(12000)])),
      data => { setBookings(data); setBookingRefreshError(""); },
      () => setBookingRefreshError("Les réservations n’ont pas pu être actualisées. Les dernières données chargées sont conservées."),
    );
    const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void updates.refresh(), 150); };
    const channel = client.channel(`salon-bookings:${businessId}`).on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `business_id=eq.${businessId}` }, refresh).subscribe();
    const fallback = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { updates.stop(); window.clearTimeout(timer); window.clearInterval(fallback); window.removeEventListener("focus", refresh); void client.removeChannel(channel); };
  }, [business?.id, state]);
  const salonPicker = <>{bookingRefreshError && <p role="status">{bookingRefreshError}</p>}{businessChoices.length > 1 ? <label>Salon actif<select aria-label="Salon actif" value={business?.id ?? selectedBusinessId} onChange={event => setSelectedBusinessId(event.target.value)}>{businessChoices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}</>;
  const timezone = business?.timezone ?? (business?.country_code === "SN" ? "Africa/Dakar" : "UTC");
  const existingServiceCurrencies = [...new Set(services.map((service) => service.currency).filter(Boolean))];
  const profileCurrency = business?.currency ?? (existingServiceCurrencies.length === 1 ? existingServiceCurrencies[0] : "");
  const today = useMemo(() => bookings.filter((booking) => localDateAt(new Date(booking.starts_at), timezone) === localDateAt(new Date(), timezone)), [bookings, timezone]);
  const revenue = useMemo(() => Object.entries(bookings.filter((booking) => ["completed", "confirmed"].includes(booking.status)).reduce<Record<string, number>>((sum, booking) => ({ ...sum, [booking.currency]: (sum[booking.currency] ?? 0) + booking.total_amount }), {})).map(([currency, amount]) => money(amount, currency)).join(" · ") || "—", [bookings]);

  async function submitBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const form = event.currentTarget; const values = new FormData(form); const name = String(values.get("name") ?? "").trim();
    const latitude = numberOrNull(values, "latitude"), longitude = numberOrNull(values, "longitude");
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (latitude < -90 || latitude > 90)) || (longitude !== null && (longitude < -180 || longitude > 180))) { setFeedback("Vérifiez les coordonnées : latitude entre −90 et 90, longitude entre −180 et 180. Les deux doivent être renseignées ensemble."); return; }
    const payload = { owner_id: userId, name, slug: business?.slug ?? `${slugify(name)}-${userId.slice(0, 6)}`, description: nullable(values, "description"), phone: nullable(values, "phone"), address: String(values.get("address") ?? "").trim(), city: String(values.get("city") ?? "").trim(), area: nullable(values, "area"), country_code: String(values.get("countryCode") ?? "").trim().toUpperCase(), region: nullable(values, "region"), timezone: String(values.get("timezone") ?? ""), currency: String(values.get("currency") ?? ""), latitude, longitude };
    const result = business ? await supabase.from("businesses").update(payload).eq("id", business.id).eq("owner_id", userId).select("id").maybeSingle() : await supabase.from("businesses").insert({ ...payload, business_type: "salon", status: "draft" }).select("id").maybeSingle();
    setFeedback(result.error || !result.data ? publicErrorMessage(result.error, "Le salon a changé ou n’est plus accessible. Enregistrement non confirmé.") : "Informations du salon enregistrées."); if (!result.error && result.data) await load();
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setFeedback("La géolocalisation n’est pas disponible dans ce navigateur."); return; }
    setLocating(true); setFeedback("");
    navigator.geolocation.getCurrentPosition(position => {
      const form = businessForm.current;
      if (form) {
        (form.elements.namedItem("latitude") as HTMLInputElement).value = position.coords.latitude.toFixed(6);
        (form.elements.namedItem("longitude") as HTMLInputElement).value = position.coords.longitude.toFixed(6);
      }
      setLocating(false); setFeedback("Position ajoutée au formulaire. Enregistrez le profil pour la publier.");
    }, error => {
      setLocating(false);
      setFeedback(error.code === error.PERMISSION_DENIED ? "Localisation refusée. Saisissez l’adresse et les coordonnées manuellement." : error.code === error.TIMEOUT ? "La localisation prend trop de temps. Réessayez ou saisissez les coordonnées manuellement." : "Position indisponible. Vérifiez les réglages de localisation ou saisissez les coordonnées manuellement.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!business || servicePending.current) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const form = event.currentTarget; const values = new FormData(form);
    if (!activityLocationReady(business) || !business.currency) { setFeedback("Enregistrez le pays, le fuseau horaire et la devise dans le bloc au-dessus du formulaire."); return; }
    const details = { serviceId: serviceReference(values.get("serviceId"), catalog), title: String(values.get("title") ?? "").trim(), durationMinutes: Number(values.get("duration")), priceAmount: Number(values.get("price")) };
    const invalid = serviceDetailsError(details); if (invalid) { setFeedback(invalid); return; }
    servicePending.current = true; setSavingService(true); setFeedback("");
    try {
      const active = hasPublishedBusinessHours(hours);
      const payload = { provider_id: userId, business_id: business.id, service_id: details.serviceId, title: details.title, description: nullable(values, "description"), duration_minutes: details.durationMinutes, price_amount: details.priceAmount, currency: business.currency, is_active: active };
      let { error } = await supabase.from("provider_services").insert({ ...payload, status: active ? "published" : "draft" });
      // Legacy Test has no commercial status column; retry only its explicit schema-cache rejection.
      if (error?.code === "PGRST204" && /['"]status['"]/i.test(error.message)) ({ error } = await supabase.from("provider_services").insert(payload));
      if (error) throw error;
      form.reset(); setFeedback(active ? "Prestation ajoutée au catalogue du salon." : "Prestation enregistrée en brouillon. Publiez vos horaires pour l’activer."); await load();
    } catch (error) { setFeedback(publicErrorMessage(error, "La prestation n’a pas été créée. Vos champs sont conservés ; vérifiez les réglages et réessayez.")); }
    finally { servicePending.current = false; setSavingService(false); }
  }

  async function toggleService(service: Service) {
    if (!business) return;
    if (!service.is_active && !hasPublishedBusinessHours(hours)) { setFeedback("Publiez au moins un horaire d’ouverture avant d’activer une prestation."); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { data, error } = await supabase.from("provider_services").update({ is_active: !service.is_active }).eq("id", service.id).eq("business_id", business.id).eq("provider_id", userId).eq("is_active", service.is_active).eq("updated_at", service.updated_at).is("archived_at", null).select("id").maybeSingle();
    setFeedback(error || !data ? publicErrorMessage(error, "La prestation a changé ou n’est plus accessible. Actualisez la liste.") : "Prestation mise à jour."); if (!error && data) await load();
  }


  async function saveHours(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!business) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const form = event.currentTarget; const values = new FormData(form); const rows = days.map((_, weekday) => { const closed = values.get(`closed-${weekday}`) === "on"; return { business_id: business.id, weekday, is_closed: closed, opens_at: closed ? null : String(values.get(`open-${weekday}`) || "09:00"), closes_at: closed ? null : String(values.get(`close-${weekday}`) || "18:00") }; }); const validation = validateWeeklyBusinessHours(rows); if (validation) { setFeedback(validation); return; } const { error } = await supabase.from("business_hours").upsert(rows, { onConflict: "business_id,weekday" }); setFeedback(error ? publicErrorMessage(error, "Horaires non enregistrés.") : "Horaires enregistrés."); if (!error) await load(); }
  async function addClosure(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!business) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const form = event.currentTarget; const values = new FormData(form); try { const startsAt = localDateTimeInputToInstant(String(values.get("startsAt") ?? ""), timezone, "start"); const endsAt = localDateTimeInputToInstant(String(values.get("endsAt") ?? ""), timezone, "end"); if (endsAt <= startsAt) { setFeedback("La fin de fermeture doit suivre son début dans le fuseau du salon."); return; } const { error } = await supabase.from("business_closures").insert({ business_id: business.id, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), reason: nullable(values, "reason") }); setFeedback(error ? publicErrorMessage(error, "Fermeture non enregistrée.") : "Fermeture exceptionnelle ajoutée."); if (!error) { form.reset(); await load(); } } catch (error) { setFeedback(publicErrorMessage(error, "Vérifiez les horaires dans le fuseau du salon.")); } }
  async function removeClosure(id: string) {
    if (!business) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { data, error } = await supabase.from("business_closures").delete().eq("id", id).eq("business_id", business.id).select("id").maybeSingle();
    setFeedback(error || !data ? "La fermeture n’a pas pu être retirée. Actualisez la liste." : "Fermeture retirée."); if (!error && data) await load();
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!business) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const form = event.currentTarget; const values = new FormData(form); const file = values.get("file"); const mediaType = String(values.get("mediaType")); if (!(file instanceof File) || !file.size) return; if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) { setFeedback("Image JPEG, PNG ou WebP de 12 Mo maximum requise."); return; } const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"; const path = `${business.id}/${mediaType}-${crypto.randomUUID()}.${extension}`; const upload = await supabase.storage.from("business-media").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false }); if (upload.error) { setFeedback(publicErrorMessage(upload.error, "Envoi impossible.")); return; } const publicUrl = supabase.storage.from("business-media").getPublicUrl(path).data.publicUrl; const row = await supabase.from("business_media").insert({ business_id: business.id, storage_path: path, media_type: mediaType, sort_order: media.length }); if (!row.error && mediaType !== "gallery") { const published = await supabase.rpc("set_salon_brand_image", { target_business_id: business.id, target_kind: mediaType, target_url: publicUrl }); if (published.error || !published.data) { setFeedback("Image enregistrée dans le portfolio, mais le logo ou la couverture n’a pas pu être mis à jour."); await load(); return; } } if (row.error) { await supabase.storage.from("business-media").remove([path]); setFeedback("Le média n’a pas pu être enregistré."); } else { setFeedback("Média du salon mis à jour."); form.reset(); await load(); } }
  async function removeMedia(item: Media) {
    if (!business) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const url = supabase.storage.from("business-media").getPublicUrl(item.storage_path).data.publicUrl;
    if (url === business.logo_url || url === business.cover_url) { setFeedback("Remplacez d’abord le logo ou la couverture avant de retirer ce média."); return; }
    const { data, error } = await supabase.from("business_media").delete().eq("id", item.id).eq("business_id", business.id).select("id").maybeSingle();
    if (error || !data) { setFeedback("Le média n’a pas pu être retiré. Le fichier est conservé."); return; }
    const storage = await supabase.storage.from("business-media").remove([item.storage_path]);
    setFeedback(storage.error ? "Média retiré du portfolio. Le fichier n’a pas pu être supprimé." : "Média retiré."); await load();
  }
  async function updateBooking(id: string, status: "confirmed" | "in_progress" | "completed" | "cancelled_by_provider") {
    if (!business) return; const current = bookings.find(row => row.id === id); if (!current) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { data, error } = await supabase.from("bookings").update({ status }).eq("id", id).eq("business_id", business.id).eq("status", current.status).select("id").maybeSingle();
    setFeedback(error || !data ? publicErrorMessage(error, "La réservation a changé ou n’est plus accessible. Actualisez la liste.") : "Réservation mise à jour."); if (!error && data) await load();
  }

  if (state === "loading") return <section className="workspace-content">{salonPicker}<div className="workspace-empty">Chargement sécurisé du salon…</div></section>;
  if (state === "error") return <section className="workspace-content">{salonPicker}<div className="workspace-empty"><strong>Données indisponibles</strong><p>{feedback}</p><button onClick={() => { setFeedback(""); void load(); }}>Réessayer</button></div></section>;
  if (!business || module.key === "profile") return <section className="workspace-content">{salonPicker}<SalonHero title={business ? "Profil du salon" : "Créer votre salon"} description="Identité, coordonnées et localisation réellement publiées." />{feedback && <p className="salon-feedback" role="status">{feedback}</p>}<article className="workspace-panel salon-panel"><form ref={businessForm} className="salon-form" onSubmit={(event) => void submitBusiness(event)}><label>Nom<input name="name" required minLength={2} maxLength={120} defaultValue={business?.name ?? ""} /></label><PhoneInput key={business?.id ?? "new"} defaultValue={business?.phone} defaultCountry={business?.country_code}/><label className="wide">Description<textarea name="description" maxLength={3000} rows={4} defaultValue={business?.description ?? ""} /></label><label className="wide">Adresse<input name="address" required autoComplete="street-address" defaultValue={business?.address ?? ""} /></label><label>Ville<input name="city" required autoComplete="address-level2" defaultValue={business?.city ?? ""} /></label><label>Quartier / zone<input name="area" defaultValue={business?.area ?? ""} /></label><label>Pays<select name="countryCode" required defaultValue={business?.country_code ?? ""}><option value="">Choisir un pays</option>{SUPPORTED_COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label><label>Région / État<input name="region" maxLength={120} defaultValue={business?.region ?? ""} /></label><label>Fuseau horaire IANA<select name="timezone" required defaultValue={business?.timezone ?? ""}><option value="">Choisir un fuseau</option>{SUPPORTED_TIME_ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label><label>Devise des tarifs<select name="currency" required defaultValue={profileCurrency}><option value="">Choisir une devise</option><option value="XOF">XOF · Franc CFA</option><option value="EUR">EUR · Euro</option><option value="USD">USD · Dollar US</option><option value="GBP">GBP · Livre sterling</option><option value="CAD">CAD · Dollar canadien</option></select><small>Une devise différente est refusée tant que les prestations existantes utilisent l’ancienne devise; leurs montants ne sont jamais convertis automatiquement.</small></label><div className="salon-location-tools wide"><strong>Localisation du salon</strong><p>La position sert à situer l’établissement. Vous pouvez aussi renseigner les coordonnées manuellement.</p><button type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? "Recherche de la position…" : "Utiliser ma position"}</button></div><label>Latitude<input name="latitude" type="number" min="-90" max="90" step="0.000001" defaultValue={business?.latitude ?? ""} /></label><label>Longitude<input name="longitude" type="number" min="-180" max="180" step="0.000001" defaultValue={business?.longitude ?? ""} /></label><button className="salon-primary">{business ? "Enregistrer les modifications" : "Créer le salon"}</button></form></article></section>;

  if (module.key === "services") return <section className="workspace-content">{salonPicker}<SalonHero title="Prestations" description="Prix et durées sont enregistrés côté serveur et recopiés dans chaque réservation." />{feedback && <p className="salon-feedback" role="status">{feedback}</p>}<article className="workspace-panel salon-panel"><ActivityLocationSettings value={business} businessId={business.id} onSaved={value => setBusiness(current => current ? { ...current, ...value } : current)} /><TariffPhotoImport key={business.id} activate={hasPublishedBusinessHours(hours)} userId={userId} businessId={business.id} currency={activityLocationReady(business) ? business.currency : null} catalog={catalog} onSaved={load}/><form className="salon-form" onSubmit={(event) => void addService(event)}><ServiceReferenceField catalog={catalog}/><label>Nom de votre prestation<input name="title" required minLength={2} maxLength={120} placeholder="Ex. : Tresses personnalisées" /></label><ServiceDurationInput name="duration" /><label>Prix ({business.currency ?? "devise à définir"})<input name="price" type="number" min="0" max="10000000" step="1" disabled={!activityLocationReady(business)} required /></label><label className="wide">Description<textarea name="description" maxLength={2000} /></label><button className="salon-primary" type="submit" disabled={!activityLocationReady(business) || savingService}>{savingService ? "Enregistrement…" : "Ajouter la prestation"}</button>{!activityLocationReady(business) && <p className="wide" role="status">Pour activer le prix et valider, enregistrez les réglages de votre activité juste au-dessus. Le nom et la durée restent dans ce formulaire.</p>}</form><div className="salon-list">{services.map((service) => <section key={service.id}><ServiceEditor service={service} catalog={catalog} userId={userId} businessId={business.id} activityCurrency={business.currency} onSaved={value => setServices(current => current.map(item => item.id === value.id ? value : item))} onRemoved={id => { setServices(current => current.filter(item => item.id !== id)); setFeedback("Prestation supprimée du catalogue. Les réservations existantes sont conservées."); }} /><button onClick={() => void toggleService(service)}>{service.is_active ? "Désactiver" : "Activer"}</button></section>)}{services.length === 0 && <p>Aucune prestation. Ajoutez la première offre réservable.</p>}</div></article></section>;

  if (module.key === "team") return <section className="workspace-content">{salonPicker}<TeamManagement key={business.id} businessId={business.id} ownerId={userId} collaboratorAccessEnabled={collaboratorAccessEnabled} />{feedback && <p role="status">{feedback}</p>}</section>;

  if (module.key === "agenda") return <section className="workspace-content">{salonPicker}<TeamAgenda businessId={business.id} timeZone={timezone} /><SalonHero title="Agenda du salon" description="Horaires réguliers, fermetures exceptionnelles et rendez-vous réels." />{feedback && <p className="salon-feedback" role="status">{feedback}</p>}<div className="salon-two-columns"><article className="workspace-panel salon-panel"><h3>Horaires d’ouverture</h3><form onSubmit={(event) => void saveHours(event)}>{days.map((day, weekday) => { const current = hours.find((item) => item.weekday === weekday); return <div className="hours-row" key={day}><strong>{day}</strong><input aria-label={`Ouverture ${day}`} name={`open-${weekday}`} type="time" defaultValue={current?.opens_at?.slice(0, 5) ?? "09:00"} /><input aria-label={`Fermeture ${day}`} name={`close-${weekday}`} type="time" defaultValue={current?.closes_at?.slice(0, 5) ?? "18:00"} /><label><input name={`closed-${weekday}`} type="checkbox" defaultChecked={current?.is_closed ?? weekday === 0} /> Fermé</label></div>; })}<button className="salon-primary">Enregistrer les horaires</button></form></article><article className="workspace-panel salon-panel"><h3>Fermetures exceptionnelles</h3><form className="salon-form" onSubmit={(event) => void addClosure(event)}><label>Début<input name="startsAt" type="datetime-local" required /></label><label>Fin<input name="endsAt" type="datetime-local" required /></label><label className="wide">Motif<input name="reason" maxLength={240} /></label><button className="salon-primary">Ajouter</button></form><div className="salon-list">{closures.map((item) => <div key={item.id}><div><strong>{item.reason || "Fermeture"}</strong><small>{date(item.starts_at, timezone)} → {date(item.ends_at, timezone)}</small></div><button onClick={() => void removeClosure(item.id)}>Retirer</button></div>)}</div></article></div></section>;

  if (module.key === "portfolio") return <section className="workspace-content">{salonPicker}<SalonHero title="Galerie du salon" description="Logo, couverture et réalisations contrôlés par type et par taille." />{feedback && <p className="salon-feedback" role="status">{feedback}</p>}<article className="workspace-panel salon-panel"><form className="salon-form" onSubmit={(event) => void uploadMedia(event)}><label>Type<select name="mediaType"><option value="logo">Logo</option><option value="cover">Couverture</option><option value="gallery">Galerie</option></select></label><label className="wide">Image<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></label><button className="salon-primary">Envoyer l’image</button></form><div className="salon-media-grid">{media.map((item) => { const url = getSupabaseBrowserClient()?.storage.from("business-media").getPublicUrl(item.storage_path).data.publicUrl ?? ""; return <article key={item.id}>{url && <Image src={url} alt={`${item.media_type} du salon`} width={360} height={220} unoptimized />}<span>{item.media_type}</span><button onClick={() => void removeMedia(item)}>Retirer</button></article>; })}</div></article></section>;

  if (module.key === "reviews") return <section className="workspace-content"><ProviderReviewBookings key={business.id} providerId={userId} businessId={business.id} />{salonPicker}<SalonHero title="Avis du salon" description="Avis issus de rendez-vous terminés, visibles sans données privées de la cliente." /><article className="workspace-panel salon-panel"><div className="salon-list">{reviews.map((review) => <div key={review.id}><div><strong>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</strong><small>{review.comment || "Avis sans commentaire"} · {new Date(review.created_at).toLocaleDateString("fr-FR")}</small>{review.provider_reply && <small>Réponse : {review.provider_reply}</small>}</div></div>)}{reviews.length === 0 && <p>Aucun avis reçu pour le moment.</p>}</div></article></section>;

  if (module.key === "dashboard") return <section className="workspace-content">{salonPicker}<SalonHome name={business.name} bookings={bookings} members={collaborators} timeZone={timezone}/></section>;

  if (["bookings", "revenue", "statistics", "dashboard"].includes(module.key)) return <section className="workspace-content">{salonPicker}<SalonHero title={module.key === "dashboard" ? business.name : module.label} description="Activité réelle issue des 200 rendez-vous les plus récents visibles pour ce salon. Cette fenêtre n’est pas un historique complet." /><div className="workspace-metrics"><article><span>Rendez-vous du jour</span><strong>{today.length}</strong><small>parmi les 200 plus récents chargés</small></article><article><span>Montants suivis par devise</span><strong>{revenue}</strong><small>confirmés ou terminés parmi ces 200 rendez-vous</small></article><article><span>Équipe active</span><strong>{collaborators.filter((item) => item.is_active).length}</strong><small>fiches collaborateurs actives</small></article></div>{feedback && <p className="salon-feedback" role="status">{feedback}</p>}<article className="workspace-panel salon-panel"><h3>Réservations récentes</h3><p className="salon-scope-note">Les statistiques ci-dessus portent sur cette liste limitée à 200 éléments. Utilisez les exports ou rapports historiques de Production pour des totaux complets.</p><div className="salon-list">{bookings.map((booking) => <div key={booking.id}><div><strong>{date(booking.starts_at, timezone)}</strong><small>{money(booking.total_amount, booking.currency)} · {booking.status.replaceAll("_", " ")}</small></div>{["pending","confirmed"].includes(booking.status) && <BookingReschedule bookingId={booking.id} timeZone={timezone} onSaved={load} />}{booking.status === "completed" && <BookingFeedback bookingId={booking.id} direction="provider_to_client" />}{booking.status === "pending" && <button onClick={() => void updateBooking(booking.id, "confirmed")}>Confirmer</button>}{booking.status === "confirmed" && <button onClick={() => void updateBooking(booking.id, "in_progress")}>Démarrer</button>}{booking.status === "in_progress" && <button onClick={() => void updateBooking(booking.id, "completed")}>Terminer</button>}{["pending", "confirmed"].includes(booking.status) && <button className="danger" onClick={() => void updateBooking(booking.id, "cancelled_by_provider")}>Annuler</button>}</div>)}{bookings.length === 0 && <p>Aucune réservation pour ce salon.</p>}</div></article></section>;

  if (module.key === "settings") return <section className="workspace-content">{salonPicker}<SalonHero title="Paramètres du salon" description="Publication et archivage sans suppression de l’historique." />{feedback && <p className="salon-feedback" role="status">{feedback}</p>}<article className="workspace-panel salon-panel"><div className="salon-list"><div><div><strong>Visibilité du salon</strong><small>{business.is_active ? "Actif" : "Inactif"} · validation {business.status}</small></div><button onClick={async () => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { data, error } = await supabase.from("businesses").update({ is_active: !business.is_active }).eq("id", business.id).eq("owner_id", userId).eq("is_active", business.is_active).is("archived_at", null).select("id").maybeSingle(); setFeedback(error || !data ? "La visibilité n’a pas pu être modifiée. Actualisez le salon." : "Visibilité mise à jour."); if (!error && data) await load(); }}>{business.is_active ? "Désactiver" : "Réactiver"}</button></div><div><div><strong>Archiver ce salon</strong><small>Les réservations, montants et journaux restent conservés.</small></div><button className="danger" onClick={async () => { if (!window.confirm("Archiver le salon et désactiver ses prestations ?")) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error } = await supabase.rpc("archive_owned_business", { target_business_id: business.id }); setFeedback(error ? publicErrorMessage(error, "Archivage impossible.") : "Salon archivé."); if (!error) await load(); }}>Archiver</button></div></div></article></section>;

  if (!supportedModules.has(module.key)) return null;
  return <section className="workspace-content">{salonPicker}<SalonHero title={module.label} description={module.description} /><article className="workspace-panel salon-panel"><p>Les données de ce module sont consolidées dans les espaces Agenda, Réservations, Équipe et Prestations.</p></article></section>;
}

function SalonHero({ title, description }: { title: string; description: string }) { return <div className="workspace-intro"><div><span>Gestion Salon</span><h2>{title}</h2><p>{description}</p></div><div className="workspace-status"><i />Votre espace salon</div></div>; }
function nullable(values: FormData, key: string) { const value = String(values.get(key) ?? "").trim(); return value || null; }
function numberOrNull(values: FormData, key: string) { const value = String(values.get(key) ?? "").trim(); return value ? Number(value) : null; }
function slugify(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "salon"; }
function money(value: number, currency = "XOF") { return formatServiceMoney(value, currency); }
function date(value: string, timeZone = "Africa/Dakar") { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)); }
