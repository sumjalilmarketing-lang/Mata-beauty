"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Readiness = { allowed: boolean; complete: boolean; missing: string[]; status: string; reason: string };
type Decision = "approved" | "additional_information_required" | "rejected";

export function ApplicationDecision({ providerId, status, detailReady, onChange }: { providerId: string; status: string; detailReady: boolean; onChange: () => void }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [message, setMessage] = useState("");
  const [checked, setChecked] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void getSupabaseBrowserClient()?.rpc("professional_application_readiness", { target_provider_id: providerId }).then(result => {
      if (!active) return;
      setReadiness(result.error ? null : result.data as Readiness);
      if (result.error) setFeedback("La vérification du dossier est indisponible. Actualisez avant de décider.");
    });
    return () => { active = false; };
  }, [providerId, status]);
  async function decide(decision: Decision) {
    if (pending.current || !detailReady || !readiness?.allowed || readiness.status !== status) return;
    if (decision === "approved" && (!readiness.complete || !checked)) return;
    const explanation = message.trim() || (decision === "approved" ? "Votre dossier professionnel a été approuvé." : "");
    if (explanation.length < 3) { setFeedback("Précisez le complément attendu ou le motif du refus dans le message au candidat."); return; }
    const label = decision === "approved" ? "Approuver le dossier" : decision === "rejected" ? "Refuser le dossier" : "Demander un complément";
    if (!window.confirm(`${label} ? Le candidat recevra ce message : ${explanation}`)) return;
    pending.current = true; setBusy(true); setFeedback("");
    try {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Session indisponible");
      const { error } = await client.rpc("review_professional_application", { target_provider_id: providerId, decision, public_message: explanation });
      if (error) { setFeedback(publicErrorMessage(error, "La décision n’a pas pu être enregistrée.")); return; }
      setFeedback("Décision enregistrée et candidat notifié."); setChecked(false); onChange();
    } catch { setFeedback("La réponse du serveur n’a pas pu être confirmée. Actualisez le dossier avant de réessayer."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="application-decision" aria-label="Décision sur le dossier">
    <h3>Décision sur le dossier</h3>
    <p>{readiness?.reason || "Vérification des permissions et des pièces obligatoires…"}</p>
    {readiness?.missing.length ? <p role="status">Éléments manquants : {readiness.missing.join(", ")}.</p> : null}
    {readiness?.allowed && readiness.status === status && <>
      <label>Message au candidat<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={1000} placeholder="Précisez votre décision ou le complément attendu" /></label>
      <label className="decision-verification"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} disabled={!readiness.complete || !detailReady || busy} /> J’ai vérifié l’identité, les informations professionnelles et les quatre documents.</label>
      <div className="decision-actions">
        <button type="button" className="decision-approve" disabled={busy || !detailReady || !readiness.complete || !checked} onClick={() => void decide("approved")}>Approuver le dossier</button>
        <button type="button" disabled={busy || !detailReady} onClick={() => void decide("additional_information_required")}>Demander un complément</button>
        <button type="button" className="decision-reject" disabled={busy || !detailReady} onClick={() => void decide("rejected")}>Refuser</button>
      </div>
    </>}
    {busy && <p role="status">Enregistrement de la décision…</p>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
