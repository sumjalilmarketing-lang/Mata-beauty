"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PushSettings } from "./push-settings";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { notificationBadgeAfterRead, notificationDestination, type NotificationItem } from "@/lib/domain/notifications";

export function NotificationCenter({ userId }: { userId?: string }) {
  const router = useRouter();
  const loadVersion = useRef(0);
  const [removed, setRemoved] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [owner, setOwner] = useState(userId ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(50);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const client = getSupabaseBrowserClient(); if (!client) { setError("Notifications indisponibles."); setLoading(false); return; }
    const id = userId ?? (await client.auth.getUser()).data.user?.id;
    if (!id) { setError("Reconnectez-vous pour consulter vos notifications."); setLoading(false); return; }
    setOwner(id);
    const response = await client.from("notifications").select("id,title,body,kind,data,read_at,created_at").eq("profile_id", id).is("dismissed_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
    setLoading(false);
    if (response.error) { setError("Les notifications n’ont pas pu être actualisées. Réessayez."); return; }
    setError("");
    const rows = (response.data ?? []) as NotificationItem[];
    const actors = rows.length ? await client.rpc("get_notification_actors", { target_ids: rows.slice(0, 200).map(row => row.id) }) : { data: [] };
    const names = new Map(((actors.data ?? []) as { notification_id: string; actor_name: string }[]).map(row => [row.notification_id, row.actor_name]));
    if (version !== loadVersion.current) return;
    setItems(rows.map(row => ({ ...row, actor_name: names.get(row.id) ?? "Mata Beauty" })));
  }, [userId, limit]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0), timer = setInterval(() => void load(), 30_000);
    const refresh = () => void load(); window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [load]);
  async function mark(item?: NotificationItem, navigate = false) {
    if (busy || !owner) return; const client = getSupabaseBrowserClient(); if (!client) return;
    setBusy(true);
    let request = client.from("notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", owner).is("read_at", null);
    if (item) request = request.eq("id", item.id);
    const response = await request;
    setBusy(false);
    if (response.error) { setError("La lecture n’a pas pu être enregistrée. Réessayez."); return; }
    const changedCount = item ? Number(!item.read_at) : null;
    const readAt = new Date().toISOString();
    setItems(current => current.map(notification =>
      (!item || notification.id === item.id) && !notification.read_at
        ? { ...notification, read_at: readAt }
        : notification,
    ));
    window.dispatchEvent(new CustomEvent("mata-notifications-changed", {
      detail: { profileId: owner, changedCount },
    }));
    await load();
    const destination = item && notificationDestination(item);
    if (navigate && destination) router.push(destination);
  }
  async function dismiss(id: string, hidden: boolean) {
    if (busy) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    loadVersion.current++;
    setBusy(true); setError("");
    try {
      const result = await client.rpc("set_notification_dismissed", { target_id: id, dismissed: hidden }).abortSignal(AbortSignal.timeout(12000));
      if (result.error) throw result.error;
      if (hidden) { setItems(current => current.filter(item => item.id !== id)); setRemoved(id); }
      else setRemoved(null);
      window.dispatchEvent(new CustomEvent("mata-notifications-changed", { detail: { profileId: owner } }));
      await load();
    } catch { setError("La notification n’a pas pu être mise à jour. Réessayez."); }
    finally { setBusy(false); }
  }
  const visible = items.filter(item => !unreadOnly || !item.read_at);
  return <section className="notification-center" aria-label="Centre de notifications"><header><div><h2>Mes notifications</h2><p>Vos messages, rendez-vous, affectations et informations de compte.</p></div><button disabled={busy || !items.some(item => !item.read_at)} onClick={() => void mark()}>Tout marquer comme lu</button></header>
    <details className="notification-device-settings"><summary>Réglages des notifications sur cet appareil</summary><PushSettings /></details>
    {removed && <p role="status">Notification supprimée de la liste. <button type="button" disabled={busy} onClick={() => void dismiss(removed, false)}>Annuler</button></p>}
    <label><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} /> Non lues uniquement</label> <button onClick={() => void load()}>Actualiser</button>
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Chargement…</p> : !visible.length && <p>{unreadOnly ? "Vous avez lu toutes les notifications affichées." : "Aucune notification pour le moment. Les nouvelles informations apparaîtront ici."}</p>}
    <p className="notification-inbox-hint">Touchez une notification pour voir les détails. Glissez vers la gauche pour afficher « Supprimer ».</p>
    {visible.map(item => <InboxNotification key={item.id} item={item} busy={busy} onRead={() => { if (!item.read_at) void mark(item); }} onOpen={() => void mark(item, true)} onDismiss={() => void dismiss(item.id, true)} />)}
    {items.length === limit && <button onClick={() => setLimit(value => value + 50)}>Afficher les notifications précédentes</button>}
  </section>;
}

export function NotificationBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    let profileId = "";
    async function refresh() {
      const client = getSupabaseBrowserClient(); if (!client) return;
      const { data } = await client.auth.getUser(); if (!data.user || !active) return;
      profileId = data.user.id;
      const result = await client.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", data.user.id).is("read_at", null);
      if (active && !result.error) setCount(result.count ?? 0);
    }
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ profileId?: unknown; changedCount?: unknown }>).detail;
      if (typeof detail?.profileId !== "string" || detail.profileId !== profileId) return;
      if (detail.changedCount === null || (typeof detail.changedCount === "number" && detail.changedCount > 0)) {
        setCount(current => notificationBadgeAfterRead(current, detail.changedCount as number | null));
      }
      void refresh();
    };
    void refresh(); const timer = setInterval(() => void refresh(), 30_000);
    window.addEventListener("mata-notifications-changed", changed); window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("mata-notifications-changed", changed); window.removeEventListener("focus", refresh); };
  }, []);
  return count > 0 ? <span className="notification-badge" aria-label={`${count} notifications non lues`}>{count > 99 ? "99+" : count}</span> : null;
}

function InboxNotification({ item, busy, onRead, onOpen, onDismiss }: { item: NotificationItem; busy: boolean; onRead: () => void; onOpen: () => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false), [actions, setActions] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  return <article className={`notification-inbox-row${item.read_at ? " read" : " unread"}`}>
    <button type="button" className="notification-inbox-summary" aria-expanded={open} aria-controls={`notice-${item.id}`} onPointerDown={event => { start.current = { x: event.clientX, y: event.clientY }; swiped.current = false; }} onPointerCancel={() => { start.current = null; }} onPointerUp={event => {
      if (start.current && start.current.x - event.clientX > 70 && start.current.x - event.clientX > Math.abs(start.current.y - event.clientY) * 1.5) { setActions(true); swiped.current = true; }
      start.current = null;
    }} onClick={() => { if (swiped.current) { swiped.current = false; return; } setOpen(value => !value); if (!open) onRead(); }}>
      <span className="notification-inbox-avatar" aria-hidden="true">{(item.actor_name || "M").slice(0, 1).toUpperCase()}</span>
      <span className="notification-inbox-copy"><strong>{item.actor_name ?? "Mata Beauty"}</strong><span>{item.title}</span>{!open && <small>{item.body}</small>}<time dateTime={item.created_at}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.created_at))}</time></span>
      {!item.read_at && <span className="notification-unread-dot" aria-label="Non lue" />}
    </button>
    <button type="button" className="notification-inbox-more" aria-label={`Actions : ${item.title}`} aria-expanded={actions} onClick={() => setActions(value => !value)}>⋯</button>
    {open && <div id={`notice-${item.id}`} className="notification-inbox-detail"><p>{item.body}</p>{notificationDestination(item) && <button type="button" disabled={busy} onClick={onOpen}>Ouvrir {item.kind === "message_created" ? "la conversation" : "le détail"}</button>}<button type="button" disabled={busy} onClick={onDismiss}>Supprimer la notification</button></div>}
    {actions && <div className="notification-inbox-actions"><button type="button" disabled={busy} onClick={onDismiss}>Supprimer</button><button type="button" onClick={() => setActions(false)}>Fermer</button></div>}
  </article>;
}
