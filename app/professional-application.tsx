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
  const [documentsComplete, setDocumentsComplete] = useState(false);
  const [activityType, setActivityType] = useState("independent");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient(); if (!client) { setState("error"); return; }
    const [profile, dossier] = await Promise.all([
      client.from("provider_profiles").select("business_name,bio,city,base_address,service_mode,activity_type,years_experience,languages,cancellation_policy,onboarding_progress").eq("profile_id", userId).maybeSingle(),
      client.from("professional_onboarding").select("status,rejection_reason").eq("provider_id", userId).maybeSingle(),
    ]);
    if (profile.error || dossier.error) { setState("error"); return; }
    setCandidate(profile.data); setApplication(dossier.data); setActivityType(profile.data?.activity_type ?? "independent");
    setStep(!profile.data ? 1 : dossier.data && !["draft", "profile_incomplete", "additional_information_required", "rejected"].includes(dossier.data.status) ? 4 : profile.data.onboarding_progress === 100 ? 3 : 2);
    setState("ready");
  }, [userId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setNotice("");
    const values = new FormData(event.currentTarget);
    const businessName = String(values.get("businessName"));
    const nextActivity = String(values.get("activity"));
    const { error } = await client.rpc("request_provider_onboarding", { target_business_name: businessName });
    setBusy(false); if (error) { setNotice(publicErrorMessage(error, "Le dossier n’a pas pu être créé.")); return; }
    await load();
    setActivityType(nextActivity);
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
    if (!error) { setStep(3); await load(); }
  }
  async function submit() {
    if (busy || documentBusy) return; const client = getSupabaseBrowserClient(); if (!client) return;
    setBusy(true); setNotice("");
    const { error } = await client.rpc("submit_provider_for_review");
    setBusy(false); setNotice(error ? publicErrorMessage(error, "Complétez les informations et les quatre documents avant l’envoi.") : "Dossier envoyé. Notre équipe va examiner votre candidature.");
    if (!error) { setStep(4); await load(); }
  }
  if (state === "loading") return <p role="status">Chargement de votre candidature…</p>;
  if (state === "error") return <section className="panel"><p role="alert">Votre dossier est momentanément indisponible.</p><button onClick={() => void load()}>Réessayer</button></section>;
  const editable = !application || ["draft", "profile_incomplete", "additional_information_required", "rejected"].includes(application.status);
  const steps = ["Choisir le statut", "Profil professionnel", "Justificatifs", "Envoyer le dossier"] as const;
  return <section className="client-control-center" aria-label="Ma candidature professionnelle">
    <Link href="/app/profile">← Retour au profil</Link>
    <article className="panel professional-application-hero"><span className="application-kicker">Votre activité sur MATA Beauty</span><h2>{application ? applicationStatusLabels[application.status] ?? "Votre candidature" : "Devenir professionnel"}</h2>
      <p>Un parcours en quelques étapes. Votre accès Pro ne sera activé qu’après approbation de l’équipe.</p>
      <p>L’accès professionnel sera activé après approbation de votre dossier.</p>
      {application?.rejection_reason && <p role="status">{application.rejection_reason}</p>}
      {application?.status === "verified" && <Link href="/pro">Ouvrir mon espace professionnel</Link>}
      {notice && <p role="status">{notice}</p>}
      {editable && <ol className="application-steps" aria-label="Étapes de candidature">{steps.map((label, index) => <li className={step === index + 1 ? "current" : step > index + 1 ? "complete" : ""} key={label}><span>{step > index + 1 ? "✓" : index + 1}</span><small>{label}</small></li>)}</ol>}
      {!candidate && <form className="dashboard-form application-start-form" onSubmit={event => void start(event)}><fieldset className="application-account-choice"><legend>Quel est votre profil ?</legend><p>Choisissez le type d’activité qui vous correspond.</p><div className="application-choice-grid"><label className={activityType === "independent" ? "selected" : ""}><input type="radio" name="activity" value="independent" checked={activityType === "independent"} onChange={() => setActivityType("independent")} /><span aria-hidden="true">♙</span><strong>Professionnel indépendant</strong><small>Coiffure, esthétique, maquillage, soins et autres activités en indépendant.</small></label><label className={activityType === "salon" ? "selected" : ""}><input type="radio" name="activity" value="salon" checked={activityType === "salon"} onChange={() => setActivityType("salon")} /><span aria-hidden="true">▦</span><strong>Salon / Entreprise</strong><small>Gérez votre salon, vos prestations et votre équipe.</small></label></div></fieldset><label>Nom de votre activité<input name="businessName" autoComplete="organization" minLength={2} maxLength={120} required /></label><p>Le salon reste une organisation gérée dans votre espace professionnel. Chaque collaborateur aura sa propre identité et ses accès.</p><button disabled={busy}>{busy ? "Création…" : "Continuer"}</button></form>}
    </article>
    {candidate && editable && <nav className="application-step-nav" aria-label="Étapes modifiables">{steps.slice(1).map((label, index) => <button type="button" key={label} className={step === index + 2 ? "active" : ""} onClick={() => { if (index + 2 <= step || (index + 2 === 3 && candidate.onboarding_progress === 100)) setStep((index + 2) as 2 | 3 | 4); }}>{index + 2}. {label}</button>)}</nav>}
    {candidate && <>
      {editable && step === 2 && <article className="panel application-step-panel"><span className="application-kicker">Étape 2 · Votre vitrine</span><h2>Informations professionnelles</h2><p>Ces informations serviront à présenter votre activité aux clients.</p><form className="dashboard-form" onSubmit={event => void save(event)}>
        <label>Nom de votre activité<input name="businessName" defaultValue={candidate.business_name} minLength={2} maxLength={120} required /></label>
        <label>Activité<select name="activity" defaultValue={activityType}><option value="independent">Indépendant</option><option value="salon">Salon / Entreprise</option><option value="barber_shop">Barbier</option><option value="hairdresser">Coiffure</option><option value="makeup_artist">Maquillage</option><option value="nail_artist">Onglerie</option><option value="esthetician">Esthétique</option><option value="care_specialist">Soins</option><option value="other">Autre</option></select></label>
        <label className="wide">Présentation<textarea name="bio" minLength={40} maxLength={2000} defaultValue={candidate.bio ?? ""} required /></label>
        <label>Ville<input name="city" minLength={2} defaultValue={candidate.city} required /></label>
        <label>Adresse professionnelle<input name="address" minLength={4} defaultValue={candidate.base_address ?? ""} required /></label>
        <label>Lieu des prestations<select name="serviceMode" defaultValue={candidate.service_mode}><option value="salon">Chez le professionnel</option><option value="mobile">À domicile</option><option value="both">Les deux</option></select></label>
        <label>Années d’expérience<input type="number" name="experience" min={0} max={80} defaultValue={candidate.years_experience ?? 0} required /></label>
        <label>Langues parlées<input name="languages" defaultValue={candidate.languages.join(", ")} required /></label>
        <label className="wide">Conditions d’annulation<textarea name="cancellation" minLength={20} defaultValue={candidate.cancellation_policy ?? ""} required /></label>
        <button disabled={busy}>Enregistrer les informations</button>
      </form></article>}
      {(step === 3 || !editable) && <><ProfessionalDocuments providerId={userId} readOnly={!editable} onBusyChange={setDocumentBusy} onCompleteChange={setDocumentsComplete} />{editable && <div className="application-step-actions"><button type="button" onClick={() => setStep(2)}>Retour au profil</button><button type="button" className="primary-button" disabled={documentBusy || candidate.onboarding_progress < 100 || !documentsComplete} onClick={() => setStep(4)}>Continuer vers l’envoi</button></div>}</>}
      {editable && step === 4 && <article className="panel application-step-panel"><span className="application-kicker">Étape 4 · Vérification finale</span><h2>Envoyer votre candidature</h2><p>Statut actuel : <strong>{applicationStatusLabels[application?.status ?? "draft"] ?? "Brouillon"}</strong></p><p>Progression du profil : <strong>{candidate.onboarding_progress}%</strong></p><p>Pièces obligatoires : <strong>{documentsComplete ? "4 sur 4 reçues" : "documents à compléter"}</strong></p><p>Votre dossier sera examiné par l’équipe. N’annoncez pas votre activité comme approuvée avant la décision.</p><div className="application-step-actions"><button type="button" onClick={() => setStep(3)}>Vérifier les documents</button><button className="primary-button" disabled={busy || documentBusy || candidate.onboarding_progress < 100 || !documentsComplete} onClick={() => void submit()}>{busy ? "Envoi…" : "Envoyer mon dossier"}</button></div>{(candidate.onboarding_progress < 100 || !documentsComplete) && <p role="status">Complétez le profil et les quatre justificatifs avant l’envoi.</p>}</article>}
    </>}
  </section>;
}
