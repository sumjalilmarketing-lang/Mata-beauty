"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { sentMessage, type ConversationMessage } from "./conversation-types";

class MediaRequestError extends Error {}

async function mediaRequest(body: Record<string, unknown> | null, attachmentId?: string) {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("media_unavailable");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("session_expired");
  const response = await fetch(attachmentId ? `/api/messages/media?attachment=${encodeURIComponent(attachmentId)}` : "/api/messages/media", {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store",
  });
  if (response.status === 401) throw new Error("session_expired");
  if (response.status === 403 || response.status === 404) throw { code: "42501" };
  if (!response.ok) {
    const result: { error?: unknown } = await response.json().catch(() => ({}));
    if (typeof result.error === "string" && result.error.length <= 300) throw new MediaRequestError(result.error);
    throw new Error("media_unavailable");
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export function ConversationAttachment({ attachmentId, video, onReady }: { attachmentId: string; video: boolean; onReady?: () => void }) {
  const [signed, setSigned] = useState<{ url: string; expiresAt: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const renew = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const data = await mediaRequest(null, attachmentId);
      if (typeof data.url !== "string") throw new Error("media_unavailable");
      const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : Date.parse(String(data.expiresAt));
      if (mounted.current) setSigned({ url: data.url, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 60_000 });
    } catch (caught) {
      if (mounted.current) setError(caught instanceof MediaRequestError ? caught.message : publicErrorMessage(caught, "Média indisponible. Réessayez pour renouveler l’accès privé."));
    } finally { busy.current = false; if (mounted.current) setLoading(false); }
  }, [attachmentId]);
  useEffect(() => {
    mounted.current = true;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void renew(); }
    }, { rootMargin: "100px" });
    if (container.current) observer.observe(container.current);
    return () => { mounted.current = false; observer.disconnect(); };
  }, [renew]);
  return <div className="conversation-attachment" ref={container}>
    {signed && !error && (video
      ? <video src={signed.url} controls playsInline preload="metadata" onLoadedMetadata={onReady} onError={() => setError("L’accès privé a expiré ou le média est indisponible. Renouvelez-le pour réessayer.")} />
      : <img src={signed.url} width={480} height={360} alt="Photo partagée dans cette conversation" referrerPolicy="no-referrer" onLoad={onReady} onError={() => setError("L’accès privé a expiré ou la photo est indisponible. Renouvelez-le pour réessayer.")} />)}
    {error && <p role="status">{error}</p>}
    <button type="button" disabled={loading} onClick={() => void renew()}>{loading ? "Chargement du média…" : signed ? "Renouveler l’accès au média" : "Ouvrir le média privé"}</button>
  </div>;
}

export function ConversationMediaUpload({ conversationId, onSent }: { conversationId: string; onSent: (message: ConversationMessage) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const operation = useRef<{ nonce: string; attachmentId?: string; uploaded?: boolean } | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); queueMicrotask(() => setPreview(url));
    return () => { URL.revokeObjectURL(url); };
  }, [file]);

  async function upload() {
    const client = getSupabaseBrowserClient();
    if (!client || !file || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    operation.current ??= { nonce: crypto.randomUUID() };
    const pending = operation.current;
    try {
      if (!pending.uploaded) {
        setStage("Préparation du fichier…");
        const prepared = await mediaRequest({ phase: "prepare", conversationId, filename: file.name, contentType: file.type, size: file.size, clientNonce: pending.nonce });
        if (prepared.message) {
          onSent(sentMessage(prepared)); operation.current = null; setFile(null); setPreview(null); setStage("Média envoyé.");
          if (input.current) input.current.value = "";
          return;
        }
        if (typeof prepared.attachmentId !== "string" || typeof prepared.path !== "string" || typeof prepared.token !== "string") throw new Error("media_unavailable");
        pending.attachmentId = prepared.attachmentId;
        setStage("Envoi du fichier…");
        const result = await client.storage.from("message-attachments").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
        if (result.error) {
          // A lost upload response may leave a complete object in storage. The
          // server validates it and publishes at most once for the same nonce.
          const recovered = await mediaRequest({ phase: "complete", attachmentId: pending.attachmentId, clientNonce: pending.nonce }).catch(() => null);
          if (!recovered?.message) throw result.error;
          onSent(sentMessage(recovered)); operation.current = null; setFile(null); setPreview(null); setStage("Média envoyé.");
          if (input.current) input.current.value = "";
          return;
        }
        pending.uploaded = true;
      }
      setStage("Vérification et publication…");
      const completed = await mediaRequest({ phase: "complete", attachmentId: pending.attachmentId, clientNonce: pending.nonce });
      onSent(sentMessage(completed));
      operation.current = null; setFile(null); setPreview(null); setStage("Média envoyé.");
      if (input.current) input.current.value = "";
    } catch (caught) { setError(caught instanceof MediaRequestError ? caught.message : publicErrorMessage(caught, "Le média n’a pas pu être envoyé. Vérifiez son format et sa durée, puis réessayez. Votre sélection est conservée.")); setStage(""); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="conversation-upload">
    <label className="conversation-file-label">Ajouter une photo ou une vidéo
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy} onChange={event => {
        const selected = event.target.files?.[0]; setError(""); setStage("");
        if (!selected) return;
        if (!["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(selected.type) || selected.size === 0 || selected.size > (selected.type === "video/mp4" ? 20 : 10) * 1024 * 1024) {
          setError("Choisissez une image JPEG, PNG ou WebP de 10 Mo maximum, ou une vidéo MP4 de 20 Mo et 60 secondes maximum."); event.target.value = ""; return;
        }
        operation.current = { nonce: crypto.randomUUID() }; setFile(selected); setPreview(null);
      }} />
    </label>
    <small>Images : 10 Mo. Vidéos MP4 : 20 Mo, 60 secondes. Visibles uniquement par les participants autorisés.</small>
    {file && <div className="conversation-upload-preview">
      {preview && (file.type === "video/mp4" ? <video src={preview} controls playsInline preload="metadata" /> : <img src={preview} width={240} height={160} alt="Aperçu de la photo avant envoi" />)}
      <span>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} Mo</span>
      <div className="conversation-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void upload()}>{busy ? "Envoi…" : "Envoyer le média"}</button>
        <button type="button" disabled={busy} onClick={() => { setFile(null); setPreview(null); operation.current = null; if (input.current) input.current.value = ""; }}>Annuler</button></div>
    </div>}
    {stage && <p role="status">{stage}</p>}{error && <p role="alert" className="conversation-error">{error}</p>}
  </div>;
}
