"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Report = { id: string; reason: string; details: string | null; status: string; post_id: string | null; created_at: string };

export function ModerationInbox() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const api = getSupabaseBrowserClient(); if (!api) throw new Error("Connexion indisponible");
      const result = await api.from("reports").select("id,reason,details,status,post_id,created_at").order("created_at",{ascending:false}).limit(100).abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setReports(result.data as Report[]);
    } catch (error) { setNotice(publicErrorMessage(error, "Les signalements sont indisponibles.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(),0); return () => clearTimeout(timer); },[load]);
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || submitting.current) return;
    const form = event.currentTarget, data = new FormData(form);
    submitting.current = true; setBusy(true); setNotice("");
    try {
      const api = getSupabaseBrowserClient(); if (!api) throw new Error("Connexion indisponible");
      const result = await api.rpc("manage_moderation_report", {target_report_id:selected.id,target_action:String(data.get("action")),target_reason:String(data.get("reason")).trim()});
      if (result.error) throw result.error;
      setSelected(null); await load(); setNotice("Décision enregistrée.");
    } catch (error) { setNotice(publicErrorMessage(error, "La décision n’a pas été enregistrée.")); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="admin-panel panel"><h2>File des signalements</h2><button disabled={loading || busy} onClick={()=>void load()}>Actualiser les signalements</button>{notice && <p role="status">{notice}</p>}{loading ? <p>Chargement…</p> : !notice && reports.length===0 ? <p>Aucun signalement.</p> : reports.map(report=><div className="control-list-row" key={report.id}><button data-testid={`report-${report.id}`} disabled={busy} onClick={()=>setSelected(report)}>{report.reason}</button><span>{report.status} · {new Date(report.created_at).toLocaleDateString("fr-FR")}</span></div>)}{selected && <article><h3>{selected.reason}</h3><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{selected.details || "Sans précision complémentaire."}</p>{selected.post_id && <Link href={`/posts/${selected.post_id}`} target="_blank" rel="noopener noreferrer">Ouvrir la publication signalée</Link>}<form className="dashboard-form" onSubmit={event=>void decide(event)}><label>Décision<select name="action"><option value="examine">Prendre en charge</option>{selected.post_id && <><option value="warn">Avertir l’auteur</option><option value="hide">Masquer la publication</option><option value="restore">Restaurer la publication</option></>}<option value="close">Clore le signalement</option></select></label><label>Justification<textarea name="reason" required minLength={2} maxLength={2000}/></label><button disabled={busy}>Enregistrer la décision</button><button type="button" disabled={busy} onClick={()=>setSelected(null)}>Annuler</button></form></article>}</section>;
}
