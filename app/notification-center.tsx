"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { notificationDestination, type NotificationItem } from "@/lib/domain/notifications";

export function NotificationCenter({ userId }: { userId?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [owner, setOwner] = useState(userId ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(50);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient(); if (!client) { setError("Notifications indisponibles."); setLoading(false); return; }
    const id = userId ?? (await client.auth.getUser()).data.user?.id;
    if (!id) { setError("Reconnectez-vous pour consulter vos notifications."); setLoading(false); return; }
    setOwner(id);
    const response = await client.from("notifications").select("id,title,body,kind,data,read_at,created_at").eq("profile_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
    setLoading(false);
    if (response.error) { setError("Les notifications n’ont pas pu être actualisées. Réessayez."); return; }
    setError(""); setItems((response.data ?? []) as NotificationItem[]);
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
    window.dispatchEvent(new Event("mata-notifications-changed")); await load();
    const destination = item && notificationDestination(item);
    if (navigate && destination) router.push(destination);
  }
  const visible = items.filter(item => !unreadOnly || !item.read_at);
  return <section className="notification-center" aria-label="Centre de notifications"><header><div><h2>Mes notifications</h2><p>Vos rendez-vous, messages et informations de compte.</p></div><button disabled={busy || !items.some(item => !item.read_at)} onClick={() => void mark()}>Tout marquer comme lu</button></header>
    <label><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} /> Non lues uniquement</label> <button onClick={() => void load()}>Actualiser</button>
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Chargement…</p> : !visible.length && <p>{unreadOnly ? "Vous avez lu toutes les notifications affichées." : "Aucune notification pour le moment. Les nouvelles informations apparaîtront ici."}</p>}
    {visible.map(item => <article className={`notification-card${item.read_at ? " read" : ""}`} key={item.id}><h3>{item.title}</h3>{!item.read_at && <strong>Non lue</strong>}<p>{item.body}</p><time dateTime={item.created_at}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(item.created_at))}</time><div className="notification-actions">{notificationDestination(item) && <button disabled={busy} onClick={() => void mark(item, true)}>Ouvrir</button>}{!item.read_at && <button disabled={busy} onClick={() => void mark(item)}>Marquer comme lue</button>}</div></article>)}
    {items.length === limit && <button onClick={() => setLimit(value => value + 50)}>Afficher les notifications précédentes</button>}
  </section>;
}

export function NotificationBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    async function refresh() {
      const client = getSupabaseBrowserClient(); if (!client) return;
      const { data } = await client.auth.getUser(); if (!data.user || !active) return;
      const result = await client.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", data.user.id).is("read_at", null);
      if (active && !result.error) setCount(result.count ?? 0);
    }
    void refresh(); const timer = setInterval(() => void refresh(), 30_000);
    window.addEventListener("mata-notifications-changed", refresh); window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("mata-notifications-changed", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  return count > 0 ? <span className="notification-badge" aria-label={`${count} notifications non lues`}>{count > 99 ? "99+" : count}</span> : null;
}
