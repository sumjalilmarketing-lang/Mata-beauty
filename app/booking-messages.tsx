"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

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
  const endRef = useRef<HTMLDivElement>(null);

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
        .subscribe((status) => {
          if (status !== "SUBSCRIBED" || !active) return;

          // Close the gap between the initial query and the Realtime subscription.
          // A message committed during that handshake would otherwise remain hidden
          // until the user reloads the conversation.
          void (async () => {
            try {
              const { data, error: catchUpError } = await client
                .from("messages")
                .select("id,sender_id,body,created_at")
                .eq("conversation_id", selectedConversationId)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .limit(pageSize);
              if (catchUpError) throw catchUpError;
              if (!active) return;
              const latestMessages = ((data ?? []) as MessageRow[]).reverse();
              setMessages((current) => mergeMessages(current, latestMessages));
              setHasOlder(latestMessages.length === pageSize);
              await markRead(selectedConversationId);
            } catch (caught: unknown) {
              if (active) setError(publicErrorMessage(caught, "Impossible de synchroniser la conversation."));
            }
          })();
        });
    }

    void initialize().catch((caught: unknown) => {
      if (active) setError(publicErrorMessage(caught, "Impossible d’ouvrir la conversation."));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      if (channel) void client.removeChannel(channel);
    };
  }, [bookingId, loadMembers, markRead, supabase, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function loadOlder() {
    const supabase = getSupabaseBrowserClient();
    const oldest = messages[0];
    if (!supabase || !conversationId || !oldest) return;
    const { data, error: olderError } = await supabase
      .from("messages")
      .select("id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(pageSize);
    if (olderError) {
      setError(publicErrorMessage(olderError, "Impossible de charger les messages précédents."));
      return;
    }
    const older = ((data ?? []) as MessageRow[]).reverse();
    setMessages((current) => mergeMessages(current, older));
    setHasOlder(older.length === pageSize);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !conversationId || sending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("message") ?? "").trim();
    if (!body) return;
    setSending(true);
    setError("");
    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: userId, body })
      .select("id,sender_id,body,created_at")
      .single();
    setSending(false);
    if (sendError) {
      setError(publicErrorMessage(sendError, "Le message n’a pas pu être envoyé."));
      return;
    }
    form.reset();
    setMessages((current) => mergeMessages(current, [data as MessageRow]));
  }

  const otherMember = members.find((member) => member.profile_id !== userId);
  const lastOwnMessage = [...messages].reverse().find((message) => message.sender_id === userId);
  const lastOwnMessageRead = Boolean(
    lastOwnMessage && otherMember?.last_read_at && otherMember.last_read_at >= lastOwnMessage.created_at,
  );

  return (
    <article className="panel conversation-panel" id="booking-conversation" aria-labelledby="conversation-title">
      <div className="panel-heading">
        <div><h2 id="conversation-title">Messages</h2><small>{serviceTitle} · conversation privée liée au rendez-vous</small></div>
        <button type="button" onClick={onClose}>Fermer</button>
      </div>
      {error && <p className="conversation-error" role="alert">{error}</p>}
      <div className="message-list" aria-live="polite" aria-busy={loading}>
        {hasOlder && <button className="load-older" type="button" onClick={() => void loadOlder()}>Afficher les messages précédents</button>}
        {loading && <p className="compact-empty">Chargement de la conversation…</p>}
        {!loading && messages.length === 0 && <p className="compact-empty">Commencez la conversation au sujet de ce rendez-vous.</p>}
        {messages.map((message) => (
          <div className={message.sender_id === userId ? "message-bubble own" : "message-bubble"} key={message.id}>
            <p>{message.body}</p>
            <time dateTime={message.created_at}>{new Intl.DateTimeFormat("fr-SN", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(message.created_at))}</time>
          </div>
        ))}
        {lastOwnMessage && <small className="read-receipt">{lastOwnMessageRead ? "Lu" : "Envoyé"}</small>}
        <div ref={endRef} />
      </div>
      <form className="message-composer" onSubmit={(event) => void sendMessage(event)}>
        <label className="sr-only" htmlFor="booking-message">Votre message</label>
        <textarea id="booking-message" name="message" required minLength={1} maxLength={4000} rows={2} placeholder="Écrire un message…" disabled={!conversationId || sending} />
        <button className="primary-button" type="submit" disabled={!conversationId || sending}>{sending ? "Envoi…" : "Envoyer"}</button>
      </form>
    </article>
  );
}
