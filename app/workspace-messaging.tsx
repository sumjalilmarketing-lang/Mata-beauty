"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { BookingMessages } from "./booking-messages";
import { ConversationMessages } from "./conversation-messages";
import { ConversationAssignment } from "./conversation-assignment";
import { conversationDate, messagePreview, type ConversationSummary } from "./conversation-types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";
import { statusLabel } from "@/lib/ui/status-label";
import "./conversation-messages.css";

type BookingRow = { id: string; starts_at: string; status: string; provider_services: { title: string | null } | null; legacy_conversations: { id: string }[] | { id: string } | null };
type Selection = { conversationId: string; initialMessage?: string } | { bookingId: string; serviceTitle: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listPageSize = 50;
type Story = { id: string; providerId: string; providerName: string; avatarUrl: string | null; serviceId: string | null; serviceTitle: string | null; caption: string; mediaUrl: string; contentType: string; publishedAt: string; expiresAt: string };
type MessageRequest = { conversation_id: string; requester_id: string; requester_name: string; requester_avatar_url: string | null; preview: string | null; message_type: string | null; requested_at: string };
type StoryService = { id: string; title: string };
function mergeThreads(current: ConversationSummary[], incoming: ConversationSummary[]) {
  const rows = new Map(current.map(row => [row.conversation_id, row]));
  for (const row of incoming) rows.set(row.conversation_id, row);
  return [...rows.values()].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at) || b.conversation_id.localeCompare(a.conversation_id));
}

export function WorkspaceMessaging({ userId, canReply = true, canPublishStories = false, canManageAssignments = false }: { userId: string; canReply?: boolean; canPublishStories?: boolean; canManageAssignments?: boolean }) {
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
  const [filter, setFilter] = useState<"all" | "unread" | "requests">("all");
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesEnabled, setStoriesEnabled] = useState(false);
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [requestsEnabled, setRequestsEnabled] = useState(false);
  const [storyServices, setStoryServices] = useState<StoryService[]>([]);
  const [storyCaption, setStoryCaption] = useState("");
  const [storyServiceId, setStoryServiceId] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestBusy, setRequestBusy] = useState("");
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyMessage, setStoryMessage] = useState("");
  const rowsRef = useRef<ConversationSummary[]>([]);
  const pageCursor = useRef<{ at: string; id: string } | null>(null);
  const moreLoaded = useRef(false);
  const moreBusy = useRef(false);
  const active = useRef(true);

  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) { if (active.current) { setError("La messagerie est momentanément indisponible."); setLoading(false); } return; }
    try {
      const [threads, appointments, incomingRequests] = await Promise.all([
        client.rpc("list_my_conversations_page", { target_before_at: null, target_before_id: null, target_limit: listPageSize }),
        client.from("bookings").select("id,starts_at,status,provider_services(title),legacy_conversations:conversations!conversations_booking_id_fkey(id)").is("conversation_id", null).order("starts_at", { ascending: false }).limit(100),
        client.rpc("list_my_message_requests"),
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
      if (incomingRequests.error) { setRequestsEnabled(false); setRequestError("Les demandes de messages nécessitent une mise à jour de la base."); }
      else { setRequestsEnabled(true); setRequests((incomingRequests.data ?? []) as MessageRequest[]); setRequestError(""); }
      setError("");
    } catch (caught) { if (active.current) setError(publicErrorMessage(caught, "Impossible de charger vos conversations.")); }
    finally { if (active.current) setLoading(false); }
  }, []);

  const loadStories = useCallback(async () => {
    try {
      const response = await fetch("/api/stories", { cache: "no-store" });
      if (!response.ok) throw new Error("stories_unavailable");
      const result = await response.json() as { enabled?: boolean; stories?: Story[] };
      if (active.current) { setStoriesEnabled(result.enabled === true); setStories(result.stories ?? []); }
    } catch { if (active.current) { setStoriesEnabled(false); setStoryMessage("Les Stories sont momentanément indisponibles."); } }
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
    active.current = true; queueMicrotask(() => { if (active.current) { void load(); void loadStories(); } });
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
  }, [load, loadStories, userId]);

  useEffect(() => {
    if (!canPublishStories) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.from("provider_services").select("id,title").eq("provider_id", userId).eq("is_active", true).order("title").then(result => {
      if (!result.error) setStoryServices((result.data ?? []) as StoryService[]);
    });
  }, [canPublishStories, userId]);

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
  const requestIds = new Set(requests.map(item => item.conversation_id));
  const visible = conversations.filter(row => !requestIds.has(row.conversation_id) && filter !== "requests" && Boolean(row.archived_at) === showArchived && (filter !== "unread" || Number(row.unread_count) > 0) && (!normalized || `${row.other_display_name} ${row.service_title ?? ""}`.toLocaleLowerCase("fr").includes(normalized)));
  const pendingBookings = showArchived ? [] : bookings.filter(booking => !knownBookings.has(booking.id) && (!normalized || (booking.provider_services?.title ?? "").toLocaleLowerCase("fr").includes(normalized)));

  async function publishStory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const client = getSupabaseBrowserClient();
    if (!client) { setStoryMessage("La publication est momentanément indisponible."); return; }
    setStoryBusy(true); setStoryMessage("");
    try {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Reconnectez-vous avant de publier.");
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const preparedResponse = await fetch("/api/stories", { method: "POST", headers, body: JSON.stringify({ phase: "prepare", contentType: file.type, size: file.size, caption: storyCaption, serviceId: storyServiceId || null }) });
      const prepared = await preparedResponse.json() as { storyId?: string; path?: string; token?: string; error?: string };
      if (!preparedResponse.ok || !prepared.storyId || !prepared.path || !prepared.token) throw new Error(prepared.error ?? "Impossible de préparer cette Story.");
      const uploaded = await client.storage.from("professional-stories").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
      if (uploaded.error) throw new Error("Le téléversement a échoué. Réessayez avec une autre connexion.");
      const completedResponse = await fetch("/api/stories", { method: "POST", headers, body: JSON.stringify({ phase: "complete", storyId: prepared.storyId }) });
      const completed = await completedResponse.json() as { error?: string };
      if (!completedResponse.ok) throw new Error(completed.error ?? "La Story n'a pas été publiée.");
      setStoryMessage("Story publiée pour 24 heures.");
      await loadStories();
    } catch (caught) { setStoryMessage(caught instanceof Error ? caught.message : "La Story n'a pas pu être publiée."); }
    finally { setStoryBusy(false); }
  }

  async function replyToStory(story: Story) {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client.rpc("ensure_provider_conversation", { target_provider_id: story.providerId });
    if (result.error || typeof result.data !== "string") { setStoryMessage(publicErrorMessage(result.error, "Impossible d'ouvrir la conversation.")); return; }
    const context = story.serviceTitle ? ` « ${story.serviceTitle} »` : "";
    setActiveStory(null); setSelected({ conversationId: result.data, initialMessage: `Bonjour, je vous écris au sujet de votre Story${context}.` }); void load();
  }

  async function respondToRequest(requestId: string, accept: boolean) {
    const client = getSupabaseBrowserClient();
    if (!client || requestBusy) return;
    setRequestBusy(requestId);
    try {
      const result = await client.rpc("respond_to_message_request", { target_conversation_id: requestId, accept_request: accept });
      if (result.error) throw result.error;
      if (result.data !== true) throw new Error("Cette demande a déjà été traitée.");
      setRequests(current => current.filter(item => item.conversation_id !== requestId));
      if (accept) setSelected({ conversationId: requestId });
      void load();
    } catch (caught) { setRequestError(publicErrorMessage(caught, "La demande n'a pas pu être traitée.")); }
    finally { setRequestBusy(""); }
  }

  return <section className={`workspace-content messaging-workspace${selected ? " has-conversation" : ""}`}>
    <div className="workspace-intro"><div><h2>Messages</h2><p>Vos échanges privés avec les clients et les professionnels.</p></div></div>
    <div className="messaging-columns">
      <article className="panel conversation-inbox" id="live-bookings">
        <div className="panel-heading"><h2>Mes conversations</h2><button type="button" onClick={() => void load()}>Actualiser</button></div>
        <section className="story-strip" aria-label="Stories des professionnels">
          <div className="story-strip-heading"><strong>Stories</strong></div>
          {canPublishStories && storiesEnabled && <div className="story-composer"><label>Texte de la Story<input type="text" value={storyCaption} maxLength={280} onChange={event => setStoryCaption(event.target.value)} placeholder="Une nouveauté, une réalisation…" /></label><label>Prestation associée<select value={storyServiceId} onChange={event => setStoryServiceId(event.target.value)}><option value="">Aucune prestation</option>{storyServices.map(service => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label><label className="story-publish-button">{storyBusy ? "Publication…" : "+ Ajouter une photo ou vidéo"}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={storyBusy} onChange={event => void publishStory(event)} /></label></div>}
          <div className="story-strip-list">{stories.map(story => <button className="story-avatar-button" type="button" key={story.id} onClick={() => setActiveStory(story)} aria-label={`Voir la Story de ${story.providerName}`}>
            <span className="story-avatar-ring">{story.avatarUrl ? <Image src={story.avatarUrl} width={54} height={54} alt="" unoptimized /> : <span>{story.providerName.slice(0, 1).toLocaleUpperCase("fr")}</span>}</span><small>{story.providerName}</small>
          </button>)}{!stories.length && <span className="story-strip-empty">Les Stories récentes des professionnels apparaîtront ici.</span>}</div>
          {storyMessage && <p role="status" className="story-status">{storyMessage}</p>}
        </section>
        <label className="conversation-search">Rechercher une conversation<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom ou prestation" /></label>
        <div className="conversation-filter-tabs" role="group" aria-label="Filtrer les conversations"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tout <span>{conversations.filter(row => !row.archived_at && !requestIds.has(row.conversation_id)).length}</span></button><button type="button" aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Non lus <span>{conversations.filter(row => !row.archived_at && !requestIds.has(row.conversation_id) && Number(row.unread_count) > 0).length}</span></button>{requestsEnabled && <button type="button" aria-pressed={filter === "requests"} onClick={() => setFilter("requests")}>Demandes <span>{requests.length}</span></button>}</div>
        {!requestsEnabled && requestError && <p role="status" className="conversation-error">{requestError}</p>}
        {filter === "requests" && <section className="message-requests" aria-label="Demandes de messages">{requestError && <p role="alert">{requestError}</p>}{!requestError && requests.length === 0 && <div className="compact-empty">Aucune demande de message en attente.</div>}{requests.filter(item => !normalized || `${item.requester_name} ${item.preview ?? ""}`.toLocaleLowerCase("fr").includes(normalized)).map(request => <article className="message-request-card" key={request.conversation_id}>{request.requester_avatar_url ? <Image src={request.requester_avatar_url} width={44} height={44} alt="" unoptimized /> : <span className="conversation-avatar">{request.requester_name.slice(0, 1)}</span>}<div><strong>{request.requester_name}</strong><p>{messagePreview(request.message_type, request.preview)}</p><time>{conversationDate(request.requested_at)}</time><div className="message-request-actions"><button type="button" disabled={Boolean(requestBusy)} onClick={() => void respondToRequest(request.conversation_id, true)}>{requestBusy === request.conversation_id ? "En cours…" : "Accepter"}</button><button type="button" disabled={Boolean(requestBusy)} onClick={() => void respondToRequest(request.conversation_id, false)}>Refuser</button></div></div></article>)}</section>}
        {conversations.some(row => row.archived_at) && <label className="conversation-archive-filter"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Afficher les conversations archivées</label>}
        {error && <p role="alert" className="conversation-error">{error}</p>}
        {loading && filter !== "requests" && <div className="compact-empty">Chargement des conversations…</div>}
        {filter !== "requests" && !loading && !error && visible.length === 0 && pendingBookings.length === 0 && <div className="compact-empty">{hasMore ? "Aucun résultat dans cette page. Chargez plus de conversations pour poursuivre." : normalized ? "Aucune conversation ne correspond à votre recherche." : "Aucune conversation pour le moment. Contactez un professionnel depuis son profil ou retrouvez vos échanges après une réservation."}</div>}
        {filter !== "requests" && visible.map(row => <div className={`appointment live-appointment conversation-inbox-row${selected && "conversationId" in selected && selected.conversationId === row.conversation_id ? " selected" : ""}`} key={row.conversation_id}>
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
        {filter !== "requests" && pendingBookings.map(booking => <div className="appointment live-appointment conversation-pending-booking" key={booking.id}>
          <div><strong>{booking.provider_services?.title ?? "Prestation beauté"}</strong><small>{conversationDate(booking.starts_at)} · {statusLabel(booking.status)}</small></div>
          <button type="button" onClick={() => setSelected({ bookingId: booking.id, serviceTitle: booking.provider_services?.title ?? "Prestation beauté" })}>Messages</button>
        </div>)}
        {hasMore && <button type="button" className="conversation-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Chargement…" : "Charger plus de conversations"}</button>}
      </article>
      {selected && ("conversationId" in selected
        ? <div className="conversation-thread"><ConversationAssignment key={selected.conversationId} conversationId={selected.conversationId} enabled={canManageAssignments} /><ConversationMessages key={`${selected.conversationId}:${requestedMessageId ?? ""}:${selected.initialMessage ?? ""}`} conversationId={selected.conversationId} requestedMessageId={requestedMessageId} initialMessage={selected.initialMessage} userId={userId} canReply={canReply} onClose={() => setSelected(null)} onChanged={() => void load()} /></div>
        : <BookingMessages key={`${selected.bookingId}:${requestedMessageId ?? ""}`} bookingId={selected.bookingId} requestedMessageId={requestedMessageId} serviceTitle={selected.serviceTitle} userId={userId} canReply={canReply} onClose={() => { setSelected(null); void load(); }} />)}
    </div>
    {activeStory && <div className="story-viewer-backdrop" role="presentation" onClick={() => setActiveStory(null)}><section className="story-viewer" role="dialog" aria-modal="true" aria-label={`Story de ${activeStory.providerName}`} onClick={event => event.stopPropagation()}>
      <button className="story-viewer-close" type="button" aria-label="Fermer la Story" onClick={() => setActiveStory(null)}>×</button>
      <header>{activeStory.avatarUrl ? <Image src={activeStory.avatarUrl} width={40} height={40} alt="" unoptimized /> : <span>{activeStory.providerName.slice(0, 1)}</span>}<strong>{activeStory.providerName}</strong><time>{new Date(activeStory.publishedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time></header>
      {activeStory.contentType === "video/mp4" ? <video src={activeStory.mediaUrl} controls autoPlay playsInline /> : <Image src={activeStory.mediaUrl} alt={`Story de ${activeStory.providerName}`} width={900} height={1200} unoptimized />}
      {activeStory.caption && <p>{activeStory.caption}</p>}
      {activeStory.serviceId && <a className="story-service-link" href={`/service/${encodeURIComponent(activeStory.serviceId)}`}>{activeStory.serviceTitle ? `Voir ${activeStory.serviceTitle}` : "Voir la prestation"}</a>}
      <button type="button" className="story-reply-button" onClick={() => void replyToStory(activeStory)}>Répondre en privé</button>
    </section></div>}
  </section>;
}
