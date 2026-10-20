"use client";
import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
type Document = { id: string; kind: string; storage_path: string; status: string; rejection_reason: string | null; created_at: string };
const kinds: Record<string, string> = { identity: "Pièce d’identité", business_registration: "Immatriculation", qualification: "Qualification", address_proof: "Justificatif d’adresse" };

export function ProfessionalDocuments({ providerId, review = false, readOnly = false, onReady, onChange, onBusyChange }: { providerId: string; review?: boolean; readOnly?: boolean; onReady?: (ready: boolean) => void; onChange?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  function setUploadBusy(value: boolean) { setBusy(value); onBusyChange?.(value); }
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [refresh, setRefresh] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!preview) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    let active = true;
    const client = getSupabaseBrowserClient();
    void client?.storage.from("provider-documents").createSignedUrl(preview.storage_path, 60).then(result => {
      if (!active) return;
      if (result.error || !result.data) setPreviewError("Aperçu indisponible. Réessayez ou contactez un responsable.");
      else setPreviewUrl(result.data.signedUrl);
    });
    return () => { active = false; };
  }, [preview, refresh]);
  const load = useCallback(async () => {
    onReady?.(false);
    const client = getSupabaseBrowserClient(); if (!client) { setLoading(false); setNotice("Les documents n’ont pas pu être chargés."); return; }
    const result = await client.from("provider_documents").select("id,kind,storage_path,status,rejection_reason,created_at").eq("provider_id", providerId).order("created_at", { ascending: false }).order("id", { ascending: false });
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
    setUploadBusy(true);
    const path = `${providerId}/${crypto.randomUUID()}.${file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg"}`;
    const uploaded = await client.storage.from("provider-documents").upload(path, file, { contentType: file.type });
    if (uploaded.error) { setNotice("L’envoi a échoué. Réessayez."); setUploadBusy(false); return; }
    const inserted = await client.from("provider_documents").insert({ provider_id: providerId, kind: String(values.get("kind")), storage_path: path });
    if (inserted.error) await client.storage.from("provider-documents").remove([path]);
    setNotice(inserted.error ? publicErrorMessage(inserted.error, "Le document n’a pas pu être enregistré.") : "Document envoyé pour vérification.");
    if (!inserted.error) { form.reset(); await load(); } setUploadBusy(false);
  }
  function open(document: Document) {
    setPreviewUrl(""); setPreviewError(""); setZoom(100); setPreview(document);
  }
  async function requestMore(document: Document) {
    const reason = window.prompt("Quel complément est nécessaire pour ce document ?")?.trim();
    if (!reason || reason.length < 2) return;
    if (!window.confirm(`Demander un complément pour ${kinds[document.kind]} ? Le candidat recevra votre message : ${reason}`)) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    const result = await client.rpc("request_professional_document_update", { target_document_id: document.id, public_message: reason });
    setNotice(result.error ? publicErrorMessage(result.error, "Le complément n’a pas pu être enregistré.") : "Complément demandé. Le candidat a été notifié.");
    if (!result.error) { await load(); onChange?.(); }
  }
  return <article className="panel professional-documents-panel"><h2>Documents professionnels</h2><p>Les quatre documents sont obligatoires. Ils restent privés et servent à vérifier votre activité.</p>
    {!loading && <p>{documents.filter(document => document.status !== "rejected").length}/4 documents reçus</p>}
    {notice && <p role="status">{notice}</p>}{loading ? <p>Chargement…</p> : Object.entries(kinds).map(([kind, label]) => {
      const document = documents.find(item => item.kind === kind);
      return <div className="control-list-row document-row" key={kind}><div><strong>{label}</strong>{document && <small>Reçu le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(document.created_at))}</small>}</div><span>{!document ? "Manquant" : document.status === "approved" ? "Validé" : document.status === "rejected" ? "À remplacer" : "Reçu · à vérifier"}</span>
        {document && <button onClick={() => void open(document)} aria-label={`Voir ${label}`}>Voir</button>}
        {document && review && !readOnly && <button onClick={() => void requestMore(document)}>Demander un complément</button>}
        {document?.rejection_reason && <p>{document.rejection_reason}</p>}
      </div>;
    })}
    {!review && !readOnly && <form className="dashboard-form" onSubmit={(event) => void upload(event)}><p>Pour remplacer un document, sélectionnez son type et envoyez le nouveau fichier.</p><label>Type de document<select name="kind">{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Document<input name="document" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button className="primary-button" disabled={busy}>{busy ? "Envoi…" : "Envoyer le document"}</button></form>}
    <dialog ref={dialog} className="document-preview" aria-labelledby="document-preview-title" onCancel={() => setPreview(null)}>
      <header><h2 id="document-preview-title">{preview ? kinds[preview.kind] : "Document"}</h2><button onClick={() => setPreview(null)}>Fermer l’aperçu</button></header>
      <p>Document privé. Le lien d’accès expire après une minute.</p>
      <div className="document-toolbar"><button disabled={!preview || documents.indexOf(preview) <= 0} onClick={() => preview && open(documents[documents.indexOf(preview) - 1])}>Document précédent</button><button disabled={!preview || documents.indexOf(preview) >= documents.length - 1} onClick={() => preview && open(documents[documents.indexOf(preview) + 1])}>Document suivant</button><button onClick={() => { setPreviewUrl(""); setPreviewError(""); setRefresh(value => value + 1); }}>Renouveler l’accès</button></div>
      {previewError ? <p role="alert">{previewError}</p> : !previewUrl ? <p role="status">Chargement du document…</p> : <>
        {preview?.storage_path.toLowerCase().endsWith(".pdf") ? <iframe title="Document PDF privé" src={previewUrl} referrerPolicy="no-referrer" /> : <><label>Zoom <input aria-label="Zoom du document" type="range" min="50" max="250" step="25" value={zoom} onChange={event => setZoom(Number(event.target.value))} /> {zoom}%</label><div className="document-image-scroll"><Image src={previewUrl} alt={preview ? kinds[preview.kind] : "Document privé"} width={1000} height={1000} unoptimized style={{ width: `${zoom}%`, height: "auto", maxWidth: "none" }} onError={() => setPreviewError("L’image n’a pas pu être affichée. Renouvelez l’accès.")} /></div></>}
        <a href={previewUrl} target="_blank" rel="noopener noreferrer">Ouvrir le document privé dans un nouvel onglet</a><p>Si l’aperçu PDF n’est pas pris en charge, utilisez ce lien temporaire.</p>
      </>}
    </dialog>
  </article>;
}
