"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { statusLabel } from "@/lib/ui/status-label";
import { MessageBubble } from "./message-bubble";

type MessageRow = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type MemberRow = { conversation_id: string; profile_id: string; last_read_at: string | null };
type AppointmentContext = { id: string; startsAt: string; status: string; serviceTitle: string | null };
const pageSize = 50;

function mergeMessages(current: MessageRow[], incoming: MessageRow[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export function BookingMessages({
  bookingId,
  serviceTitle,
  userId,
  canReply = true,
  onClose,
  conversationIds,
  appointmentBookings,
  isGroup = false,
  existingConversationOnly = false,
  title,
  profilePath,
}: {
  bookingId: string;
  serviceTitle: string;
  userId: string;
  canReply?: boolean;
  onClose: () => void;
  conversationIds?: string[];
  appointmentBookings?: AppointmentContext[];
  isGroup?: boolean;
  existingConversationOnly?: boolean;
  title?: string;
  profilePath?: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const conversationIdsKey = conversationIds?.join(",") ?? "";
  const suppliedConversationIds = useMemo(() => conversationIdsKey ? conversationIdsKey.split(",") : [], [conversationIdsKey]);
  const [activeConversationIds, setActiveConversationIds] = useState<string[]>(suppliedConversationIds);
  const [conversationId, setConversationId] = useState<string | null>(suppliedConversationIds.at(-1) ?? null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(supabase ? "" : "Supabase n’est pas configuré.");
  const [refreshError, setRefreshError] = useState("");
  const [context, setContext] = useState<{ name: string; startsAt: string; status: string; profilePath?: string | null } | null>(null);
  const [contextError, setContextError] = useState("");
  const sendingRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const olderScroll = useRef<{ height: number; top: number } | null>(null);
  const dateTime = useMemo(() => new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }), []);

  useEffect(() => {
    if (!supabase) return;
    const controller = new AbortController();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/bookings/conversation-context?booking=${encodeURIComponent(bookingId)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) throw new Error("context_unavailable");
      const value = await response.json() as { name: string; startsAt: string; status: string; profilePath?: string | null };
      if (!controller.signal.aborted) setContext(value);
    })().catch(() => {
      if (!controller.signal.aborted) setContextError("Les informations du rendez-vous sont momentanément indisponibles.");
    });
    return () => controller.abort();
  }, [bookingId, supabase]);

  const loadMembers = useCallback(async (selectedConversationIds: string[]) => {
    const client = getSupabaseBrowserClient();
    if (!client || !selectedConversationIds.length) return;
    const { data, error: memberError } = await client.from("conversation_members")
      .select("conversation_id,profile_id,last_read_at").in("conversation_id", selectedConversationIds);
    if (memberError) throw memberError;
    setMembers((data ?? []) as MemberRow[]);
  }, []);

  const markRead = useCallback(async (selectedConversationIds: string[]) => {
    const client = getSupabaseBrowserClient();
    if (!client || !selectedConversationIds.length) return;
    const results = await Promise.all(selectedConversationIds.map(targetConversationId => client.rpc("mark_conversation_read", {
      target_conversation_id: targetConversationId,
    })));
    const failure = results.find(result => result.error);
    if (failure?.error) throw failure.error;
    await loadMembers(selectedConversationIds);
  }, [loadMembers]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;
    const channels: RealtimeChannel[] = [];
    let reconcile = () => {};

    async function initialize() {
      setLoading(true);
      setError("");
      let ids = suppliedConversationIds;
      if (!existingConversationOnly) {
        const { data, error: conversationError } = await client.rpc("ensure_booking_conversation", { target_booking_id: bookingId });
        if (conversationError) throw conversationError;
        const ensuredId = data as string;
        ids = [ensuredId, ...ids.filter(id => id !== ensuredId)];
      } else if (!ids.length) {
        throw new Error("conversation_unavailable");
      }
      if (!active || !ids.length) return;
      setActiveConversationIds(ids);
      setConversationId(ids[0] ?? null);

      const { data, error: messageError } = await client.from("messages")
        .select("id,conversation_id,sender_id,body,created_at").in("conversation_id", ids)
        .is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize);
      if (messageError) throw messageError;
      const initial = ((data ?? []) as MessageRow[]).reverse();
      if (!active) return;
      setMessages(initial);
      setHasOlder(initial.length === pageSize);
      await markRead(ids);
      if (!active) return;

      let cursor = initial.at(-1)?.created_at ?? "1970-01-01T00:00:00.000Z";
      let refreshing = false;
      async function refreshMessages() {
        if (!active || refreshing) return;
        refreshing = true;
        try {
          let received = false;
          for (let offset = 0; active; offset += pageSize) {
            const result = await client.from("messages").select("id,conversation_id,sender_id,body,created_at")
              .in("conversation_id", ids).is("deleted_at", null).gte("created_at", cursor)
              .order("created_at").order("id").range(offset, offset + pageSize - 1);
            if (result.error) throw result.error;
            const incoming = result.data as MessageRow[];
            received ||= incoming.some(message => message.sender_id !== userId && message.created_at >= cursor);
            setMessages(current => mergeMessages(current, incoming));
            if (incoming.length) cursor = incoming.at(-1)!.created_at;
            if (incoming.length < pageSize) break;
          }
          if (received) await markRead(ids);
          else await loadMembers(ids);
          if (active) setRefreshError("");
        } catch (caught: unknown) {
          if (active) setRefreshError(publicErrorMessage(caught, "Actualisation interrompue. Une nouvelle tentative sera effectuée."));
        } finally { refreshing = false; }
      }
      reconcile = () => { void refreshMessages(); };
      refreshTimer = setInterval(reconcile, 10_000);
      window.addEventListener("online", reconcile);
      window.addEventListener("focus", reconcile);

      for (const selectedConversationId of ids) {
        const channel = client.channel(`booking-conversation:${selectedConversationId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedConversationId}` }, payload => {
            const message = payload.new as MessageRow;
            setMessages(current => mergeMessages(current, [message]));
            if (message.sender_id !== userId) void markRead(ids).catch(() => undefined);
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${selectedConversationId}` }, () => {
            void loadMembers(ids).catch(() => undefined);
          })
          .subscribe(status => { if (status === "SUBSCRIBED") reconcile(); });
        channels.push(channel);
      }
    }

    void initialize().catch((caught: unknown) => {
      if (active) setError(publicErrorMessage(caught, "Impossible d’ouvrir la conversation."));
    }).finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      clearInterval(refreshTimer);
      window.removeEventListener("online", reconcile);
      window.removeEventListener("focus", reconcile);
      for (const channel of channels) void client.removeChannel(channel);
    };
  }, [bookingId, existingConversationOnly, loadMembers, markRead, suppliedConversationIds, supabase, userId]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (olderScroll.current) {
      list.scrollTop = olderScroll.current.top + list.scrollHeight - olderScroll.current.height;
      olderScroll.current = null;
    } else if (followLatest.current) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function loadOlder() {
    const client = getSupabaseBrowserClient();
    const oldest = messages[0];
    if (!client || !activeConversationIds.length || !oldest || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const { data, error: olderError } = await client.from("messages")
      .select("id,conversation_id,sender_id,body,created_at").in("conversation_id", activeConversationIds)
      .is("deleted_at", null)
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize);
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    if (olderError) { setError(publicErrorMessage(olderError, "Impossible de charger les messages précédents.")); return; }
    const older = ((data ?? []) as MessageRow[]).reverse();
    if (older.length && listRef.current) olderScroll.current = { height: listRef.current.scrollHeight, top: listRef.current.scrollTop };
    setMessages(current => mergeMessages(current, older));
    setHasOlder(older.length === pageSize);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client || !conversationId || sendingRef.current) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("message") ?? "").trim();
    if (!body) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const { data, error: sendError } = await client.from("messages")
        .insert({ conversation_id: conversationId, sender_id: userId, body })
        .select("id,conversation_id,sender_id,body,created_at").single();
      if (sendError) throw sendError;
      form.reset();
      followLatest.current = true;
      setMessages(current => mergeMessages(current, [data as MessageRow]));
    } catch (caught: unknown) {
      setError(publicErrorMessage(caught, "Le message n’a pas pu être envoyé. Votre texte est conservé."));
    } finally { sendingRef.current = false; setSending(false); }
  }

  const lastOwnMessage = [...messages].reverse().find(message => message.sender_id === userId);
  const otherMember = lastOwnMessage
    ? members.find(member => member.conversation_id === lastOwnMessage.conversation_id && member.profile_id !== userId)
    : undefined;
  const lastOwnMessageRead = Boolean(lastOwnMessage && otherMember?.last_read_at && otherMember.last_read_at >= lastOwnMessage.created_at);
  return <article className="panel conversation-panel" id="booking-conversation" aria-labelledby="conversation-title">
    <div className="panel-heading">
      <div><h2 id="conversation-title">{title ?? context?.name ?? "Messages"}</h2>
        <small>{appointmentBookings?.length ? `${appointmentBookings.length} rendez-vous associés` : serviceTitle}</small>
        {(profilePath ?? context?.profilePath) && <Link href={profilePath ?? context!.profilePath!}>Voir le profil</Link>}
        {context && <small className="conversation-context">{dateTime.format(new Date(context.startsAt))} · {statusLabel(context.status)}</small>}
        {contextError && <small role="status">{contextError}</small>}
      </div>
      <button type="button" onClick={onClose}>Fermer</button>
    </div>
    {appointmentBookings && appointmentBookings.length > 0 && <details className="conversation-appointments">
      <summary>Rendez-vous liés ({appointmentBookings.length})</summary>
      <ul>{appointmentBookings.map(booking => <li key={booking.id}>{booking.serviceTitle ?? "Prestation beauté"} · {dateTime.format(new Date(booking.startsAt))} · {statusLabel(booking.status)}</li>)}</ul>
    </details>}
    {error && <p className="conversation-error" role="alert">{error}</p>}
    {refreshError && <p className="conversation-error" role="alert">{refreshError}</p>}
    <div className="message-list" ref={listRef} aria-label="Historique de la conversation" tabIndex={0} aria-live="polite" aria-busy={loading}
      onScroll={() => { const list = listRef.current; if (list) followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; }}>
      {hasOlder && <button className="load-older" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Chargement…" : "Afficher les messages précédents"}</button>}
      {loading && <p className="compact-empty">Chargement de la conversation…</p>}
      {!loading && messages.length === 0 && <p className="compact-empty">Commencez la conversation au sujet de ce rendez-vous.</p>}
      {messages.map((message, index) => {
        const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(message.created_at));
        const previous = messages[index - 1];
        const previousDay = previous ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(previous.created_at)) : "";
        const showDay = day !== previousDay;
        return <Fragment key={message.id}>{showDay && <div className="message-day-separator"><span>{day}</span></div>}<MessageBubble own={message.sender_id === userId} body={message.body} createdAt={message.created_at} /></Fragment>;
      })}
      {!isGroup && lastOwnMessage && <small className="read-receipt">{lastOwnMessageRead ? "Lu" : "Envoyé"}</small>}
    </div>
    {canReply ? <form className="message-composer" onSubmit={event => void sendMessage(event)}>
      <label className="sr-only" htmlFor="booking-message">Votre message</label>
      <textarea id="booking-message" name="message" required minLength={1} maxLength={4000} rows={2} placeholder="Écrire un message…" disabled={!conversationId || sending} />
      <button className="primary-button" type="submit" disabled={!conversationId || sending}>{sending ? "Envoi…" : "Envoyer"}</button>
    </form> : <p className="salon-feedback">Accès en lecture seule : votre rôle ne permet pas de répondre.</p>}
  </article>;
}
