"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { statusLabel } from "@/lib/ui/status-label";
import { MessageBubble } from "./message-bubble";
import { ConversationAttachment, ConversationMediaUpload } from "./conversation-media";
import { ConversationQuoteCard, ConversationQuoteForm } from "./conversation-quotes";
import { conversationDate, conversationPrice, mergeConversationMessages, messageColumns, sentMessage, type ConversationMessage, type ConversationQuote, type ConversationService, type ConversationSummary } from "./conversation-types";
import "./conversation-messages.css";

type MemberRow = { profile_id: string; last_read_at: string | null };
const pageSize = 50;

export function ConversationMessages({ conversationId: requestedConversation, bookingId, requestedMessageId, serviceTitle, userId, onClose, onChanged }: {
  conversationId?: string; bookingId?: string; requestedMessageId?: string | null; serviceTitle?: string; userId: string; onClose: () => void; onChanged?: () => void;
}) {
  const client = getSupabaseBrowserClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [services, setServices] = useState<ConversationService[]>([]);
  const [providerName, setProviderName] = useState("Professionnel");
  const [quotes, setQuotes] = useState<ConversationQuote[]>([]);
  const [attachments, setAttachments] = useState<Record<string, { id: string; mime_type: string }>>({});
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [auxError, setAuxError] = useState("");
  const [tool, setTool] = useState<"media" | "service" | "quote" | null>(null);
  const [editingQuote, setEditingQuote] = useState<ConversationQuote | null>(null);
  const [serviceId, setServiceId] = useState("");
  const sendingRef = useRef(false);
  const nonce = useRef<{ payload: string; id: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const olderScroll = useRef<{ height: number; top: number } | null>(null);
  const loadingOlder = useRef(false);
  const focusedTarget = useRef(false);
  const readCursor = useRef("");
  const lastMarkedCursor = useRef("");
  const markingRead = useRef(false);
  const reconcileRef = useRef<() => void>(() => {});
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);

  const loadMembers = useCallback(async (id: string) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const result = await supabase.from("conversation_members").select("profile_id,last_read_at").eq("conversation_id", id);
    if (result.error) throw result.error;
    setMembers((result.data ?? []) as MemberRow[]);
  }, []);
  const markRead = useCallback(async (id: string) => {
    const list = listRef.current;
    if (document.visibilityState !== "visible" || !list || !followLatest.current || markingRead.current || !readCursor.current || readCursor.current === lastMarkedCursor.current) return;
    const bounds = list.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= window.innerHeight || list.scrollHeight - list.scrollTop - list.clientHeight > 80) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const cursor = readCursor.current;
    markingRead.current = true;
    try {
      const result = await supabase.rpc("mark_conversation_read", { target_conversation_id: id });
      if (result.error) throw result.error;
      lastMarkedCursor.current = cursor;
      await loadMembers(id); changed.current?.();
    } finally { markingRead.current = false; }
  }, [loadMembers]);

  useEffect(() => {
    let active = true; let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;
    let reconcile = () => {};
    const visibility = () => { if (document.visibilityState === "visible") reconcile(); };
    async function initialize() {
      if (!client) throw new Error("messaging_unavailable");
      let id = requestedConversation;
      if (!id && bookingId) {
        const ensured = await client.rpc("ensure_booking_conversation", { target_booking_id: bookingId });
        if (ensured.error) throw ensured.error; id = ensured.data as string;
      }
      if (!id) throw new Error("conversation_unavailable");
      const selectedId = id;
      const [listed, initial] = await Promise.all([
        client.rpc("get_my_conversation", { target_conversation_id: selectedId }),
        client.from("messages").select(messageColumns).eq("conversation_id", selectedId).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize),
      ]);
      if (listed.error) throw listed.error; if (initial.error) throw initial.error;
      const context = listed.data as ConversationSummary | null;
      if (!context) throw { code: "42501" };
      const canSeeQuotes = context.client_id === userId || context.provider_id === userId;
      if (!active) return;
      setConversationId(selectedId); setSummary(context);
      let initialMessages = ((initial.data ?? []) as ConversationMessage[]).reverse();
      if (requestedMessageId && !initialMessages.some(message => message.id === requestedMessageId)) {
        const target = await client.from("messages").select(messageColumns).eq("conversation_id", selectedId).eq("id", requestedMessageId).is("deleted_at", null).maybeSingle();
        if (target.error) throw target.error;
        if (target.data) {
          // Load the gap from the latest page to this authorized notification target.
          // Stable compound ordering keeps simultaneous messages on page boundaries.
          for (let offset = pageSize; active; offset += pageSize) {
            const older = await client.from("messages").select(messageColumns).eq("conversation_id", selectedId).is("deleted_at", null)
              .gte("created_at", (target.data as ConversationMessage).created_at).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + pageSize - 1);
            if (older.error) throw older.error;
            initialMessages = mergeConversationMessages(initialMessages, (older.data ?? []) as ConversationMessage[]);
            if (initialMessages.some(message => message.id === requestedMessageId) || (older.data?.length ?? 0) < pageSize) break;
          }
          followLatest.current = false;
        } else setAuxError("Le message demandé n’est plus disponible dans cette conversation.");
      }
      if (!active) return;
      setMessages(initialMessages); setHasOlder(initialMessages.length >= pageSize);
      const [catalog, provider] = await Promise.all([
        client.from("provider_services").select("id,provider_id,title,description,price_amount,currency,duration_minutes,cover_url,is_active").eq("provider_id", context.provider_id).order("title"),
        client.from("provider_profiles").select("business_name").eq("profile_id", context.provider_id).maybeSingle(),
        loadMembers(selectedId).catch(caught => { if (active) setRefreshError(publicErrorMessage(caught, "La confirmation de lecture sera réessayée automatiquement.")); }),
      ]);
      if (!active) return;
      if (catalog.error) setAuxError("Le catalogue n’a pas pu être chargé. Actualisez la conversation pour réessayer.");
      else setServices((catalog.data ?? []) as ConversationService[]);
      setProviderName(provider.data?.business_name || (context.provider_id === context.other_profile_id ? context.other_display_name : "Professionnel"));

      let cursor = initialMessages.at(-1)?.created_at ?? "1970-01-01T00:00:00.000Z";
      let refreshing = false;
      let refreshAgain = false;
      async function refreshMessages() {
        if (!client || !active) return;
        if (refreshing) { refreshAgain = true; return; }
        refreshing = true;
        try {
          const since = cursor;
          for (let offset = 0; active; offset += pageSize) {
            const result = await client.from("messages").select(messageColumns).eq("conversation_id", selectedId).is("deleted_at", null)
              .gte("created_at", since).order("created_at").order("id").range(offset, offset + pageSize - 1);
            if (result.error) throw result.error; if (!active) return;
            const incoming = (result.data ?? []) as ConversationMessage[];
            setMessages(current => mergeConversationMessages(current, incoming));
            if (incoming.length) cursor = incoming.at(-1)!.created_at;
            if (incoming.length < pageSize) break;
          }
          if (canSeeQuotes) {
            const result = await client.rpc("list_conversation_quotes", { target_conversation_id: selectedId });
            if (result.error) throw result.error;
            if (active) setQuotes((result.data ?? []) as ConversationQuote[]);
          }
          await markRead(selectedId);
          await loadMembers(selectedId);
          if (active) setRefreshError("");
        } catch (caught) { if (active) setRefreshError(publicErrorMessage(caught, "Actualisation interrompue. Une nouvelle tentative sera effectuée.")); }
        finally {
          refreshing = false;
          if (refreshAgain && active) { refreshAgain = false; void refreshMessages(); }
        }
      }
      reconcile = () => { void refreshMessages(); }; reconcileRef.current = reconcile;
      refreshTimer = setInterval(reconcile, 10_000);
      window.addEventListener("online", reconcile); window.addEventListener("focus", reconcile); document.addEventListener("visibilitychange", visibility);
      channel = client.channel(`conversation:${selectedId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, payload => {
          if (!active) return;
          const message = payload.new as ConversationMessage & { deleted_at?: string | null };
          if (payload.eventType === "DELETE") setMessages(current => current.filter(item => item.id !== (payload.old as { id: string }).id));
          else if (message.deleted_at) setMessages(current => current.filter(item => item.id !== message.id));
          else setMessages(current => mergeConversationMessages(current, [message]));
          reconcile();
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${selectedId}` }, () => { if (active) void loadMembers(selectedId).catch(() => undefined); })
        .subscribe(status => { if (status === "SUBSCRIBED") reconcile(); });
      reconcile();
    }
    void initialize().catch(caught => { if (active) setError(publicErrorMessage(caught, "Impossible d’ouvrir la conversation.")); }).finally(() => { if (active) setLoading(false); });
    return () => {
      active = false; clearInterval(refreshTimer); reconcileRef.current = () => {};
      window.removeEventListener("online", reconcile); window.removeEventListener("focus", reconcile); document.removeEventListener("visibilitychange", visibility);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [bookingId, requestedConversation, requestedMessageId, client, userId, loadMembers, markRead]);

  useEffect(() => {
    if (!client) return;
    const media = messages.filter(message => ["image", "video"].includes(message.message_type) && typeof message.metadata?.attachment_id !== "string");
    if (!media.length) return;
    let active = true;
    void client.from("message_attachments").select("id,message_id,mime_type").in("message_id", media.map(message => message.id)).then(result => {
      if (!active || result.error) return;
      setAttachments(Object.fromEntries((result.data ?? []).map(row => [row.message_id as string, { id: row.id as string, mime_type: row.mime_type as string }])));
    });
    return () => { active = false; };
  }, [messages, client]);

  useEffect(() => {
    const list = listRef.current; if (!list) return;
    if (requestedMessageId && !focusedTarget.current) {
      const target = document.getElementById(`message-${requestedMessageId}`);
      if (target && list.contains(target)) { target.scrollIntoView({ block: "center" }); focusedTarget.current = true; return; }
    }
    if (olderScroll.current) { list.scrollTop = olderScroll.current.top + list.scrollHeight - olderScroll.current.height; olderScroll.current = null; }
    else if (followLatest.current) list.scrollTop = list.scrollHeight;
  }, [messages.length, requestedMessageId, quotes]);

  useEffect(() => {
    readCursor.current = messages.at(-1)?.id ?? "";
    if (conversationId) void markRead(conversationId).catch(() => undefined);
  }, [messages, conversationId, markRead]);

  async function loadOlder() {
    const oldest = messages[0]; if (!client || !conversationId || !oldest || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const result = await client.from("messages").select(messageColumns).eq("conversation_id", conversationId).is("deleted_at", null)
        .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize);
      if (result.error) throw result.error;
      const older = ((result.data ?? []) as ConversationMessage[]).reverse();
      if (older.length && listRef.current) olderScroll.current = { height: listRef.current.scrollHeight, top: listRef.current.scrollTop };
      setMessages(current => mergeConversationMessages(current, older)); setHasOlder(older.length === pageSize);
    } catch (caught) { setError(publicErrorMessage(caught, "Impossible de charger les messages précédents.")); }
    finally { loadingOlder.current = false; }
  }

  function received(message: ConversationMessage) {
    followLatest.current = true; setMessages(current => mergeConversationMessages(current, [message])); changed.current?.(); reconcileRef.current();
  }
  async function send(body: string, catalog?: boolean) {
    if (!client || !conversationId || sendingRef.current) return false;
    const payload = JSON.stringify({ body, catalog });
    if (nonce.current?.payload !== payload) nonce.current = { payload, id: crypto.randomUUID() };
    sendingRef.current = true; setSending(true); setError("");
    try {
      const result = catalog === undefined
        ? await client.rpc("send_conversation_message", { target_conversation_id: conversationId, target_body: body, target_client_nonce: nonce.current.id })
        : await client.rpc("send_conversation_reference", { target_conversation_id: conversationId, target_service_id: catalog ? null : body, target_catalog: catalog, target_client_nonce: nonce.current.id });
      if (result.error) throw result.error;
      received(sentMessage(result.data)); nonce.current = null; return true;
    } catch (caught) { setError(publicErrorMessage(caught, "Le message n’a pas pu être envoyé. Votre saisie est conservée.")); return false; }
    finally { sendingRef.current = false; setSending(false); }
  }
  async function sendText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const body = String(new FormData(form).get("message") ?? "").trim();
    if (body && await send(body)) form.reset();
  }

  const others = members.filter(member => member.profile_id !== userId);
  const lastOwn = [...messages].reverse().find(message => message.sender_id === userId);
  const isRead = lastOwn && others.length > 0 && others.every(member => member.last_read_at && member.last_read_at >= lastOwn.created_at);
  const activeServices = services.filter(service => service.is_active);
  const drafts = quotes.filter(quote => quote.status === "draft" && quote.provider_id === userId);
  const selectedService = activeServices.find(service => service.id === serviceId);

  function serviceCard(service: ConversationService) {
    return <div className="conversation-service-card" key={service.id}>
      {service.cover_url && <Image src={service.cover_url} width={240} height={160} unoptimized alt={service.title} />}
      <strong>{service.title}</strong><span>{providerName}</span>
      <p>{conversationPrice(service.price_amount, service.currency)} · {service.duration_minutes} min</p>
      <div className="conversation-actions"><a href={`/service/${encodeURIComponent(service.id)}`}>Voir la prestation</a>{service.is_active && <a className="primary-button" href={`/?service=${encodeURIComponent(service.id)}`}>Réserver</a>}</div>
    </div>;
  }

  return <article className="panel conversation-panel" id="booking-conversation" aria-labelledby="conversation-title">
    <div className="panel-heading"><div><h2 id="conversation-title">{summary?.other_display_name ?? "Messages"}</h2>
      <small>{summary?.service_title ?? serviceTitle ?? "Conversation privée"}</small>
      {summary?.starts_at && <small className="conversation-context">{conversationDate(summary.starts_at)} · {statusLabel(summary.status ?? "")}</small>}
    </div><button type="button" onClick={onClose}>Fermer</button></div>
    {error && <p className="conversation-error" role="alert">{error}</p>}
    {refreshError && <p className="conversation-error" role="alert">{refreshError} <button type="button" onClick={() => reconcileRef.current()}>Réessayer</button></p>}
    {auxError && <p className="conversation-error" role="alert">{auxError}</p>}
    <div className="message-list" ref={listRef} aria-label="Historique de la conversation" tabIndex={0} aria-live="polite" aria-busy={loading} onScroll={() => { const list = listRef.current; if (list) followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; if (conversationId && followLatest.current) void markRead(conversationId).catch(() => undefined); }}>
      {hasOlder && <button className="load-older" type="button" onClick={() => void loadOlder()}>Afficher les messages précédents</button>}
      {loading && <p className="compact-empty">Chargement de la conversation…</p>}
      {!loading && !error && messages.length === 0 && <p className="compact-empty">Commencez la conversation avec {summary?.other_display_name ?? "votre correspondant"}.</p>}
      {messages.map(message => {
        const type = message.message_type;
        if (!type || ["text", "system", "location"].includes(type)) return <MessageBubble key={message.id} messageId={message.id} highlighted={message.id === requestedMessageId} own={message.sender_id === userId} body={message.body} createdAt={message.created_at} />;
        const attachmentId = typeof message.metadata?.attachment_id === "string" ? message.metadata.attachment_id : attachments[message.id]?.id;
        const service = services.find(item => item.id === message.metadata?.service_id);
        const quote = quotes.find(item => item.id === message.metadata?.quote_id);
        return <div key={message.id} id={`message-${message.id}`} className={`message-bubble message-bubble-rich${message.sender_id === userId ? " own" : ""}${message.id === requestedMessageId ? " message-highlighted" : ""}`}>
          {["image", "video"].includes(type) && (attachmentId ? <ConversationAttachment attachmentId={attachmentId} video={type === "video"} onReady={() => { if (followLatest.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }} /> : <p>Média momentanément indisponible.</p>)}
          {type === "service" && (service ? serviceCard(service) : <p>Cette prestation n’est plus disponible.</p>)}
          {type === "catalog" && <><strong>Catalogue de {providerName}</strong>{activeServices.length ? <details><summary>Voir les {activeServices.length} prestations</summary><div className="conversation-catalog">{activeServices.map(serviceCard)}</div></details> : <p>Aucune prestation actuellement disponible.</p>}</>}
          {type === "quote" && (summary?.client_id !== userId && summary?.provider_id !== userId ? <p>Devis réservé au client et au professionnel.</p> : quote ? <ConversationQuoteCard quote={quote} userId={userId} onChanged={() => reconcileRef.current()} /> : <p>Devis momentanément indisponible. <button type="button" onClick={() => reconcileRef.current()}>Actualiser</button></p>)}
          <time dateTime={message.created_at}>{conversationDate(message.created_at)}</time>
        </div>;
      })}
      {lastOwn && <small className="read-receipt">{isRead ? "Lu" : "Envoyé"}</small>}
    </div>
    {conversationId && <>
      <div className="conversation-tools" aria-label="Pièces jointes et prestations">
        <button type="button" aria-expanded={tool === "media"} onClick={() => setTool(tool === "media" ? null : "media")}>Photo / vidéo</button>
        <button type="button" aria-expanded={tool === "service"} onClick={() => setTool(tool === "service" ? null : "service")}>Partager une prestation</button>
        {summary?.provider_id === userId && <button type="button" aria-expanded={tool === "quote"} onClick={() => { setEditingQuote(null); setTool(tool === "quote" ? null : "quote"); }}>Créer un devis</button>}
      </div>
      {tool === "media" && <ConversationMediaUpload conversationId={conversationId} onSent={received} />}
      {tool === "service" && <div className="conversation-reference-picker"><label>Prestation à partager<select value={serviceId} onChange={event => setServiceId(event.target.value)} disabled={sending}><option value="">Choisir une prestation</option>{activeServices.map(service => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label>
        {selectedService && serviceCard(selectedService)}
        <div className="conversation-actions"><button type="button" disabled={sending || !serviceId} onClick={() => void send(serviceId, false)}>Partager la prestation</button><button type="button" disabled={sending || !activeServices.length} onClick={() => void send("", true)}>Partager le catalogue</button></div>
        {!activeServices.length && <p>Aucune prestation disponible pour ce professionnel.</p>}
      </div>}
      {tool === "quote" && summary?.provider_id === userId && <ConversationQuoteForm key={editingQuote?.id ?? "new"} conversationId={conversationId} services={activeServices} existing={editingQuote} onSaved={() => { setTool(null); setEditingQuote(null); reconcileRef.current(); }} onClose={() => setTool(null)} />}
      {drafts.length > 0 && <details className="conversation-drafts"><summary>Mes brouillons de devis ({drafts.length})</summary>{drafts.map(quote => <ConversationQuoteCard key={quote.id} quote={quote} userId={userId} onChanged={() => reconcileRef.current()} onEdit={value => { setEditingQuote(value); setTool("quote"); }} />)}</details>}
    </>}
    <form className="message-composer" onSubmit={event => void sendText(event)}><label className="sr-only" htmlFor="booking-message">Votre message</label>
      <textarea id="booking-message" name="message" required minLength={1} maxLength={4000} rows={2} placeholder="Écrire un message…" disabled={!conversationId || sending} />
      <button className="primary-button" type="submit" disabled={!conversationId || sending}>{sending ? "Envoi…" : "Envoyer"}</button>
    </form>
  </article>;
}
