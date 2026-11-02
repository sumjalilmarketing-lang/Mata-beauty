"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function PwaRegister() {
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
