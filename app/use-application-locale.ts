"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { applicationLocale } from "@/lib/domain/booking-copy";

export function useApplicationLocale() {
  const [locale, setLocale] = useState("fr-FR");
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLocale(applicationLocale(navigator.language));
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const { data: { user } } = await client.auth.getUser();
      if (!active || !user) return;
      const { data } = await client.from("profiles").select("locale").eq("id", user.id).maybeSingle();
      if (active && typeof data?.locale === "string") setLocale(applicationLocale(data.locale));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return locale;
}
