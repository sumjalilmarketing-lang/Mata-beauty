"use client";

import { useEffect, useState } from "react";
import { canAutoApplyAppUpdate, shouldOfferAppUpdate } from "@/lib/domain/app-version";
import "./app-update.css";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
export function PwaRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    let active = true, pending = false, dirty = false, reloadTimer: number | undefined;
    const markDirty = (event: Event) => { const target=event.target; if(target instanceof HTMLElement && (target.closest("form") || target.isContentEditable)) dirty=true; };
    function autoApply(version: string) {
      const focused=document.activeElement;
      const focusedEditor=focused instanceof HTMLElement && (focused.matches("input,textarea,select") || focused.isContentEditable);
      const activeMedia=Array.from(document.querySelectorAll("video,audio")).some(media=>media instanceof HTMLMediaElement && !media.paused && !media.ended);
      if(!active || !canAutoApplyAppUpdate({visible:document.visibilityState === "visible",online:navigator.onLine,hasUnsavedChanges:dirty,hasFocusedEditor:focusedEditor,hasActiveMedia:activeMedia})) return;
      try { if(sessionStorage.getItem("mata.app.auto-applied") === version) return; sessionStorage.setItem("mata.app.auto-applied",version); } catch { return; }
      window.location.reload();
    }
    for(const event of ["input","change","submit"]) document.addEventListener(event,markDirty,true);
    async function check() {
      if(pending || document.visibilityState === "hidden" || !navigator.onLine) return;
      pending = true;
      try {
        const response = await fetch("/api/app-version", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if(response.ok) {
          const data: { version?: unknown } = await response.json();
          if(active && shouldOfferAppUpdate(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,data.version)) {
            setUpdateAvailable(true);
            const version=String(data.version); window.clearTimeout(reloadTimer); reloadTimer=window.setTimeout(()=>autoApply(version),1500);
          }
        }
        if("serviceWorker" in navigator) await (await navigator.serviceWorker.getRegistration("/"))?.update();
      } catch { /* Offline devices keep their current screen and retry on return. */ }
      finally { pending=false; }
    }
    const refresh=()=>{void check();};
    refresh(); const timer=window.setInterval(refresh,30000);
    for(const event of ["focus","online"]) window.addEventListener(event,refresh);
    document.addEventListener("visibilitychange",refresh);
    navigator.serviceWorker?.addEventListener("controllerchange",refresh);
    return ()=>{active=false;window.clearInterval(timer);window.clearTimeout(reloadTimer);for(const event of ["input","change","submit"])document.removeEventListener(event,markDirty,true);navigator.serviceWorker?.removeEventListener("controllerchange",refresh);for(const event of ["focus","online"])window.removeEventListener(event,refresh);document.removeEventListener("visibilitychange",refresh);};
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
  return updateAvailable ? <aside className="app-update-banner" role="status" aria-label="Mise à jour de Mata Beauty"><div><strong>Une nouvelle version est disponible</strong><p>La mise à jour s’applique automatiquement quand aucune saisie n’est en cours. Sinon, enregistrez puis appuyez sur « Mettre à jour ».</p></div><button type="button" onClick={()=>window.location.reload()}>Mettre à jour</button></aside> : null;
}
