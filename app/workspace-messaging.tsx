"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookingMessages } from "./booking-messages";
import { ConversationMessages } from "./conversation-messages";
import { conversationDate, messagePreview, type ConversationSummary } from "./conversation-types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { statusLabel } from "@/lib/ui/status-label";
import "./conversation-messages.css";

type BookingRow = { id: string; starts_at: string; status: string; provider_services: { title: string | null } | null; legacy_conversations: { id: string }[] | { id: string } | null };
type Selection = { conversationId: string } | { bookingId: string; serviceTitle: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listPageSize = 50;
function mergeThreads(current: ConversationSummary[], incoming: ConversationSummary[]) {
  const rows = new Map(current.map(row => [row.conversation_id, row]));
  for (const row of incoming) rows.set(row.conversation_id, row);
  return [...rows.values()].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at) || b.conversation_id.localeCompare(a.conversation_id));
}

export function WorkspaceMessaging({ userId }: { userId: string }) {
  const searchParams = useSearchParams();
  const requestedBooking = searchParams.get("booking");
  const requestedConversation = searchParams.get("conversation");
  const requestedProvider = searchParams.get("provider");
  const messageParam = searchParams.get("message") ?? searchParams.get("messageId");
  const requestedMessageId = messageParam && uuid.test(messageParam) ? messageParam : null;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const rowsRef = useRef<ConversationSummary[]>([]);
  const pageCursor = useRef<{ at: string; id: string } | null>(null);
  const moreLoaded = useRef(false);
  const moreBusy = useRef(false);
  const active = useRef(true);

  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) { if (active.current) { setError("La messagerie est momentanément indisponible."); setLoading(false); } return; }
    try {
      const [threads, appointments] = await Promise.all([
        client.rpc("list_my_conversations_page", { target_before_at: null, target_before_id: null, target_limit: listPageSize }),
        client.from("bookings").select("id,starts_at,status,provider_services(title),legacy_conversations:conversations!conversations_booking_id_fkey(id)").is("conversation_id", null).order("starts_at", { ascending: false }).limit(100),
      ]);
      if (threads.error) throw threads.error; if (appointments.error) throw appointments.error;
      if (!active.current) return;
      const rows = (threads.data ?? []) as ConversationSummary[];
      rowsRef.current = moreLoaded.current ? mergeThreads(rowsRef.current, rows) : rows;
      setConversations(rowsRef.current);
      if (!moreLoaded.current) {
        const last = rows.at(-1); pageCursor.current = last ? { at: last.last_message_at, id: last.conversation_id } : null;
        setHasMore(rows.length === listPageSize);
      }
      setBookings(((appointments.data ?? []) as unknown as BookingRow[]).filter(booking => !booking.legacy_conversations || (Array.isArray(booking.legacy_conversations) && booking.legacy_conversations.length === 0)));
      setError("");
    } catch (caught) { if (active.current) setError(publicErrorMessage(caught, "Impossible de charger vos conversations.")); }
    finally { if (active.current) setLoading(false); }
  }, []);

  async function loadMore() {
    const client = getSupabaseBrowserClient(); const cursor = pageCursor.current;
    if (!client || !cursor || moreBusy.current) return;
    moreBusy.current = true; setLoadingMore(true);
    try {
      const result = await client.rpc("list_my_conversations_page", { target_before_at: cursor.at, target_before_id: cursor.id, target_limit: listPageSize });
      if (result.error) throw result.error;
      if (!active.current) return;
      const rows = (result.data ?? []) as ConversationSummary[];
      rowsRef.current = mergeThreads(rowsRef.current, rows); moreLoaded.current = true;
      setConversations(rowsRef.current); setHasMore(rows.length === listPageSize);
      const last = rows.at(-1); if (last) pageCursor.current = { at: last.last_message_at, id: last.conversation_id };
      setError("");
    } catch (caught) { if (active.current) setError(publicErrorMessage(caught, "Impossible de charger les conversations précédentes. Réessayez.")); }
    finally { moreBusy.current = false; if (active.current) setLoadingMore(false); }
  }

  useEffect(() => {
    active.current = true; queueMicrotask(() => { if (active.current) void load(); });
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    const refresh = () => { void load(); };
    window.addEventListener("online", refresh); window.addEventListener("focus", refresh);
    const client = getSupabaseBrowserClient();
    const channel = client?.channel(`conversation-list:${userId}`).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${userId}`,
    }, refresh).subscribe();
    return () => {
      active.current = false; clearInterval(timer);
      window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [load, userId]);

  useEffect(() => {
    let cancelled = false;
    async function openRequested() {
      const requested = requestedConversation ?? requestedBooking ?? requestedProvider;
      if (!requested) return;
      if (!uuid.test(requested)) { setError("Ce lien de conversation est invalide."); return; }
      if (requestedConversation) { setSelected({ conversationId: requestedConversation }); return; }
      if (requestedBooking) { setSelected({ bookingId: requestedBooking, serviceTitle: "Rendez-vous" }); return; }
      const client = getSupabaseBrowserClient(); if (!client || !requestedProvider) return;
      const result = await client.rpc("ensure_provider_conversation", { target_provider_id: requestedProvider });
      if (cancelled) return;
      if (result.error) { setError(publicErrorMessage(result.error, "Impossible de contacter ce professionnel.")); return; }
      setSelected({ conversationId: result.data as string }); void load();
    }
    void openRequested().catch(caught => { if (!cancelled) setError(publicErrorMessage(caught, "Impossible d’ouvrir la conversation.")); });
    return () => { cancelled = true; };
  }, [requestedBooking, requestedConversation, requestedProvider, load]);

  const normalized = query.trim().toLocaleLowerCase("fr");
  const knownBookings = new Set(conversations.map(row => row.booking_id).filter(Boolean));
  const visible = conversations.filter(row => Boolean(row.archived_at) === showArchived && (!normalized || `${row.other_display_name} ${row.service_title ?? ""}`.toLocaleLowerCase("fr").includes(normalized)));
  const pendingBookings = showArchived ? [] : bookings.filter(booking => !knownBookings.has(booking.id) && (!normalized || (booking.provider_services?.title ?? "").toLocaleLowerCase("fr").includes(normalized)));

  return <section className={`workspace-content messaging-workspace${selected ? " has-conversation" : ""}`}>
    <div className="workspace-intro"><div><h2>Messages</h2><p>Vos échanges privés avec les clients et les professionnels.</p></div></div>
    <div className="messaging-columns">
      <article className="panel conversation-inbox" id="live-bookings">
        <div className="panel-heading"><h2>Mes conversations</h2><button type="button" onClick={() => void load()}>Actualiser</button></div>
        <label className="conversation-search">Rechercher une conversation<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom ou prestation" /></label>
        {conversations.some(row => row.archived_at) && <label className="conversation-archive-filter"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Afficher les conversations archivées</label>}
        {error && <p role="alert" className="conversation-error">{error}</p>}
        {loading && <div className="compact-empty">Chargement des conversations…</div>}
        {!loading && !error && visible.length === 0 && pendingBookings.length === 0 && <div className="compact-empty">{hasMore ? "Aucun résultat dans cette page. Chargez plus de conversations pour poursuivre." : normalized ? "Aucune conversation ne correspond à votre recherche." : "Aucune conversation pour le moment. Contactez un professionnel depuis son profil ou retrouvez vos échanges après une réservation."}</div>}
        {visible.map(row => <div className={`appointment live-appointment conversation-inbox-row${selected && "conversationId" in selected && selected.conversationId === row.conversation_id ? " selected" : ""}`} key={row.conversation_id}>
          {row.other_avatar_url ? <Image src={row.other_avatar_url} width={44} height={44} alt="" unoptimized /> : <span className="conversation-avatar" aria-hidden="true">{row.other_display_name.slice(0, 1).toLocaleUpperCase("fr")}</span>}
          <div className="conversation-inbox-content"><strong>{row.other_display_name}</strong>
            {row.service_title && <small>{row.service_title}</small>}
            <p>{messagePreview(row.last_message_type, row.last_message_body)}</p>
            <time dateTime={row.last_message_at}>{conversationDate(row.last_message_at)}</time>
          </div>
          <div className="conversation-inbox-actions">
            {Number(row.unread_count) > 0 && <span className="conversation-unread" aria-label={`${row.unread_count} messages non lus`}>{row.unread_count}</span>}
            <button type="button" onClick={() => setSelected({ conversationId: row.conversation_id })}>Messages</button>
          </div>
        </div>)}
        {pendingBookings.map(booking => <div className="appointment live-appointment conversation-pending-booking" key={booking.id}>
          <div><strong>{booking.provider_services?.title ?? "Prestation beauté"}</strong><small>{conversationDate(booking.starts_at)} · {statusLabel(booking.status)}</small></div>
          <button type="button" onClick={() => setSelected({ bookingId: booking.id, serviceTitle: booking.provider_services?.title ?? "Prestation beauté" })}>Messages</button>
        </div>)}
        {hasMore && <button type="button" className="conversation-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Chargement…" : "Charger plus de conversations"}</button>}
      </article>
      {selected && ("conversationId" in selected
        ? <ConversationMessages key={`${selected.conversationId}:${requestedMessageId ?? ""}`} conversationId={selected.conversationId} requestedMessageId={requestedMessageId} userId={userId} onClose={() => setSelected(null)} onChanged={() => void load()} />
        : <BookingMessages key={`${selected.bookingId}:${requestedMessageId ?? ""}`} bookingId={selected.bookingId} requestedMessageId={requestedMessageId} serviceTitle={selected.serviceTitle} userId={userId} onClose={() => { setSelected(null); void load(); }} />)}
    </div>
  </section>;
}
