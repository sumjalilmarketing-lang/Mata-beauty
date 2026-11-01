"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProviderReview } from "./provider-review";
import { applicationStatusLabels } from "./client-profile";
import { ApplicationDecision } from "./application-decision";
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
  const [detailReady, setDetailReady] = useState(false);
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient(); if (!client) { setState("error"); return; }
    const result = await client.from("professional_onboarding").select("provider_id,status,rejection_reason,provider_profiles(business_name,city)").order("updated_at", { ascending: false });
    if (result.error) { setState("error"); return; }
    setRows((result.data ?? []) as unknown as Dossier[]); setState("ready");
  }, []);
  useEffect(() => { const timer = setTimeout(() => { setFilter(moduleFilter[moduleKey] ?? "all"); void load(); }, 0); return () => clearTimeout(timer); }, [load, moduleKey]);
  const selectedRow = rows.find(row => row.provider_id === selected);
  const visible = rows.filter(row => filter === "all" || row.status === filter || filter === "draft" && row.status === "profile_incomplete");
  return <section className="client-control-center onboarding-queue" aria-label="Dossiers professionnels">
    <article className="panel"><h2>Dossiers professionnels</h2><p>Consultez les informations et documents du candidat, puis enregistrez votre décision.</p>
      <div className="queue-toolbar"><label>Afficher<select value={filter} onChange={event => setFilter(event.target.value as keyof typeof filters)}>{Object.entries(filters).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button onClick={() => void load()}>Actualiser les dossiers</button></div>
      {notice && <p role="status">{notice}</p>}
      {state === "loading" ? <p role="status">Chargement…</p> : state === "error" ? <p role="alert">Les dossiers sont indisponibles. Réessayez.</p> : visible.length ? visible.map(row => <div className="control-list-row" key={row.provider_id}><div><strong>{row.provider_profiles?.business_name ?? "Candidat"}</strong><p>{row.provider_profiles?.city} · {applicationStatusLabels[row.status] ?? row.status}</p></div><button onClick={() => { setDetailReady(false); setSelected(row.provider_id); setNotice(""); }}>Examiner le dossier</button></div>) : <p>Aucun dossier dans cette rubrique.</p>}
    </article>
    {selectedRow && <article className="panel dossier-container"><button onClick={() => setSelected(null)}>Fermer le dossier</button><ApplicationDecision key={`decision-${selectedRow.provider_id}`} providerId={selectedRow.provider_id} status={selectedRow.status} detailReady={detailReady} onChange={() => void load()} /><ProviderReview key={selectedRow.provider_id} providerId={selectedRow.provider_id} refreshStatus={selectedRow.status} onReady={setDetailReady} onChange={() => void load()} />
      <p>{applicationStatusLabels[selectedRow.status] ?? selectedRow.status}</p>{selectedRow.rejection_reason && <p>{selectedRow.rejection_reason}</p>}

    </article>}
  </section>;
}

