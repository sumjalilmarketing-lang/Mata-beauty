"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatRecordedMoney } from "@/lib/domain/admin-money";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Refund = { id: string; payment_id: string; amount: number; status: string; reason: string; created_at: string; payments: { currency: string } | { currency: string }[] | null };

export function RefundReview() {
  const [rows, setRows] = useState<Refund[]>([]);
  const [selected, setSelected] = useState<Refund | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const client = getSupabaseBrowserClient(); if (!client) throw new Error("Connexion indisponible");
      const result = await client.from("refunds").select("id,payment_id,amount,status,reason,created_at,payments(currency)").order("created_at", { ascending: false }).limit(100).abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setRows(result.data);
    } catch (error) { setRows([]); setNotice(publicErrorMessage(error, "Les demandes de remboursement sont indisponibles.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const start = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(start); }, [load]);
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || submitting.current) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true; setBusy(true); setNotice("");
    try {
      const client = getSupabaseBrowserClient(); if (!client) throw new Error("Connexion indisponible");
      const result = await client.rpc("manage_refund_request", { target_refund_id: selected.id, target_action: String(data.get("action")), target_reason: String(data.get("reason")).trim() }).abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setSelected(null); await load(); setNotice("Décision enregistrée et auditée. Aucun transfert d’argent effectué.");
    } catch (error) { setNotice(publicErrorMessage(error, "La décision n’a pas pu être enregistrée.")); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="workspace-panel">
    <h2>Demandes de remboursement</h2><p>Mode mock : ces décisions mettent à jour le suivi interne. Aucun transfert d’argent n’est effectué.</p>
    <button disabled={busy || loading} onClick={() => void load()}>Actualiser les remboursements</button>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Chargement…</p> : rows.length ? rows.map(row => <article className="control-list-row" key={row.id}>
      <div><strong>{formatRecordedMoney(row.amount, (Array.isArray(row.payments) ? row.payments[0] : row.payments)?.currency)}</strong><p>{row.reason}</p><small>{row.status} · {new Date(row.created_at).toLocaleString("fr-FR")}</small></div>
      {["requested", "approved"].includes(row.status) && <button disabled={busy} onClick={() => setSelected(row)}>Examiner la demande</button>}
    </article>) : !notice && <p>Aucune demande de remboursement.</p>}
    {selected && <form className="dashboard-form" onSubmit={event => void decide(event)}>
      <h3>Décision sur la demande</h3><p>{selected.reason}</p>
      <label htmlFor="refund-action">Décision</label><select id="refund-action" name="action">{selected.status === "requested" ? <><option value="approve">Approuver la demande</option><option value="reject">Rejeter la demande</option></> : <option value="processing">Marquer en traitement (mock)</option>}</select>
      <label>Justification<textarea name="reason" required minLength={2} maxLength={1000} /></label>
      <button disabled={busy}>Enregistrer la décision</button><button type="button" disabled={busy} onClick={() => setSelected(null)}>Annuler</button>
    </form>}
  </section>;
}
