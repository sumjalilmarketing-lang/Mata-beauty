"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookingMessages } from "./booking-messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { groupBookingConversations, type GroupedBookingConversation } from "@/lib/messaging/group-booking-conversations";

type BookingRow = {
  id: string;
  client_id: string;
  provider_id: string;
  starts_at: string;
  status: string;
  provider_services: { title: string | null } | null;
};
type ConversationRow = {
  id: string;
  booking_id: string | null;
  updated_at: string;
  latestMessage?: MessageRow;
};
type MembershipRow = { conversation_id: string; profile_id: string; last_read_at: string | null };
type MessageRow = { conversation_id: string; body: string; created_at: string; sender_id: string };
type ContextRow = { bookingId: string; participantId: string; name: string; avatarUrl: string | null; startsAt: string; status: string; profilePath?: string };
type Contact = GroupedBookingConversation & { name: string; avatarUrl: string | null; profilePath?: string };

export function WorkspaceMessaging({ userId, staffMode = false, canReply = true }: { userId: string; staffMode?: boolean; canReply?: boolean }) {
  const requestedBooking = useSearchParams().get("booking");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client) {
      queueMicrotask(() => { if (active) { setError("La messagerie est momentanément indisponible."); setLoading(false); } });
      return () => { active = false; };
    }
    const authenticatedClient = client;

    async function load() {
      setLoading(true);
      setError("");
      const bookingResult = staffMode
        ? await authenticatedClient.rpc("list_staff_message_bookings")
        : await authenticatedClient.from("bookings")
          .select("id,client_id,provider_id,starts_at,status,provider_services(title)")
          .order("starts_at", { ascending: false }).limit(100);
      if (bookingResult.error) throw bookingResult.error;

      const bookings: BookingRow[] = staffMode
        ? ((bookingResult.data ?? []) as { id: string; starts_at: string; status: string; service_title: string | null }[])
          .map(row => ({ id: row.id, client_id: "", provider_id: "", starts_at: row.starts_at, status: row.status, provider_services: { title: row.service_title } }))
        : ((bookingResult.data ?? []) as unknown as BookingRow[])
          .filter(row => row.client_id === userId || row.provider_id === userId);
      if (!bookings.length) { if (active) setContacts([]); return; }

      const { data: ownRows, error: membershipError } = await authenticatedClient.from("conversation_members")
        .select("conversation_id,profile_id,last_read_at").eq("profile_id", userId);
      if (membershipError) throw membershipError;
      const ownMemberships = (ownRows ?? []) as MembershipRow[];
      const conversationIds = [...new Set(ownMemberships.map(row => row.conversation_id))];
      let conversations: ConversationRow[] = [];
      let allMembers: MembershipRow[] = [];
      if (conversationIds.length) {
        const conversationResult = await authenticatedClient.from("conversations")
          .select("id,booking_id,updated_at").in("id", conversationIds);
        if (conversationResult.error) throw conversationResult.error;
        const bookingIdSet = new Set(bookings.map(booking => booking.id));
        conversations = ((conversationResult.data ?? []) as ConversationRow[])
          .filter(conversation => conversation.booking_id && bookingIdSet.has(conversation.booking_id));
        const relevantConversationIds = conversations.map(conversation => conversation.id);
        if (relevantConversationIds.length) {
          const [membersResult, ...latestMessageResults] = await Promise.all([
            authenticatedClient.from("conversation_members").select("conversation_id,profile_id,last_read_at").in("conversation_id", relevantConversationIds),
            ...conversations.map(conversation => authenticatedClient.from("messages")
              .select("conversation_id,body,created_at,sender_id").eq("conversation_id", conversation.id)
              .is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle()),
          ]);
          if (membersResult.error) throw membersResult.error;
          allMembers = (membersResult.data ?? []) as MembershipRow[];
          for (const result of latestMessageResults) {
            if (result.error) throw result.error;
          }
          const latestByConversation = new Map(latestMessageResults.flatMap(result => result.data
            ? [[result.data.conversation_id, result.data as MessageRow] as const]
            : []));
          conversations = conversations.map(conversation => ({ ...conversation, latestMessage: latestByConversation.get(conversation.id) }));
        }
      }

      const membersByConversation = new Map<string, string[]>();
      for (const member of allMembers) {
        const current = membersByConversation.get(member.conversation_id) ?? [];
        current.push(member.profile_id);
        membersByConversation.set(member.conversation_id, current);
      }
      const conversationByBooking = new Map(conversations.flatMap(conversation => conversation.booking_id ? [[conversation.booking_id, conversation] as const] : []));
      const groupInputs = bookings.map(booking => {
        const conversation = conversationByBooking.get(booking.id);
        const latestMessage = conversation?.latestMessage;
        return {
          booking: {
            id: booking.id,
            clientId: booking.client_id,
            providerId: booking.provider_id,
            startsAt: booking.starts_at,
            status: booking.status,
            serviceTitle: booking.provider_services?.title ?? null,
          },
          ...(conversation ? { conversation: {
            id: conversation.id,
            updatedAt: conversation.updated_at,
            memberIds: membersByConversation.get(conversation.id) ?? [],
            ...(latestMessage ? { latestMessage: { body: latestMessage.body, createdAt: latestMessage.created_at, senderId: latestMessage.sender_id } } : {}),
          } } : {}),
        };
      });
      const grouped = staffMode
        ? groupInputs.map(row => ({
          key: `staff-booking:${row.booking.id}`, participantId: null, isGroup: false,
          existingConversationOnly: false,
          conversationIds: [], bookings: [row.booking], latestActivityAt: row.booking.startsAt, preview: null,
        }))
        : groupBookingConversations(groupInputs, userId);

      const allBookingIds = [...new Set(grouped.flatMap(group => group.bookings.map(booking => booking.id)))];
      const { data: contextData, error: contextError } = await authenticatedClient.auth.getSession();
      if (contextError) throw contextError;
      const token = contextData.session?.access_token;
      if (!token) throw new Error("session_required");
      const response = await fetch(`/api/bookings/conversation-context?bookings=${allBookingIds.join(",")}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error("context_unavailable");
      const contextPayload = await response.json() as { bookings: ContextRow[] };
      const contextByBooking = new Map(contextPayload.bookings.map(row => [row.bookingId, row]));
      const enriched: Contact[] = grouped.map(group => {
        const bookingContext = contextByBooking.get(group.bookings[0].id);
        return {
          ...group,
          name: group.isGroup ? "Conversation de groupe" : bookingContext?.name ?? "Interlocuteur",
          avatarUrl: group.isGroup ? null : bookingContext?.avatarUrl ?? null,
          ...(bookingContext?.profilePath ? { profilePath: bookingContext.profilePath } : {}),
        };
      });
      if (active) {
        setContacts(enriched);
        if (requestedBooking) setSelected(enriched.find(contact => contact.bookings.some(booking => booking.id === requestedBooking)) ?? null);
      }
    }

    void load().catch((caught: unknown) => {
      if (active) { setError(publicErrorMessage(caught, "Impossible de charger vos conversations.")); setContacts([]); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestedBooking, staffMode, userId]);

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    if (!normalized) return contacts;
    return contacts.filter(contact => contact.name.toLocaleLowerCase("fr").includes(normalized)
      || contact.preview?.toLocaleLowerCase("fr").includes(normalized));
  }, [contacts, query]);

  return <section className={`workspace-content messaging-workspace${selected ? " has-selection" : ""}`}>
    <div className="workspace-intro"><div><h2>Messages</h2><p>Un fil par interlocuteur, avec les rendez-vous associés.</p></div></div>
    <article className="panel messaging-shell" aria-label="Messagerie">
      <aside className="messaging-sidebar" aria-label="Conversations">
        <div className="messaging-sidebar-heading"><h3>Conversations</h3><span>{contacts.length}</span></div>
        <label className="messaging-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un interlocuteur" aria-label="Rechercher un interlocuteur" /></label>
        {error && <p role="alert" className="conversation-error">{error}</p>}
        {loading && <p className="compact-empty">Chargement des conversations…</p>}
        {!loading && !error && filteredContacts.length === 0 && <p className="compact-empty">{query ? "Aucun interlocuteur ne correspond." : "Aucune conversation pour le moment."}</p>}
        <div className="messaging-contact-list">
          {filteredContacts.map(contact => {
            return <button key={contact.key} type="button" className={`messaging-contact${selected?.key === contact.key ? " selected" : ""}`} aria-current={selected?.key === contact.key ? "true" : undefined} onClick={() => setSelected(contact)}>
              <span className="messaging-avatar">{contact.avatarUrl ? <Image src={contact.avatarUrl} alt="" width={48} height={48} unoptimized /> : <span aria-hidden="true">{contact.name.slice(0, 1).toLocaleUpperCase("fr")}</span>}</span>
              <span className="messaging-contact-copy"><strong>{contact.name}</strong><small>{contact.preview ?? "Aucun message"}</small></span>
              <span className="messaging-contact-meta"><time dateTime={contact.latestActivityAt}>{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(new Date(contact.latestActivityAt))}</time>{contact.bookings.length > 1 && <small>{contact.bookings.length} rendez-vous</small>}</span>
            </button>;
          })}
        </div>
      </aside>
      <div className="messaging-thread-area">
        {selected ? <>
          <div className="messaging-mobile-heading"><button type="button" onClick={() => setSelected(null)} aria-label="Retour à la liste des conversations">←</button><strong>{selected.name}</strong></div>
          <BookingMessages
            key={selected.key}
            bookingId={selected.bookings[0].id}
            conversationIds={selected.conversationIds}
            appointmentBookings={selected.bookings}
            isGroup={selected.isGroup}
            existingConversationOnly={selected.existingConversationOnly}
            title={selected.name}
            serviceTitle={selected.bookings[0].serviceTitle ?? "Conversations"}
            userId={userId}
            canReply={canReply}
            profilePath={selected.profilePath}
            onClose={() => setSelected(null)}
          />
        </> : <div className="messaging-empty-state"><span aria-hidden="true">✉</span><h3>Vos conversations, au même endroit</h3><p>Sélectionnez un interlocuteur pour retrouver les échanges autorisés et les rendez-vous associés.</p></div>}
      </div>
    </article>
  </section>;
}
