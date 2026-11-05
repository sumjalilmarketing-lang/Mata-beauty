"use client";

import { useEffect, useState } from "react";
import { shouldOfferAppUpdate } from "@/lib/domain/app-version";
import "./app-update.css";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
export function PwaRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    let active = true, pending = false;
    async function check() {
      if(pending || document.visibilityState === "hidden" || !navigator.onLine) return;
      pending = true;
      try {
        const response = await fetch("/api/app-version", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if(response.ok) {
          const data: { version?: unknown } = await response.json();
          if(active && shouldOfferAppUpdate(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,data.version)) setUpdateAvailable(true);
        }
        if("serviceWorker" in navigator) await (await navigator.serviceWorker.getRegistration("/"))?.update();
      } catch { /* Offline devices keep their current screen and retry on return. */ }
      finally { pending=false; }
    }
    const refresh=()=>{void check();};
    refresh(); const timer=window.setInterval(refresh,300000);
    for(const event of ["focus","online"]) window.addEventListener(event,refresh);
    document.addEventListener("visibilitychange",refresh);
    return ()=>{active=false;window.clearInterval(timer);for(const event of ["focus","online"])window.removeEventListener(event,refresh);document.removeEventListener("visibilitychange",refresh);};
  }, []);
  useEffect(() => {
    const api = navigator as BadgeNavigator;
    if (!api.setAppBadge) return;
    let active = true, version = 0;
    async function refresh() {
      const request = ++version;
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const user = await client.auth.getUser();
      if (!active || request !== version) return;
      if (!user.data.user) { await api.clearAppBadge?.().catch(() => undefined); return; }
      const result = await client.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", user.data.user.id).is("read_at", null).abortSignal(AbortSignal.timeout(10000));
      if (!active || request !== version || result.error) return;
      try { if (result.count) await api.setAppBadge?.(result.count); else await api.clearAppBadge?.(); } catch { /* Unsupported/denied badges do not block the app. */ }
    }
    const update = () => { void refresh().catch(() => undefined); };
    update();
    const timer = window.setInterval(update, 30000);
    const client = getSupabaseBrowserClient();
    const auth = client?.auth.onAuthStateChange(() => { window.setTimeout(() => { if (active) update(); }, 0); });
    const channel = client?.channel("app-icon-unread").on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, update).subscribe();
    for (const event of ["focus", "online", "mata-notifications-changed", "mata-conversations-read"]) window.addEventListener(event, update);
    return () => { active = false; version++; window.clearInterval(timer); auth?.data.subscription.unsubscribe(); if (channel && client) void client.removeChannel(channel); for (const event of ["focus", "online", "mata-notifications-changed", "mata-conversations-read"]) window.removeEventListener(event, update); };
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
      const listener = getSupabaseBrowserClient()?.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_OUT") return;
        // Shared devices must stop receiving this account's push after logout.
        void navigator.serviceWorker.getRegistration("/").then(async registration => {
          const subscription = await registration?.pushManager.getSubscription();
          await subscription?.unsubscribe();
          const notifications = await registration?.getNotifications();
          notifications?.forEach(notification => notification.close());
        }).catch(() => undefined);
      });
      return () => listener?.data.subscription.unsubscribe();
    }
  }, []);
  return updateAvailable ? <aside className="app-update-banner" role="status" aria-label="Mise à jour de Mata Beauty"><div><strong>Une nouvelle version est disponible</strong><p>Enregistrez vos modifications en cours, puis actualisez Mata Beauty.</p></div><button type="button" onClick={()=>window.location.reload()}>Mettre à jour</button></aside> : null;
}
