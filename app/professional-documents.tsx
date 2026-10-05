"use client";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
type Document = { id: string; kind: string; storage_path: string; status: string; rejection_reason: string | null };
const kinds: Record<string, string> = { identity: "Pièce d’identité", business_registration: "Immatriculation", qualification: "Qualification", address_proof: "Justificatif d’adresse" };

export function ProfessionalDocuments({ providerId, review = false, readOnly = false, onReady }: { providerId: string; review?: boolean; readOnly?: boolean; onReady?: (ready: boolean) => void }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    onReady?.(false);
    const client = getSupabaseBrowserClient(); if (!client) { setLoading(false); setNotice("Les documents n’ont pas pu être chargés."); return; }
    const result = await client.from("provider_documents").select("id,kind,storage_path,status,rejection_reason").eq("provider_id", providerId).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (result.error) setNotice("Les documents n’ont pas pu être chargés.");
    else setDocuments((result.data ?? []).filter((document, index, all) => all.findIndex(item => item.kind === document.kind) === index));
    setLoading(false);
    onReady?.(!result.error);
  }, [providerId, onReady]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const client = getSupabaseBrowserClient(); if (!client || busy) return;
    const values = new FormData(form), file = values.get("document");
    if (!(file instanceof File) || !file.size) return;
    if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "application/pdf"].includes(file.type)) { setNotice("Choisissez un PDF, JPEG ou PNG de moins de 10 Mo."); return; }
    setBusy(true);
    const path = `${providerId}/${crypto.randomUUID()}.${file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg"}`;
    const uploaded = await client.storage.from("provider-documents").upload(path, file, { contentType: file.type });
    if (uploaded.error) { setNotice("L’envoi a échoué. Réessayez."); setBusy(false); return; }
    const inserted = await client.from("provider_documents").insert({ provider_id: providerId, kind: String(values.get("kind")), storage_path: path });
    if (inserted.error) await client.storage.from("provider-documents").remove([path]);
    setNotice(inserted.error ? publicErrorMessage(inserted.error, "Le document n’a pas pu être enregistré.") : "Document envoyé pour vérification.");
    setBusy(false); if (!inserted.error) { form.reset(); await load(); }
  }
  async function open(document: Document) {
    const client = getSupabaseBrowserClient(); if (!client) return;
    const result = await client.storage.from("provider-documents").createSignedUrl(document.storage_path, 60);
    if (result.error || !result.data) { setNotice("Le document est momentanément indisponible."); return; }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function requestMore(document: Document) {
    const reason = window.prompt("Quel complément est nécessaire pour ce document ?")?.trim();
    if (!reason || reason.length < 2) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    const result = await client.rpc("request_professional_document_update", { target_document_id: document.id, public_message: reason });
    setNotice(result.error ? publicErrorMessage(result.error, "Le complément n’a pas pu être enregistré.") : "Complément demandé. Le candidat a été notifié.");
    if (!result.error) await load();
  }
  return <article className="panel"><h2>Documents professionnels</h2><p>Les quatre documents sont obligatoires. Ils restent privés et servent à vérifier votre activité.</p>
    {!loading && <p>{documents.filter(document => document.status !== "rejected").length}/4 documents reçus</p>}
    {notice && <p role="status">{notice}</p>}{loading ? <p>Chargement…</p> : Object.entries(kinds).map(([kind, label]) => {
      const document = documents.find(item => item.kind === kind);
      return <div className="control-list-row" key={kind}><strong>{label}</strong><span>{!document ? "Manquant" : document.status === "approved" ? "Validé" : document.status === "rejected" ? "À revérifier" : "Reçu"}</span>
        {document && <button onClick={() => void open(document)} aria-label={`Voir ${label}`}>Voir</button>}
        {document && review && <button onClick={() => void requestMore(document)}>Demander un complément</button>}
        {document?.rejection_reason && <p>{document.rejection_reason}</p>}
      </div>;
    })}
    {!review && !readOnly && <form className="dashboard-form" onSubmit={(event) => void upload(event)}><p>Pour remplacer un document, sélectionnez son type et envoyez le nouveau fichier.</p><label>Type de document<select name="kind">{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Document<input name="document" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button className="primary-button" disabled={busy}>{busy ? "Envoi…" : "Envoyer le document"}</button></form>}
  </article>;
}
