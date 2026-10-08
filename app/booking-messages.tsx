"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { statusLabel } from "@/lib/ui/status-label";
import { MessageBubble } from "./message-bubble";

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type MemberRow = {
  profile_id: string;
  last_read_at: string | null;
};

const pageSize = 50;

function mergeMessages(current: MessageRow[], incoming: MessageRow[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export function BookingMessages({
  bookingId,
  serviceTitle,
  userId,
  onClose,
}: {
  bookingId: string;
  serviceTitle: string;
  userId: string;
  onClose: () => void;
}) {
  const supabase = getSupabaseBrowserClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(supabase ? "" : "Supabase n’est pas configuré.");
  const [refreshError, setRefreshError] = useState("");
  const [context, setContext] = useState<{ name: string; startsAt: string; status: string } | null>(null);
  const [contextError, setContextError] = useState("");
  const sendingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const olderScroll = useRef<{ height: number; top: number } | null>(null);
  const loadingOlder = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    const controller = new AbortController();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/bookings/conversation-context?booking=${encodeURIComponent(bookingId)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, signal: controller.signal,
      });
      if (!response.ok) throw new Error("context_unavailable");
      const value: { name: string; startsAt: string; status: string } = await response.json();
      if (!controller.signal.aborted) setContext(value);
    })().catch(() => {
      if (!controller.signal.aborted) setContextError("Les informations du rendez-vous sont momentanément indisponibles.");
    });
    return () => controller.abort();
  }, [bookingId, supabase]);

  const loadMembers = useCallback(async (selectedConversationId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error: memberError } = await supabase
      .from("conversation_members")
      .select("profile_id,last_read_at")
      .eq("conversation_id", selectedConversationId);
    if (memberError) throw memberError;
    setMembers((data ?? []) as MemberRow[]);
  }, []);

  const markRead = useCallback(async (selectedConversationId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error: readError } = await supabase.rpc("mark_conversation_read", {
      target_conversation_id: selectedConversationId,
    });
    if (readError) throw readError;
    await loadMembers(selectedConversationId);
  }, [loadMembers]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    let active = true;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;
    let reconcile = () => {};

    async function initialize() {
      setLoading(true);
      setError("");
      const { data, error: conversationError } = await client.rpc("ensure_booking_conversation", {
        target_booking_id: bookingId,
      });
      if (conversationError) throw conversationError;
      const selectedConversationId = data as string;
      if (!active) return;
      setConversationId(selectedConversationId);

      const { data: messageData, error: messageError } = await client
        .from("messages")
        .select("id,sender_id,body,created_at")
        .eq("conversation_id", selectedConversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(pageSize);
      if (messageError) throw messageError;
      if (!active) return;
      const initialMessages = ((messageData ?? []) as MessageRow[]).reverse();
      setMessages(initialMessages);
      setHasOlder(initialMessages.length === pageSize);
      await markRead(selectedConversationId);
      if (!active) return;

      // Realtime can miss an insert between the initial SELECT and subscription,
      // or while disconnected. Reconcile from the last successful read cursor.
      let cursor = initialMessages.at(-1)?.created_at ?? "1970-01-01T00:00:00.000Z";
      let refreshing = false;
      async function refreshMessages() {
        if (!active || refreshing) return;
        refreshing = true;
        try {
          const since = cursor;
          let received = false;
          for (let offset = 0; active; offset += pageSize) {
            const result = await client.from("messages").select("id,sender_id,body,created_at")
              .eq("conversation_id", selectedConversationId).is("deleted_at", null)
              .gte("created_at", since).order("created_at").order("id")
              .range(offset, offset + pageSize - 1);
            if (result.error) throw result.error;
            if (!active) return;
            const incoming = result.data as MessageRow[];
            received ||= incoming.some(message => message.sender_id !== userId && message.created_at > since);
            setMessages(current => mergeMessages(current, incoming));
            if (incoming.length) cursor = incoming.at(-1)!.created_at;
            if (incoming.length < pageSize) break;
          }
          if (received) await markRead(selectedConversationId);
          else await loadMembers(selectedConversationId);
          if (active) setRefreshError("");
        } catch (caught: unknown) {
          if (active) setRefreshError(publicErrorMessage(caught, "Actualisation interrompue. Une nouvelle tentative sera effectuée."));
        } finally { refreshing = false; }
      }
      reconcile = () => { void refreshMessages(); };
      refreshTimer = setInterval(reconcile, 10_000);
      window.addEventListener("online", reconcile);
      window.addEventListener("focus", reconcile);

      channel = client
        .channel(`booking-conversation:${selectedConversationId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedConversationId}`,
        }, (payload) => {
          const message = payload.new as MessageRow;
          setMessages((current) => mergeMessages(current, [message]));
          if (message.sender_id !== userId) void markRead(selectedConversationId).catch(() => undefined);
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${selectedConversationId}`,
        }, () => void loadMembers(selectedConversationId).catch(() => undefined))
        .subscribe(status => { if (status === "SUBSCRIBED") reconcile(); });
    }

    void initialize().catch((caught: unknown) => {
      if (active) setError(publicErrorMessage(caught, "Impossible d’ouvrir la conversation."));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      clearInterval(refreshTimer);
      window.removeEventListener("online", reconcile);
      window.removeEventListener("focus", reconcile);
      if (channel) void client.removeChannel(channel);
    };
  }, [bookingId, loadMembers, markRead, supabase, userId]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (olderScroll.current) {
      list.scrollTop = olderScroll.current.top + list.scrollHeight - olderScroll.current.height;
      olderScroll.current = null;
    } else if (followLatest.current) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function loadOlder() {
    const supabase = getSupabaseBrowserClient();
    const oldest = messages[0];
    if (!supabase || !conversationId || !oldest || loadingOlder.current) return;
    loadingOlder.current = true;
    const { data, error: olderError } = await supabase
      .from("messages")
      .select("id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(pageSize);
    loadingOlder.current = false;
    if (olderError) {
      setError(publicErrorMessage(olderError, "Impossible de charger les messages précédents."));
      return;
    }
    const older = ((data ?? []) as MessageRow[]).reverse();
    if (older.length && listRef.current) olderScroll.current = { height: listRef.current.scrollHeight, top: listRef.current.scrollTop };
    setMessages((current) => mergeMessages(current, older));
    setHasOlder(older.length === pageSize);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !conversationId || sendingRef.current) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("message") ?? "").trim();
    if (!body) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const { data, error: sendError } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: userId, body })
        .select("id,sender_id,body,created_at")
        .single();
      if (sendError) throw sendError;
      form.reset();
      followLatest.current = true;
      setMessages((current) => mergeMessages(current, [data as MessageRow]));
    } catch (caught: unknown) {
      setError(publicErrorMessage(caught, "Le message n’a pas pu être envoyé. Votre texte est conservé."));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const otherMember = members.find((member) => member.profile_id !== userId);
  const lastOwnMessage = [...messages].reverse().find((message) => message.sender_id === userId);
  const lastOwnMessageRead = Boolean(
    lastOwnMessage && otherMember?.last_read_at && otherMember.last_read_at >= lastOwnMessage.created_at,
  );

  return (
    <article className="panel conversation-panel" id="booking-conversation" aria-labelledby="conversation-title">
      <div className="panel-heading">
        <div><h2 id="conversation-title">{context?.name ?? "Messages"}</h2><small>{serviceTitle}</small>
          {context && <small className="conversation-context">{new Intl.DateTimeFormat("fr-SN", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(context.startsAt))} · {statusLabel(context.status)}</small>}
          {contextError && <small role="status">{contextError}</small>}
        </div>
        <button type="button" onClick={onClose}>Fermer</button>
      </div>
      {error && <p className="conversation-error" role="alert">{error}</p>}
      {refreshError && <p className="conversation-error" role="alert">{refreshError}</p>}
      <div className="message-list" ref={listRef} aria-label="Historique de la conversation" tabIndex={0} aria-live="polite" aria-busy={loading}
        onScroll={() => { const list = listRef.current; if (list) followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; }}>
        {hasOlder && <button className="load-older" type="button" onClick={() => void loadOlder()}>Afficher les messages précédents</button>}
        {loading && <p className="compact-empty">Chargement de la conversation…</p>}
        {!loading && messages.length === 0 && <p className="compact-empty">Commencez la conversation au sujet de ce rendez-vous.</p>}
        {messages.map((message) => (
          <MessageBubble key={message.id} own={message.sender_id === userId} body={message.body} createdAt={message.created_at} />
        ))}
        {lastOwnMessage && <small className="read-receipt">{lastOwnMessageRead ? "Lu" : "Envoyé"}</small>}
      </div>
      <form className="message-composer" onSubmit={(event) => void sendMessage(event)}>
        <label className="sr-only" htmlFor="booking-message">Votre message</label>
        <textarea id="booking-message" name="message" required minLength={1} maxLength={4000} rows={2} placeholder="Écrire un message…" disabled={!conversationId || sending} />
        <button className="primary-button" type="submit" disabled={!conversationId || sending}>{sending ? "Envoi…" : "Envoyer"}</button>
      </form>
    </article>
  );
}
