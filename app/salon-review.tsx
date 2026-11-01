"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { ProviderReview } from "./provider-review";

type Salon = {
  id: string; owner_id: string; name: string; address: string; city: string;
  country_code: string | null; timezone: string | null; currency: string | null;
  status: string; is_active: boolean; archived_at: string | null;
};

export function SalonReview({ canApprove }: { canApprove: boolean }) {
  const [salons, setSalons] = useState<Salon[]>([]);
  const [selected, setSelected] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState("");
  const [documentsReady, setDocumentsReady] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Connexion indisponible");
      const result = await client.from("businesses")
        .select("id,owner_id,name,address,city,country_code,timezone,currency,status,is_active,archived_at")
        .order("created_at", { ascending: false }).limit(100)
        .abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setSalons(result.data ?? []);
    } catch (error) {
      setSalons([]);
      setNotice(publicErrorMessage(error, "Le registre des salons est indisponible."));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function approve() {
    if (!selected || inFlight.current || !canApprove || !documentsReady || reason.trim().length < 2) return;
    inFlight.current = true; setBusy(true); setNotice("");
    try {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Connexion indisponible");
      const result = await client.rpc("admin_approve_business", {
        target_business_id: selected.id, expected_status: selected.status, reason: reason.trim(),
      });
      if (result.error) throw result.error;
      setSelected(null); setDocumentsReady(false); setReason("");
      await load();
      setNotice("Salon approuvé. La décision et son motif ont été enregistrés dans le journal d’audit.");
    } catch (error) {
      setNotice(publicErrorMessage(error, "Le salon n’a pas été approuvé. Vérifiez le dossier et actualisez le registre."));
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="admin-panel" aria-label="Registre et validation des salons">
    <h2>Salons</h2>
    <p>Examinez l’établissement et le dossier professionnel de son propriétaire avant publication.</p>
    <button disabled={loading || busy} onClick={() => { setSelected(null); setNotice(""); void load(); }}>Actualiser le registre</button>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Chargement…</p> : salons.map(salon => <article className="control-list-row" key={salon.id}>
      <div><strong>{salon.name}</strong><p>{salon.city} · {salon.country_code ?? "Pays à compléter"} · {salon.status}</p></div>
      <button disabled={busy} onClick={() => { setSelected(salon); setDocumentsReady(false); setReason(""); setNotice(""); }}>Examiner le salon</button>
    </article>)}
    {!loading && !salons.length && <p>Aucun salon dans le périmètre autorisé.</p>}
    {selected && <section aria-label="Examen du salon">
      <h3>{selected.name}</h3>
      <dl><dt>Adresse de l’établissement</dt><dd>{selected.address} · {selected.city} · {selected.country_code ?? "À compléter"}</dd>
        <dt>Fuseau horaire</dt><dd>{selected.timezone ?? "À compléter"}</dd>
        <dt>Devise</dt><dd>{selected.currency ?? "À compléter"}</dd>
        <dt>Statut</dt><dd>{selected.status}{selected.archived_at ? " · archivé" : !selected.is_active ? " · inactif" : ""}</dd></dl>
      <ProviderReview key={selected.id} providerId={selected.owner_id} onReady={setDocumentsReady} />
      {canApprove && ["draft", "pending_review"].includes(selected.status) && selected.is_active && !selected.archived_at && <div>
        <p>La publication exige un propriétaire approuvé. Les droits, le MFA et le statut courant sont revérifiés par le serveur.</p>
        <label>Motif de l’approbation<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={2} maxLength={2000} disabled={busy} /></label>
        <button className="primary" disabled={busy || !documentsReady || reason.trim().length < 2} onClick={() => void approve()}>{busy ? "Approbation…" : "Approuver définitivement ce salon"}</button>
      </div>}
      <button disabled={busy} onClick={() => setSelected(null)}>Fermer le dossier du salon</button>
    </section>}
  </section>;
}
