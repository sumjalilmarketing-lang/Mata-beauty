"use client";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProviderReview } from "./provider-review";
import { applicationStatusLabels } from "./client-profile";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { useSearchParams } from "next/navigation";

type Dossier = { provider_id: string; status: string; rejection_reason: string | null; provider_profiles: { business_name: string; city: string } | null };
const filters = { all: "Tous les dossiers", submitted: "Nouveaux", under_review: "À vérifier", draft: "Incomplets", additional_information_required: "Complément demandé", verified: "Approuvés", rejected: "Refusés" };
const moduleFilter: Record<string, keyof typeof filters> = { new: "submitted", "in-progress": "under_review", requests: "additional_information_required", approved: "verified", rejected: "rejected" };

export function OnboardingQueue({ moduleKey }: { moduleKey: string }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Dossier[]>([]);
  const [filter, setFilter] = useState<keyof typeof filters>(moduleFilter[moduleKey] ?? "all");
  const [selected, setSelected] = useState<string | null>(searchParams.get("dossier"));
  const [state, setState] = useState("loading");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailReady, setDetailReady] = useState(false);
  const [decision, setDecision] = useState("under_review");
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient(); if (!client) { setState("error"); return; }
    const result = await client.from("professional_onboarding").select("provider_id,status,rejection_reason,provider_profiles(business_name,city)").order("updated_at", { ascending: false });
    if (result.error) { setState("error"); return; }
    setRows((result.data ?? []) as unknown as Dossier[]); setState("ready");
  }, []);
  useEffect(() => { const timer = setTimeout(() => { setFilter(moduleFilter[moduleKey] ?? "all"); void load(); }, 0); return () => clearTimeout(timer); }, [load, moduleKey]);
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy || !detailReady) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    const form = event.currentTarget, message = String(new FormData(form).get("message"));
    const labels: Record<string, string> = { approved: "Approuver le professionnel", rejected: "Refuser le dossier", additional_information_required: "Demander un complément", under_review: "Commencer l’examen" };
    if (!window.confirm(`${labels[decision]} ? Le candidat recevra ce message : ${message}`)) return;
    setBusy(true); setNotice("");
    const { error } = await client.rpc("review_professional_application", { target_provider_id: selected, decision, public_message: message });
    setBusy(false); setNotice(error ? publicErrorMessage(error, "La décision n’a pas pu être enregistrée.") : "Décision enregistrée et candidat notifié.");
    if (!error) { form.reset(); await load(); }
  }
  const selectedRow = rows.find(row => row.provider_id === selected);
  const visible = rows.filter(row => filter === "all" || row.status === filter || filter === "draft" && row.status === "profile_incomplete");
  return <section className="client-control-center" aria-label="Dossiers professionnels">
    <article className="panel"><h2>Dossiers professionnels</h2><p>Consultez les informations et documents du candidat, puis enregistrez votre décision.</p>
      <label>Afficher<select value={filter} onChange={event => setFilter(event.target.value as keyof typeof filters)}>{Object.entries(filters).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button onClick={() => void load()}>Actualiser les dossiers</button>
      {notice && <p role="status">{notice}</p>}
      {state === "loading" ? <p role="status">Chargement…</p> : state === "error" ? <p role="alert">Les dossiers sont indisponibles. Réessayez.</p> : visible.length ? visible.map(row => <div className="control-list-row" key={row.provider_id}><div><strong>{row.provider_profiles?.business_name ?? "Candidat"}</strong><p>{row.provider_profiles?.city} · {applicationStatusLabels[row.status] ?? row.status}</p></div><button onClick={() => { setDetailReady(false); setSelected(row.provider_id); setNotice(""); }}>Examiner le dossier</button></div>) : <p>Aucun dossier dans cette rubrique.</p>}
    </article>
    {selectedRow && <article className="panel dossier-container"><button onClick={() => setSelected(null)}>Fermer le dossier</button><ProviderReview key={`${selectedRow.provider_id}-${selectedRow.status}`} providerId={selectedRow.provider_id} onReady={setDetailReady} onChange={() => void load()} />
      <p>{applicationStatusLabels[selectedRow.status] ?? selectedRow.status}</p>{selectedRow.rejection_reason && <p>{selectedRow.rejection_reason}</p>}
      {["submitted", "under_review", "additional_information_required"].includes(selectedRow.status) && <form className="dashboard-form" onSubmit={event => void review(event)}>
        <h3>Décision sur le dossier</h3><label>Décision<select value={decision} onChange={event => setDecision(event.target.value)}><option value="under_review">Commencer l’examen</option><option value="additional_information_required">Demander un complément</option><option value="approved">Approuver le professionnel</option><option value="rejected">Refuser le dossier</option></select></label>
        <label className="wide">Message au candidat<textarea name="message" minLength={3} maxLength={1000} required /></label>
        <p>Ce message sera visible par le candidat. La décision sera journalisée ; aucun paiement ne sera déclenché.</p><button disabled={busy || !detailReady}>{busy ? "Enregistrement…" : "Confirmer la décision"}</button>
      </form>}
    </article>}
  </section>;
}

