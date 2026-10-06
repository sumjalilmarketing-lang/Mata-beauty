"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProfessionalDocuments } from "./professional-documents";
import { applicationStatusLabels } from "./client-profile";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Candidate = { business_name: string; bio: string | null; city: string; base_address: string | null; service_mode: string; activity_type: string; years_experience: number; languages: string[]; cancellation_policy: string | null; onboarding_progress: number };
type Application = { status: string; rejection_reason: string | null };

export function ProfessionalApplication({ userId }: { userId: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient(); if (!client) { setState("error"); return; }
    const [profile, dossier] = await Promise.all([
      client.from("provider_profiles").select("business_name,bio,city,base_address,service_mode,activity_type,years_experience,languages,cancellation_policy,onboarding_progress").eq("profile_id", userId).maybeSingle(),
      client.from("professional_onboarding").select("status,rejection_reason").eq("provider_id", userId).maybeSingle(),
    ]);
    if (profile.error || dossier.error) { setState("error"); return; }
    setCandidate(profile.data); setApplication(dossier.data); setState("ready");
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
    const { error } = await client.rpc("save_professional_onboarding", {
      target_business_name: String(values.get("businessName")), target_bio: String(values.get("bio")), target_city: String(values.get("city")),
      target_base_address: String(values.get("address")), target_service_mode: String(values.get("serviceMode")), target_activity_type: String(values.get("activity")),
      target_years_experience: Number(values.get("experience")), target_languages: String(values.get("languages")).split(",").map(value => value.trim()).filter(Boolean),
      target_cancellation_policy: String(values.get("cancellation")),
    });
    setBusy(false); setNotice(error ? publicErrorMessage(error, "Les informations n’ont pas pu être enregistrées.") : "Informations enregistrées. Complétez les quatre documents avant l’envoi.");
    if (!error) await load();
  }
  async function submit() {
    if (busy || documentBusy) return; const client = getSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setNotice("");
    const { error } = await client.rpc("submit_provider_for_review");
    setBusy(false); setNotice(error ? publicErrorMessage(error, "Complétez les informations et les quatre documents avant l’envoi.") : "Dossier envoyé. Notre équipe va examiner votre candidature.");
    if (!error) await load();
  }
  if (state === "loading") return <p role="status">Chargement de votre candidature…</p>;
  if (state === "error") return <section className="panel"><p role="alert">Votre dossier est momentanément indisponible.</p><button onClick={() => void load()}>Réessayer</button></section>;
  const editable = !application || ["draft", "profile_incomplete", "additional_information_required", "rejected"].includes(application.status);
  return <section className="client-control-center" aria-label="Ma candidature professionnelle">
    <Link href="/app/profile">← Retour au profil</Link>
    <article className="panel"><h2>{application ? applicationStatusLabels[application.status] ?? "Votre candidature" : "Devenir professionnel"}</h2>
      <p>Informations professionnelles → quatre documents → envoi → examen par notre équipe.</p>
      <p>L’accès professionnel sera activé après approbation de votre dossier.</p>
      {application?.rejection_reason && <p role="status">{application.rejection_reason}</p>}
      {application?.status === "verified" && <Link href="/pro">Ouvrir mon espace professionnel</Link>}
      {notice && <p role="status">{notice}</p>}
      {!candidate && <form className="dashboard-form" onSubmit={event => void start(event)}><label>Nom de votre activité<input name="businessName" minLength={2} maxLength={120} required /></label><button disabled={busy}>Commencer mon dossier</button></form>}
    </article>
    {candidate && <>
      {editable && <article className="panel"><h2>Informations professionnelles</h2><form className="dashboard-form" onSubmit={event => void save(event)}>
        <label>Nom de votre activité<input name="businessName" defaultValue={candidate.business_name} minLength={2} maxLength={120} required /></label>
        <label>Activité<select name="activity" defaultValue={candidate.activity_type || "independent"}><option value="independent">Indépendant</option><option value="salon">Salon</option><option value="barber_shop">Barbier</option><option value="hairdresser">Coiffure</option><option value="makeup_artist">Maquillage</option><option value="nail_artist">Onglerie</option><option value="esthetician">Esthétique</option><option value="care_specialist">Soins</option><option value="other">Autre</option></select></label>
        <label className="wide">Présentation<textarea name="bio" minLength={40} maxLength={2000} defaultValue={candidate.bio ?? ""} required /></label>
        <label>Ville<input name="city" minLength={2} defaultValue={candidate.city} required /></label>
        <label>Adresse professionnelle<input name="address" minLength={4} defaultValue={candidate.base_address ?? ""} required /></label>
        <label>Lieu des prestations<select name="serviceMode" defaultValue={candidate.service_mode}><option value="salon">Chez le professionnel</option><option value="mobile">À domicile</option><option value="both">Les deux</option></select></label>
        <label>Années d’expérience<input type="number" name="experience" min={0} max={80} defaultValue={candidate.years_experience ?? 0} required /></label>
        <label>Langues parlées<input name="languages" defaultValue={candidate.languages.join(", ")} required /></label>
        <label className="wide">Conditions d’annulation<textarea name="cancellation" minLength={20} defaultValue={candidate.cancellation_policy ?? ""} required /></label>
        <button disabled={busy}>Enregistrer les informations</button>
      </form></article>}
      <ProfessionalDocuments providerId={userId} readOnly={!editable} onBusyChange={setDocumentBusy} />
      {editable && <article className="panel"><p>{documentBusy ? "Attendez la fin de l’envoi du document avant de transmettre le dossier." : "Vérifiez les informations et vos quatre documents avant de transmettre le dossier."}</p><button className="primary-button" disabled={busy || documentBusy || candidate.onboarding_progress < 100} onClick={() => void submit()}>{busy ? "Envoi…" : "Envoyer mon dossier"}</button></article>}
    </>}
  </section>;
}
