"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type DeletionRequest = { id: string; profile_id: string; reason: string | null; status: string; requested_at: string };

export function AccountDeletionQueue() {
  const [rows, setRows] = useState<DeletionRequest[]>([]);
  const [selected, setSelected] = useState<DeletionRequest | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const client = getSupabaseBrowserClient(); if (!client) throw new Error("Connexion indisponible");
      const result = await client.from("account_deletion_requests").select("id,profile_id,reason,status,requested_at").order("requested_at", { ascending: false }).limit(100).abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setRows(result.data);
    } catch (error) { setRows([]); setNotice(publicErrorMessage(error, "Les demandes sont indisponibles.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || submitting.current) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (!window.confirm("Désactiver ce compte et invalider ses sessions ? Les données seront conservées pour le traitement manuel de la suppression.")) return;
    submitting.current = true; setBusy(true); setNotice("");
    try {
      const client = getSupabaseBrowserClient(); if (!client) throw new Error("Connexion indisponible");
      const result = await client.rpc("admin_begin_account_deletion", { target_request_id: selected.id, target_reason: reason }).abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setSelected(null); await load(); setNotice("Compte désactivé, sessions invalidées et prise en charge auditée. Suppression des données à traiter manuellement.");
    } catch (error) { setNotice(publicErrorMessage(error, "La prise en charge a été refusée.")); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="workspace-panel"><h2>Demandes de suppression</h2>
    <p>La prise en charge désactive le compte. Les réservations et journaux sont conservés pour examen ; aucune demande n’est déclarée effacée automatiquement.</p>
    <button disabled={loading || busy} onClick={() => void load()}>Actualiser les demandes</button>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Chargement…</p> : rows.map(row => <article key={row.id} className="control-list-row"><div><strong>Compte {row.profile_id}</strong><p>{row.reason || "Sans motif"}</p><small>{row.status === "reviewing" ? "En traitement manuel — données conservées" : row.status} · {new Date(row.requested_at).toLocaleString("fr-FR")}</small></div>{row.status === "requested" && <button disabled={busy} onClick={() => setSelected(row)}>Prendre en charge</button>}</article>)}
    {!loading && !notice && rows.length === 0 && <p>Aucune demande.</p>}
    {selected && <form className="dashboard-form" onSubmit={event => void begin(event)}><h3>Prise en charge</h3><p>{selected.reason}</p><label>Note de traitement<textarea name="reason" required minLength={5} maxLength={1000} /></label><button disabled={busy}>Désactiver et ouvrir le traitement</button><button type="button" disabled={busy} onClick={() => setSelected(null)}>Annuler</button></form>}
  </section>;
}
