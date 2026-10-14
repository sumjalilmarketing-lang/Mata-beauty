"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type Role = "client" | "independent" | "owner" | "collaborator";
type DemoMessage = { from: "self" | "other"; text: string; time: string };
type DemoThread = { id: string; name: string; service: string; preview: string; unread: number; messages: DemoMessage[] };

const roleNames: Record<Role, string> = {
  client: "Client",
  independent: "Professionnel indépendant",
  owner: "Responsable de salon",
  collaborator: "Collaborateur",
};
const subscribeHydration = () => () => {};
const getHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
const stories = [
  { name: "Studio Naya", color: "#f4a6c2", caption: "Notre nouvelle pose protectrice est disponible cette semaine." },
  { name: "Mariam Beauty", color: "#d8b4fe", caption: "Un aperçu des créations du jour ✨" },
  { name: "Atelier K", color: "#f9c784", caption: "Quelques places se sont libérées." },
];
const seedThreads: DemoThread[] = [
  { id: "naya", name: "Studio Naya", service: "Tresses protectrices", preview: "Bonjour, avez-vous une disponibilité vendredi ?", unread: 2, messages: [{ from: "other", text: "Bonjour ! Merci pour votre réservation.", time: "09:14" }, { from: "self", text: "Merci, j’aurais une question sur la prestation.", time: "09:18" }, { from: "other", text: "Bien sûr, je vous réponds avec plaisir.", time: "09:21" }] },
  { id: "mariam", name: "Mariam Beauty", service: "Capsule-gel", preview: "Le devis est prêt à consulter.", unread: 0, messages: [{ from: "other", text: "Le devis est prêt à consulter.", time: "Hier" }] },
  { id: "atelier", name: "Atelier K", service: "Rendez-vous du 18 octobre", preview: "À tout à l’heure !", unread: 0, messages: [{ from: "self", text: "Je confirme mon arrivée à 14 h.", time: "Lun." }, { from: "other", text: "À tout à l’heure !", time: "Lun." }] },
];

export function MessagingV2Demo() {
  const [role, setRole] = useState<Role>("client");
  const hydrated = useSyncExternalStore(subscribeHydration, getHydrationSnapshot, getServerHydrationSnapshot);
  const [threads, setThreads] = useState(seedThreads);
  const [selectedId, setSelectedId] = useState(seedThreads[0].id);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [tab, setTab] = useState<"messages" | "requests">("messages");
  const [search, setSearch] = useState("");
  const [story, setStory] = useState<(typeof stories)[number] | null>(null);
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState("");
  const [request, setRequest] = useState<"pending" | "accepted" | "declined">("pending");
  const selected = threads.find(thread => thread.id === selectedId) ?? threads[0];
  const canPublish = role === "independent" || role === "owner";
  const canAssign = role === "owner";
  const filtered = threads.filter(thread => `${thread.name} ${thread.service}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function sendMessage() {
    const text = composer.trim();
    if (!text) return;
    setThreads(current => current.map(thread => thread.id === selectedId ? { ...thread, preview: text, messages: [...thread.messages, { from: "self", text, time: "Maintenant" }] } : thread));
    setComposer("");
    setNotice("Message ajouté à la démonstration locale.");
  }

  function selectThread(id: string) {
    setSelectedId(id);
    setMobileThreadOpen(true);
    setThreads(current => current.map(thread => thread.id === id ? { ...thread, unread: 0 } : thread));
  }

  return <main className="mv2-page">
    <header className="mv2-topbar"><a className="mv2-brand" href="#demo" aria-label="MATA Beauty">MATA<span>BEAUTY</span></a><div className="mv2-topbar-title"><span>Messagerie</span><small>Sociale & professionnelle</small></div><label className="mv2-role">Profil de démonstration<select aria-label="Profil de démonstration" value={role} disabled={!hydrated} onChange={event => setRole(event.target.value as Role)}>{Object.entries(roleNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label></header>
    <div className="mv2-demo-banner"><span aria-hidden="true">i</span><p><strong>Démonstration visuelle — données fictives</strong><br />Aucune action n’est enregistrée. Cette page ne se connecte pas à Supabase.</p></div>
    <section className="mv2-stories" aria-label="Stories de démonstration"><div className="mv2-section-heading"><div><h1>Vos conversations</h1><p>Retrouvez vos échanges et les nouveautés.</p></div>{canPublish && <button className="mv2-outline" type="button" onClick={() => setNotice("Ajout de Story simulé : aucun fichier n’est téléversé.")}>＋ Ajouter une Story</button>}</div><div className="mv2-story-list">{stories.map(item => <button type="button" key={item.name} className="mv2-story" aria-label={`Voir la Story de ${item.name}`} onClick={() => setStory(item)}><span className="mv2-story-avatar" style={{ background: item.color }}>{item.name.slice(0, 1)}</span><span>{item.name}</span></button>)}</div></section>
    <section className={`mv2-workspace${mobileThreadOpen ? " mobile-show-thread" : ""}`} aria-label={`Messagerie — ${roleNames[role]}`}>
      <aside className={`mv2-inbox${selectedId ? " mv2-inbox-has-selection" : ""}`}>
        <div className="mv2-inbox-heading"><h2>Messages</h2><span className="mv2-count">{threads.reduce((sum, item) => sum + item.unread, 0)} non lus</span></div>
        <label className="mv2-search"><span className="mv2-sr-only">Rechercher une conversation</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="⌕  Rechercher" /></label>
        <div className="mv2-tabs" role="tablist" aria-label="Type de messages"><button type="button" role="tab" aria-selected={tab === "messages"} onClick={() => setTab("messages")}>Conversations</button><button type="button" role="tab" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>Demandes{role !== "client" && <span className="mv2-badge">1</span>}</button></div>
        {tab === "messages" ? <div className="mv2-thread-list">{filtered.map(thread => <button type="button" key={thread.id} aria-current={selectedId === thread.id ? "true" : undefined} className="mv2-thread-row" onClick={() => selectThread(thread.id)}><span className={`mv2-thread-avatar mv2-avatar-${thread.id}`}>{thread.name.slice(0, 1)}</span><span className="mv2-thread-info"><strong>{thread.name}</strong><small>{thread.service}</small><span>{thread.preview}</span></span><span className="mv2-thread-meta"><time>09:21</time>{thread.unread > 0 && <b>{thread.unread}</b>}</span></button>)}</div> : <div className="mv2-request-area">{role === "client" ? <p>Aucune demande en attente.</p> : request === "pending" ? <article className="mv2-request-card"><span className="mv2-thread-avatar mv2-avatar-request">A</span><div><strong>Amira Diallo</strong><p>Bonjour, je souhaite en savoir plus sur vos disponibilités.</p><small>Demande reçue aujourd’hui</small><div className="mv2-request-actions"><button type="button" onClick={() => { setRequest("accepted"); setNotice("Demande acceptée — simulation locale."); }}>Accepter</button><button type="button" onClick={() => { setRequest("declined"); setNotice("Demande refusée — simulation locale."); }}>Refuser</button></div></div></article> : <p role="status">Demande {request === "accepted" ? "acceptée" : "refusée"} dans cette démonstration.</p>}</div>}
      </aside>
      <section className="mv2-conversation" aria-label={`Conversation avec ${selected.name}`}>
        <header className="mv2-conversation-head"><button type="button" className="mv2-back" onClick={() => setMobileThreadOpen(false)} aria-label="Retour à la liste">‹</button><span className={`mv2-thread-avatar mv2-avatar-${selected.id}`}>{selected.name.slice(0, 1)}</span><div><strong>{selected.name}</strong><small>{selected.service} · En ligne</small></div><button className="mv2-more" type="button" aria-label="Options de conversation" onClick={() => setNotice("Options de conversation simulées.")}>•••</button></header>
        {canAssign && <div className="mv2-assignment"><span>Conversation attribuée à</span><select aria-label="Attribuer la conversation" onChange={() => setNotice("Attribution simulée — aucun collaborateur réel n’est modifié.")} defaultValue="aissata"><option value="aissata">Aïssata — Coiffure</option><option value="fatou">Fatou — Onglerie</option><option value="none">Non attribuée</option></select></div>}
        <div className="mv2-messages"><div className="mv2-day-divider"><span>Aujourd’hui</span></div>{selected.messages.map((message, index) => <div className={`mv2-bubble-row ${message.from === "self" ? "is-self" : "is-other"}`} key={`${selected.id}-${index}`}><p className="mv2-bubble">{message.text}<time>{message.time}</time></p></div>)}</div>
        <div className="mv2-context"><span className="mv2-context-icon">✦</span><span><strong>Prestation associée</strong><br />{selected.service}</span><button type="button" onClick={() => setNotice("La fiche prestation est uniquement illustrative.")}>Voir</button></div>
        <form className="mv2-composer" onSubmit={event => { event.preventDefault(); sendMessage(); }}><button type="button" aria-label="Ajouter une pièce jointe" onClick={() => setNotice("Les pièces jointes sont représentées en aperçu seulement.")}>＋</button><input aria-label="Écrire un message" value={composer} onChange={event => setComposer(event.target.value)} placeholder={request === "declined" ? "Cette demande a été refusée" : "Écrire un message…"} disabled={request === "declined"} /><button type="submit" className="mv2-send" disabled={!composer.trim() || request === "declined"}>Envoyer</button></form>
      </section>
    </section>
    {notice && <div className="mv2-toast" role="status"><span>{notice}</span><button type="button" aria-label="Fermer le message" onClick={() => setNotice("")}>×</button></div>}
    {story && <div className="mv2-story-backdrop" role="presentation" onClick={() => setStory(null)}><section className="mv2-story-modal" role="dialog" aria-modal="true" aria-label={`Story de ${story.name}`} onClick={event => event.stopPropagation()}><button type="button" className="mv2-modal-close" aria-label="Fermer" onClick={() => setStory(null)}>×</button><span className="mv2-story-modal-art" style={{ background: `linear-gradient(145deg, ${story.color}, #30202a)` }}>{story.caption}</span><strong>{story.name}</strong><p>Story fictive · expiration illustrée après 24 h</p><button type="button" onClick={() => { setStory(null); setNotice("Réponse privée simulée. Aucun message réel n’est envoyé."); }}>Répondre en privé</button></section></div>}
  </main>;
}
