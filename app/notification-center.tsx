"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeNotificationSpace, notificationBadgeAfterRead, notificationDestination, notificationVisibleInSpace, type NotificationItem, type NotificationSpace } from "@/lib/domain/notifications";

export function NotificationCenter({ userId, space }: { userId?: string; space?: string }) {
  const activeSpace = normalizeNotificationSpace(space);
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadedSpace, setLoadedSpace] = useState<NotificationSpace | null>(null);
  const [loadedOwner, setLoadedOwner] = useState("");
  const [owner, setOwner] = useState(userId ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(50);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const loadVersion = useRef(0);
  const activeOwner = userId ?? owner;
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const client = getSupabaseBrowserClient(); if (!client) { setError("Notifications indisponibles."); setItems([]); setLoadedSpace(null); setLoadedOwner(""); setLoading(false); return; }
    setLoading(true);
    setError("");
    const id = userId ?? (await client.auth.getUser()).data.user?.id;
    if (version !== loadVersion.current) return;
    if (!id) { setError("Reconnectez-vous pour consulter vos notifications."); setItems([]); setLoadedSpace(null); setLoadedOwner(""); setLoading(false); return; }
    setOwner(id);
    const pageSize = 200;
    const scoped: NotificationItem[] = [];
    for (let offset = 0; scoped.length < limit; offset += pageSize) {
      const response = await client.from("notifications").select("id,title,body,kind,data,read_at,created_at").eq("profile_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + pageSize - 1);
      if (version !== loadVersion.current) return;
      if (response.error) { setError("Les notifications n’ont pas pu être actualisées. Réessayez."); setItems([]); setLoadedSpace(null); setLoadedOwner(""); setLoading(false); return; }
      const page = (response.data ?? []) as NotificationItem[];
      scoped.push(...page.filter(item => notificationVisibleInSpace(item, activeSpace)));
      if (page.length < pageSize) break;
    }
    if (version !== loadVersion.current) return;
    setLoading(false);
    setError(""); setItems(scoped.slice(0, limit)); setLoadedSpace(activeSpace); setLoadedOwner(id);
  }, [userId, limit, activeSpace]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0), timer = setInterval(() => void load(), 30_000);
    const refresh = () => void load(); window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [load]);
  async function mark(item?: NotificationItem, navigate = false) {
    if (busy || !activeOwner || loadedSpace !== activeSpace || loadedOwner !== activeOwner) return; const client = getSupabaseBrowserClient(); if (!client) return;
    const currentItems = loadedSpace === activeSpace && loadedOwner === activeOwner ? items : [];
    const selected = item ? [item] : currentItems.filter(notification => !notification.read_at);
    const selectedIds = selected.map(notification => notification.id);
    if (!selectedIds.length) return;
    setBusy(true);
    const response = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", activeOwner).in("id", selectedIds).is("read_at", null);
    setBusy(false);
    if (response.error) { setError("La lecture n’a pas pu être enregistrée. Réessayez."); return; }
    const changedCount = selected.filter(notification => !notification.read_at).length;
    const readAt = new Date().toISOString();
    setItems(current => current.map(notification =>
      selectedIds.includes(notification.id) && !notification.read_at
        ? { ...notification, read_at: readAt }
        : notification,
    ));
    window.dispatchEvent(new CustomEvent("mata-notifications-changed", {
      detail: { profileId: activeOwner, changedCount, space: activeSpace },
    }));
    await load();
    const destination = item && notificationDestination(item, activeSpace);
    if (navigate && destination) router.push(destination);
  }
  const currentItems = loadedSpace === activeSpace && loadedOwner === activeOwner ? items : [];
  const visible = currentItems.filter(item => !unreadOnly || !item.read_at);
  return <section className="notification-center" aria-label="Centre de notifications"><header><div><h2>Mes notifications</h2><p>Notifications de cet espace et informations générales du compte.</p></div><button disabled={busy || !currentItems.some(item => !item.read_at)} onClick={() => void mark()}>Marquer les notifications affichées comme lues</button></header>
    <label><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} /> Non lues uniquement</label> <button onClick={() => void load()}>Actualiser</button>
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Chargement…</p> : !visible.length && <p>{unreadOnly ? "Vous avez lu toutes les notifications affichées." : "Aucune notification pour le moment. Les nouvelles informations apparaîtront ici."}</p>}
    {visible.map(item => <article className={`notification-card${item.read_at ? " read" : ""}`} key={item.id}><h3>{item.title}</h3>{!item.read_at && <strong>Non lue</strong>}<p>{item.body}</p><time dateTime={item.created_at}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(item.created_at))}</time><div className="notification-actions">{notificationDestination(item, activeSpace) && <button disabled={busy} onClick={() => void mark(item, true)}>Ouvrir</button>}{!item.read_at && <button disabled={busy} onClick={() => void mark(item)}>Marquer comme lue</button>}</div></article>)}
    {currentItems.length === limit && <button onClick={() => setLimit(value => value + 50)}>Afficher les notifications précédentes</button>}
  </section>;
}

export function NotificationBadge({ space: rawSpace }: { space?: string }) {
  const space = normalizeNotificationSpace(rawSpace);
  const [count, setCount] = useState(0);
  const [countSpace, setCountSpace] = useState<NotificationSpace | null>(null);
  useEffect(() => {
    let active = true;
    let profileId = "";
    async function refresh() {
      const client = getSupabaseBrowserClient(); if (!client) return;
      const { data } = await client.auth.getUser(); if (!data.user || !active) return;
      profileId = data.user.id;
      let unread = 0;
      const pageSize = 200;
      for (let offset = 0; ; offset += pageSize) {
        const result = await client.from("notifications").select("kind,data").eq("profile_id", data.user.id).is("read_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + pageSize - 1);
        if (result.error) return;
        const page = (result.data ?? []) as Pick<NotificationItem, "kind" | "data">[];
        unread += page.filter(item => notificationVisibleInSpace(item, space)).length;
        if (page.length < pageSize) break;
      }
      if (active) { setCount(unread); setCountSpace(space); }
    }
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ profileId?: unknown; changedCount?: unknown; space?: unknown }>).detail;
      if (typeof detail?.profileId !== "string" || detail.profileId !== profileId || detail.space !== space) return;
      if (detail.changedCount === null || (typeof detail.changedCount === "number" && detail.changedCount > 0)) {
        setCount(current => notificationBadgeAfterRead(current, detail.changedCount as number | null));
      }
      void refresh();
    };
    void refresh(); const timer = setInterval(() => void refresh(), 30_000);
    window.addEventListener("mata-notifications-changed", changed); window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("mata-notifications-changed", changed); window.removeEventListener("focus", refresh); };
  }, [space]);
  const scopedCount = countSpace === space ? count : 0;
  return scopedCount > 0 ? <span className="notification-badge" aria-label={`${scopedCount} notifications non lues`}>{scopedCount > 99 ? "99+" : scopedCount}</span> : null;
}
