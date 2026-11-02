"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { applicationLocale } from "@/lib/domain/booking-copy";

export function useApplicationLocale() {
  const [locale, setLocale] = useState("fr-FR");
  useEffect(() => {
    let active = true;
    let changed = false;
    const onLocaleChanged = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value !== "string") return;
      changed = true;
      setLocale(applicationLocale(value));
    };
    window.addEventListener("mata:locale-changed", onLocaleChanged);
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (!changed) setLocale(applicationLocale(navigator.language));
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const { data: { user } } = await client.auth.getUser();
      if (!active || !user) return;
      const { data } = await client.from("profiles").select("locale").eq("id", user.id).maybeSingle();
      if (active && !changed && typeof data?.locale === "string") setLocale(applicationLocale(data.locale));
    }).catch(() => undefined);
    return () => { active = false; window.removeEventListener("mata:locale-changed", onLocaleChanged); };
  }, []);
  return locale;
}
