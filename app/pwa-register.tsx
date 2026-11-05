"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
export function PwaRegister() {
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
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
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
  return null;
}
