"use client";

import Link from "next/link";
import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProfessionalDocuments } from "./professional-documents";
import { applicationStatusLabels } from "./client-profile";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { SUPPORTED_COUNTRIES, SUPPORTED_TIME_ZONES } from "@/lib/domain/international";

type Candidate = { business_name: string; bio: string | null; city: string; country_code: string | null; region: string | null; timezone: string | null; currency: string | null; base_address: string | null; latitude: number | null; longitude: number | null; service_mode: string; activity_type: string; years_experience: number; languages: string[]; cancellation_policy: string | null; onboarding_progress: number };
type Application = { status: string; rejection_reason: string | null };

export function ProfessionalApplication({ userId }: { userId: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentsComplete, setDocumentsComplete] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const applicationForm = useRef<HTMLFormElement>(null);
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient(); if (!client) { setState("error"); return; }
    const [profile, dossier, identity, services] = await Promise.all([
      client.from("provider_profiles").select("business_name,bio,city,country_code,region,timezone,currency,base_address,latitude,longitude,service_mode,activity_type,years_experience,languages,cancellation_policy,onboarding_progress").eq("profile_id", userId).maybeSingle(),
      client.from("professional_onboarding").select("status,rejection_reason").eq("provider_id", userId).maybeSingle(),
      client.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
      client.from("provider_services").select("currency").eq("provider_id", userId),
    ]);
    if (profile.error || dossier.error || identity.error) { setState("error"); return; }
    const serviceCurrencies = [...new Set((services.data ?? []).map((service) => service.currency).filter((currency): currency is string => Boolean(currency)))];
    setCandidate(profile.data ? { ...profile.data, currency: profile.data.currency ?? (serviceCurrencies.length === 1 ? serviceCurrencies[0] : null) } : null);
    setApplication(dossier.data); setState("ready");
    setAvatarUrl(identity.data?.avatar_url ?? null);
  }, [userId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setNotice("");
    const { error } = await client.rpc("request_provider_onboarding", { target_business_name: String(new FormData(event.currentTarget).get("businessName")) });
    setBusy(false); if (error) { setNotice(publicErrorMessage(error, "Le dossier n’a pas pu être créé.")); return; }
    await load();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    const values = new FormData(event.currentTarget); setBusy(true); setNotice("");
    const latitude = optionalCoordinate(values.get("latitude")), longitude = optionalCoordinate(values.get("longitude"));
    const phone = normalizeInternationalPhone(String(values.get("phone") ?? ""));
    if ((latitude === null) !== (longitude === null)) { setBusy(false); setNotice("Renseignez latitude et longitude ensemble, ou laissez les deux vides."); return; }
    if (values.get("phone") && !phone) { setBusy(false); setNotice("Entrez un numéro international au format +221… avec 8 à 15 chiffres."); return; }
    const { error } = await client.rpc("save_professional_onboarding", {
      target_business_name: String(values.get("businessName")), target_bio: String(values.get("bio")), target_city: String(values.get("city")),
      target_base_address: String(values.get("address")), target_service_mode: String(values.get("serviceMode")), target_activity_type: String(values.get("activity")),
      target_years_experience: Number(values.get("experience")), target_languages: String(values.get("languages")).split(",").map(value => value.trim()).filter(Boolean),
      target_cancellation_policy: String(values.get("cancellation")),
    });
    if (error) { setBusy(false); setNotice(publicErrorMessage(error, "Les informations n’ont pas pu être enregistrées.")); return; }
    const { error: locationError } = await client.rpc("save_professional_global_location", {
      target_country_code: String(values.get("countryCode")), target_region: String(values.get("region") ?? ""),
      target_timezone: String(values.get("timezone")), target_currency: String(values.get("currency")),
    });
    if (locationError) { setBusy(false); setNotice(publicErrorMessage(locationError, "Le fuseau, le pays et la devise n’ont pas pu être enregistrés. Réessayez.")); return; }
    const updates = await Promise.all([
      client.from("provider_profiles").update({ latitude, longitude }).eq("profile_id", userId),
      phone ? client.from("profiles").update({ phone }).eq("id", userId) : Promise.resolve({ error: null }),
    ]);
    const secondaryError = updates.find(result => result.error)?.error;
    setBusy(false); setNotice(secondaryError ? "Le profil professionnel est enregistré, mais la position ou le contact n’a pas pu être mis à jour. Réessayez." : "Informations enregistrées. Complétez les quatre documents avant l’envoi.");
    if (!error) await load();
  }
  async function saveApprovedLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    const values = new FormData(event.currentTarget); setBusy(true); setNotice("");
    const { error } = await client.rpc("save_professional_global_location", {
      target_country_code: String(values.get("countryCode")), target_region: String(values.get("region") ?? ""),
      target_timezone: String(values.get("timezone")), target_currency: String(values.get("currency")),
    });
    setBusy(false);
    setNotice(error ? publicErrorMessage(error, "La localisation n’a pas pu être enregistrée. Vérifiez la devise des prestations existantes.") : "Pays, fuseau horaire et devise enregistrés. Les anciens rendez-vous conservent leurs instants UTC.");
    if (!error) await load();
  }
  async function submit() {
    if (busy || documentBusy || !documentsComplete) return; const client = getSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setNotice("");
    const { error } = await client.rpc("submit_provider_for_review");
    setBusy(false); setNotice(error ? publicErrorMessage(error, "Complétez les informations et les quatre documents avant l’envoi.") : "Dossier envoyé. Notre équipe va examiner votre candidature.");
    if (!error) await load();
  }
  async function uploadPhoto(file: File | undefined) {
    if (!file || !file.size || photoBusy) return;
    if (! ["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setNotice("Choisissez une photo JPG, PNG ou WebP de 5 Mo maximum."); return;
    }
    const client = getSupabaseBrowserClient(); if (!client) return;
    setPhotoBusy(true); setNotice("");
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`;
    const upload = await client.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) { setNotice(publicErrorMessage(upload.error, "La photo n’a pas pu être envoyée.")); setPhotoBusy(false); return; }
    const url = client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const { error } = await client.from("profiles").update({ avatar_url: url }).eq("id", userId);
    if (error) {
      await client.storage.from("avatars").remove([path]);
      setNotice(publicErrorMessage(error, "La photo n’a pas pu être enregistrée."));
    } else { setAvatarUrl(url); setNotice("Photo du profil professionnel mise à jour."); }
    setPhotoBusy(false);
  }
  function useCurrentLocation() {
    if (!navigator.geolocation) { setNotice("La géolocalisation n’est pas disponible dans ce navigateur."); return; }
    setLocating(true); setNotice("");
    navigator.geolocation.getCurrentPosition(position => {
      const form = applicationForm.current;
      if (form) {
        (form.elements.namedItem("latitude") as HTMLInputElement).value = position.coords.latitude.toFixed(6);
        (form.elements.namedItem("longitude") as HTMLInputElement).value = position.coords.longitude.toFixed(6);
      }
      setLocating(false); setNotice("Position ajoutée au formulaire. Enregistrez les informations pour la joindre au dossier.");
    }, error => {
      setLocating(false);
      setNotice(error.code === error.PERMISSION_DENIED ? "Localisation refusée. Saisissez la ville et l’adresse manuellement." : error.code === error.TIMEOUT ? "La localisation prend trop de temps. Réessayez ou continuez sans position précise." : "Position indisponible. Vérifiez les réglages de localisation ou continuez avec l’adresse manuelle.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
  }
  if (state === "loading") return <p role="status">Chargement de votre candidature…</p>;
  if (state === "error") return <section className="panel"><p role="alert">Votre dossier est momentanément indisponible.</p><button onClick={() => void load()}>Réessayer</button></section>;
  const editable = !application || ["draft", "profile_incomplete", "additional_information_required", "rejected"].includes(application.status);
  return <section className="client-control-center" aria-label="Ma candidature professionnelle">
    <Link href="/app/profile">← Retour au profil</Link>
    <article className="panel professional-onboarding-hero"><span className="professional-kicker">MATA BEAUTY · ESPACE PROFESSIONNEL</span><h2>{application ? applicationStatusLabels[application.status] ?? "Votre candidature" : "Développez votre activité beauté"}</h2>
      <p>Informations professionnelles → quatre documents → envoi → examen par notre équipe.</p>
      <p>L’accès professionnel sera activé après approbation de votre dossier.</p>
      <ol className="professional-progress" aria-label="Étapes de la candidature"><li className={candidate ? "complete" : "current"}>Compte</li><li className={candidate && candidate.onboarding_progress >= 75 ? "complete" : candidate ? "current" : ""}>Profil</li><li className={documentsComplete ? "complete" : ""}>Justificatifs</li><li className={application?.status === "verified" ? "complete" : ""}>Validation</li></ol>
      {application?.rejection_reason && <p role="status">{application.rejection_reason}</p>}
      {application?.status === "verified" && <Link href="/pro">Ouvrir mon espace professionnel</Link>}
      {notice && <p role="status">{notice}</p>}
      {!candidate && <form className="dashboard-form" onSubmit={event => void start(event)}><label>Nom de votre activité<input name="businessName" minLength={2} maxLength={120} required /></label><button disabled={busy}>Commencer mon dossier</button></form>}
    </article>
    {candidate && <>
      {editable && <article className="panel professional-onboarding-panel"><div className="professional-panel-heading"><div><span className="professional-step">ÉTAPE 2 SUR 4</span><h2>Présentez votre activité</h2><p>Choisissez votre structure, puis complétez les informations affichées sur votre profil.</p></div><strong>{candidate.onboarding_progress}%</strong></div><div className="professional-progress-track" role="progressbar" aria-label="Profil professionnel complété" aria-valuemin={0} aria-valuemax={100} aria-valuenow={candidate.onboarding_progress}><span style={{ width: `${candidate.onboarding_progress}%` }} /></div><div className="professional-photo-row"><div className="professional-photo">{avatarUrl ? <Image src={avatarUrl} alt="Photo du profil professionnel" width={88} height={88} unoptimized /> : <span aria-hidden>MB</span>}</div><label className="professional-photo-button">{photoBusy ? "Envoi…" : "Ajouter une photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={event => { void uploadPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label><small>La photo utilise l’avatar public de votre compte. JPG, PNG ou WebP · 5 Mo maximum.</small></div><h2>Informations professionnelles</h2><form ref={applicationForm} className="dashboard-form" onSubmit={event => void save(event)}>
        <label>Nom de votre activité<input name="businessName" defaultValue={candidate.business_name} minLength={2} maxLength={120} required /></label>
        <label>Votre structure<select name="activity" defaultValue={candidate.activity_type || "independent"}><option value="independent">Professionnel indépendant</option><option value="salon">Salon de beauté</option><option value="barber_shop">Barber shop</option><option value="hairdresser">Coiffure</option><option value="makeup_artist">Maquillage</option><option value="nail_artist">Onglerie</option><option value="esthetician">Esthétique</option><option value="care_specialist">Soins</option><option value="other">Autre activité</option></select><small>Le salon reste une organisation rattachée à votre compte professionnel, pas un compte séparé.</small></label>
        <label className="wide">Présentation<textarea name="bio" minLength={40} maxLength={2000} defaultValue={candidate.bio ?? ""} required /></label>
        <label>Ville<input name="city" minLength={2} defaultValue={candidate.city} required /></label>
        <label>Pays<select name="countryCode" defaultValue={candidate.country_code ?? ""} required><option value="">Choisir un pays</option>{SUPPORTED_COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label>Région ou État<input name="region" maxLength={120} defaultValue={candidate.region ?? ""} /></label>
        <label>Fuseau horaire IANA<select name="timezone" defaultValue={candidate.timezone ?? ""} required><option value="">Choisir un fuseau</option>{SUPPORTED_TIME_ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select><small>Les horaires de réservation seront interprétés dans ce fuseau.</small></label>
        <label>Devise des tarifs<select name="currency" defaultValue={candidate.currency ?? (candidate.country_code === "SN" ? "XOF" : "")} required><option value="">Choisir une devise</option><option value="XOF">XOF · Franc CFA</option><option value="EUR">EUR · Euro</option><option value="USD">USD · Dollar US</option><option value="GBP">GBP · Livre sterling</option><option value="CAD">CAD · Dollar canadien</option></select></label>
        <label>Adresse professionnelle<input name="address" minLength={4} defaultValue={candidate.base_address ?? ""} required /></label>
        <label>Téléphone international<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+221 77 123 45 67" /><small>Nous n’affichons pas le numéro déjà enregistré. Un numéro saisi ici le mettra à jour ; laissez vide pour le conserver.</small></label>
        <label>Lieu des prestations<select name="serviceMode" defaultValue={candidate.service_mode}><option value="salon">Chez le professionnel</option><option value="mobile">À domicile</option><option value="both">Les deux</option></select></label>
        <div className="professional-geolocation"><div><strong>Position de l’activité</strong><small>Facultatif. Elle aide les clientes à trouver votre profil.</small></div><button type="button" disabled={locating} onClick={useCurrentLocation}>{locating ? "Recherche…" : "Utiliser ma position"}</button></div>
        <label>Latitude<input name="latitude" type="number" min="-90" max="90" step="0.000001" defaultValue={candidate.latitude ?? ""} /></label>
        <label>Longitude<input name="longitude" type="number" min="-180" max="180" step="0.000001" defaultValue={candidate.longitude ?? ""} /></label>
        <label>Années d’expérience<input type="number" name="experience" min={0} max={80} defaultValue={candidate.years_experience ?? 0} required /></label>
        <label>Langues parlées<input name="languages" defaultValue={candidate.languages.join(", ")} required /></label>
        <label className="wide">Conditions d’annulation<textarea name="cancellation" minLength={20} defaultValue={candidate.cancellation_policy ?? ""} required /></label>
        <button disabled={busy}>Enregistrer les informations</button>
      </form></article>}
      {application?.status === "verified" && <article className="panel professional-onboarding-panel"><h2>Localisation internationale</h2><p>Confirmez le lieu réel de votre activité. Le fuseau règle les futurs créneaux; les rendez-vous déjà enregistrés ne changent pas. Les tarifs ne sont jamais convertis automatiquement.</p><form className="dashboard-form" onSubmit={event => void saveApprovedLocation(event)}>
        <label>Pays<select name="countryCode" defaultValue={candidate.country_code ?? ""} required><option value="">Choisir un pays</option>{SUPPORTED_COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label>Région ou État<input name="region" maxLength={120} defaultValue={candidate.region ?? ""} /></label>
        <label>Fuseau horaire IANA<select name="timezone" defaultValue={candidate.timezone ?? ""} required><option value="">Choisir un fuseau</option>{SUPPORTED_TIME_ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
        <label>Devise des tarifs<select name="currency" defaultValue={candidate.currency ?? ""} required><option value="">Choisir une devise</option><option value="XOF">XOF · Franc CFA</option><option value="EUR">EUR · Euro</option><option value="USD">USD · Dollar US</option><option value="GBP">GBP · Livre sterling</option><option value="CAD">CAD · Dollar canadien</option></select><small>Changer la devise est refusé tant que des prestations enregistrées utilisent une autre devise.</small></label>
        <button className="primary-button" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer la localisation"}</button>
      </form></article>}
      <ProfessionalDocuments providerId={userId} readOnly={!editable} onBusyChange={setDocumentBusy} onCompleteChange={setDocumentsComplete} />
      {editable && <article className="panel"><p>{documentBusy ? "Attendez la fin de l’envoi du document avant de transmettre le dossier." : "Vérifiez les informations et vos quatre documents avant de transmettre le dossier."}</p><button className="primary-button" disabled={busy || documentBusy || !documentsComplete || candidate.onboarding_progress < 100} onClick={() => void submit()}>{busy ? "Envoi…" : "Envoyer mon dossier"}</button></article>}
    </>}
  </section>;
}

function optionalCoordinate(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function normalizeInternationalPhone(value: string) {
  const normalized = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}
