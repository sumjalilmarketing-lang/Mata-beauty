"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Comment = { id: string; post_id: string; body: string; is_hidden: boolean; created_at: string };

export function CommentModeration() {
  const [rows, setRows] = useState<Comment[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const client = getSupabaseBrowserClient();
    if (!client) { setState("error"); return; }
    setState("loading");
    const result = await client.from("post_comments")
      .select("id,post_id,body,is_hidden,created_at")
      .order("created_at", { ascending: false }).limit(100)
      .abortSignal(AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]));
    if (signal?.aborted) return;
    if (result.error) { setState("error"); return; }
    setRows(result.data); setState("ready");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const start = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(start); controller.abort(); };
  }, [load]);

  async function changeVisibility(row: Comment) {
    if (busy || !window.confirm(`${row.is_hidden ? "Restaurer" : "Masquer"} ce commentaire ? Son texte sera conservé.`)) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    setBusy(row.id); setNotice("");
    try {
      const result = await client.from("post_comments").update({ is_hidden: !row.is_hidden })
        .eq("id", row.id).eq("is_hidden", row.is_hidden).select("id")
        .abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      if (result.data.length !== 1) throw new Error("Le commentaire a changé ou votre accès a été retiré. Actualisez la liste.");
      setNotice(row.is_hidden ? "Commentaire restauré." : "Commentaire masqué.");
      await load();
    } catch (error) {
      setNotice(publicErrorMessage(error, "La décision n’a pas pu être enregistrée."));
    } finally { setBusy(null); }
  }

  return <section className="workspace-content" aria-label="Modération des commentaires">
    <article className="workspace-panel">
      <h2>Commentaires</h2>
      <p>Les 100 commentaires les plus récents. Le masquage conserve le texte de l’auteur.</p>
      <button disabled={state === "loading" || busy !== null} onClick={() => void load()}>Actualiser les commentaires</button>
      {notice && <p role="status">{notice}</p>}
      {state === "loading" && <p role="status">Chargement…</p>}
      {state === "error" && <p role="alert">Les commentaires sont indisponibles. Réessayez.</p>}
      {state === "ready" && rows.length === 0 && <p>Aucun commentaire dans le périmètre autorisé.</p>}
      {state === "ready" && rows.map(row => <article className="control-list-row" key={row.id}>
        <div><p>{row.body}</p><small>{row.is_hidden ? "Masqué" : "Visible"} · {new Date(row.created_at).toLocaleString("fr-FR")}</small><p><Link href={`/posts/${row.post_id}`}>Ouvrir la publication</Link></p></div>
        <button disabled={busy !== null} onClick={() => void changeVisibility(row)}>{busy === row.id ? "Enregistrement…" : row.is_hidden ? "Restaurer le commentaire" : "Masquer le commentaire"}</button>
      </article>)}
    </article>
  </section>;
}
