"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { MessageBubble } from "./message-bubble";

type Ticket = { id: string; subject: string; status: string; priority: string };
type Message = { id: string; sender_id: string; body: string; is_internal: boolean; created_at: string };

export function SupportThread({ ticketId, staff = false, onChange }: { ticketId: string; staff?: boolean; onChange?: () => Promise<void> }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const submitting = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const api = getSupabaseBrowserClient(); if (!api) throw new Error("Connexion indisponible");
      const [result, session] = await Promise.all([
        api.from("support_messages").select("id,sender_id,body,is_internal,created_at").eq("ticket_id", ticketId).order("created_at").abortSignal(AbortSignal.timeout(10000)),
        api.auth.getSession(),
      ]);
      if (result.error) throw result.error;
      setViewerId(session.data.session?.user.id ?? null);
      setMessages(result.data as Message[]);
    } catch (error) { setNotice(publicErrorMessage(error, "Les échanges sont indisponibles.")); }
    finally { setLoading(false); }
  }, [ticketId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function act(action: string, body: string | null = null) {
    if (submitting.current) return false;
    submitting.current = true; setBusy(true); setNotice("");
    try {
      const api = getSupabaseBrowserClient(); if (!api) throw new Error("Connexion indisponible");
      const result = await api.rpc("manage_support_ticket", { target_ticket_id: ticketId, target_action: action, target_value: null, target_message: body });
      if (result.error) throw result.error;
      await load(); await onChange?.(); setNotice("Demande mise à jour."); return true;
    } catch (error) { setNotice(publicErrorMessage(error, "La demande n’a pas été mise à jour.")); return false; }
    finally { submitting.current = false; setBusy(false); }
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    if (await act("reply", String(new FormData(form).get("reply") ?? "").trim())) form.reset();
  }
  return <section className="support-thread" aria-label="Échanges avec le support">
    {notice && <p role="status">{notice}</p>}
    <button disabled={busy || loading} onClick={() => void load()}>Actualiser les échanges</button>
    <div className="message-list" tabIndex={0} aria-label="Historique du support" aria-live="polite" aria-busy={loading}>
      {loading ? <p>Chargement des échanges…</p> : messages.map(message => <MessageBubble key={message.id} own={message.sender_id === viewerId} label={message.is_internal ? "Note interne" : message.sender_id === viewerId ? "Vous" : "Correspondant"} body={message.body} createdAt={message.created_at} />)}
    </div>
    <form className="message-composer" onSubmit={event => void reply(event)}><label>Réponse au support<textarea name="reply" required minLength={2} maxLength={5000} rows={2} placeholder="Écrire au support…" disabled={busy || loading} /></label><button className="primary-button" disabled={busy || loading}>{busy ? "Envoi…" : "Envoyer la réponse"}</button></form>
    {staff && <div className="privacy-actions"><button disabled={busy} onClick={() => void act("assign")}>M’assigner</button><button disabled={busy} onClick={() => void act("pending")}>Mettre en attente</button><button disabled={busy} onClick={() => void act("resolve")}>Résoudre</button><button disabled={busy} onClick={() => void act("reopen")}>Rouvrir</button></div>}
  </section>;
}

export function SupportInbox({ filter = "tickets", userId }: { filter?: string; userId?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const api = getSupabaseBrowserClient(); if (!api) throw new Error("Connexion indisponible");
      let query = api.from("support_tickets").select("id,subject,status,priority");
      if (filter === "unassigned") query = query.is("assigned_to", null);
      if (filter === "mine") { if (!userId) throw new Error("Session indisponible"); query = query.eq("assigned_to", userId); }
      if (filter === "priority") query = query.in("priority", ["high", "urgent"]);
      if (filter === "escalations") query = query.eq("status", "pending").eq("priority", "urgent");
      const result = await query.order("updated_at",{ascending:false}).limit(100).abortSignal(AbortSignal.timeout(10000));
      if (result.error) throw result.error;
      setTickets(result.data as Ticket[]);
    } catch (error) { setNotice(publicErrorMessage(error, "Les demandes sont indisponibles.")); }
    finally { setLoading(false); }
  }, [filter, userId]);
  useEffect(() => { const timer = setTimeout(() => void load(),0); return () => clearTimeout(timer); }, [load]);
  return <section className="admin-panel panel"><h2>Demandes au support</h2><button disabled={loading} onClick={() => void load()}>Actualiser les demandes</button>{notice && <p role="alert">{notice}</p>}{loading ? <p>Chargement…</p> : !notice && tickets.length === 0 ? <p>Aucune demande.</p> : tickets.map(ticket => <div className="control-list-row" key={ticket.id}><button onClick={() => setSelected(ticket)}>{ticket.subject}</button><span>{ticket.status} · {ticket.priority}</span></div>)}{selected && <article><h3>{selected.subject}</h3><button onClick={() => setSelected(null)}>Fermer la demande</button><SupportThread key={selected.id} ticketId={selected.id} staff onChange={load} /></article>}</section>;
}
