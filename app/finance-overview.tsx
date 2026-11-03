"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatRecordedMoney } from "@/lib/domain/admin-money";

const amount = z.coerce.number().finite();
const summaryRows = z.array(z.object({ currency: z.string().regex(/^[A-Z]{3}$/), test_mode: z.boolean(), payment_count: amount, online_collected: amount, on_site_collected: amount, refunds_recorded: amount, commissions_recorded: amount, professional_net_recorded: amount, pending_amount: amount }));
type Summary = z.infer<typeof summaryRows>;

export function FinanceOverview({ allowedModuleKeys }: { allowedModuleKeys: string[] }) {
  const [rows, setRows] = useState<Summary>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [mode, setMode] = useState<"real" | "test">("real");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    const client = getSupabaseBrowserClient();
    queueMicrotask(() => { if (active) setState("loading"); });
    if (!client) { window.clearTimeout(timer); queueMicrotask(() => { if (active) setState("error"); }); return () => { active = false; }; }
    void Promise.resolve(client.rpc("finance_payment_overview").abortSignal(controller.signal)).then(result => {
      if (!active) return;
      const parsed = summaryRows.safeParse(result.data);
      if (result.error || !parsed.success) { setRows([]); setState("error"); return; }
      setRows(parsed.data); setState("ready");
    }).catch(() => { if (active) { setRows([]); setState("error"); } }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [revision]);
  const visible = rows.filter(row => row.test_mode === (mode === "test"));
  return <section className="workspace-content">
    <div className="workspace-intro"><div><h2>Finance et comptabilité</h2><p>Synthèse de tous les paiements enregistrés, par devise et par mode. Les encaissements sur place sont distingués des paiements en ligne.</p></div></div>
    <article className="workspace-panel">
      <label>Mode des paiements<select value={mode} onChange={event => setMode(event.target.value as "real" | "test")}><option value="real">Paiements réels enregistrés</option><option value="test">Tests et simulations</option></select></label>
      <button type="button" disabled={state === "loading"} onClick={() => setRevision(value => value + 1)}>Actualiser la synthèse</button>
      {mode === "test" && <p role="status">Montants de test ou simulés : ils ne constituent pas de l’argent réellement encaissé.</p>}
      <p>Les montants suivent les statuts enregistrés et ne constituent pas un solde bancaire. Les commissions et nets professionnels sont présentés avant d’éventuels ajustements de remboursement ; les remboursements figurent séparément.</p>
      {state === "loading" ? <p role="status">Chargement des données financières…</p> : state === "error" ? <p role="alert">Synthèse indisponible. Vérifiez votre accès finance et votre session MFA, puis réessayez.</p> : visible.length === 0 ? <p>Aucun paiement {mode === "test" ? "de test" : "réel"} enregistré.</p> : visible.map(row => <section key={`${row.currency}-${row.test_mode}`} aria-label={`Synthèse ${row.currency}`}>
        <h3>{row.currency} · {row.payment_count} paiement(s)</h3><dl>
          <dt>Paiements en ligne marqués encaissés</dt><dd>{formatRecordedMoney(row.online_collected,row.currency)}</dd>
          <dt>Paiements sur place</dt><dd>{formatRecordedMoney(row.on_site_collected,row.currency)}</dd>
          <dt>Remboursements enregistrés</dt><dd>{formatRecordedMoney(row.refunds_recorded,row.currency)}</dd>
          <dt>Commissions enregistrées</dt><dd>{formatRecordedMoney(row.commissions_recorded,row.currency)}</dd>
          <dt>Nets professionnels enregistrés</dt><dd>{formatRecordedMoney(row.professional_net_recorded,row.currency)}</dd>
          <dt>Montants en attente</dt><dd>{formatRecordedMoney(row.pending_amount,row.currency)}</dd>
        </dl></section>)}
    </article>
    <nav className="workspace-panel workspace-shortcuts" aria-label="Outils financiers">{[
      ["transactions","Transactions"],["accounting","Journal financier"],["commissions","Commissions"],["wallets","Wallets"],["payouts","Versements"],["audit","Audit financier"],
    ].filter(([key]) => allowedModuleKeys.includes(key)).map(([key,label]) => <Link key={key} href={`/finance/${key}`}>{label}</Link>)}</nav>
  </section>;
}
