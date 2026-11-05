"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AccountStaffAccess() {
  const [available, setAvailable] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if(process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED !== "true") return;
    const client = getSupabaseBrowserClient();
    if(!client) return;
    let active = true, version = 0;
    async function refresh() {
      const request = ++version;
      try {
        const result = await client!.rpc("current_collaborator_access").abortSignal(AbortSignal.timeout(12000));
        if(result.error) throw result.error;
        if(active && request === version) { setAvailable(Array.isArray(result.data) && result.data.some(row => Array.isArray(row.permissions) && row.permissions.length > 0)); setError(false); }
      } catch { if(active && request === version) { setAvailable(false); setError(true); } }
    }
    const update=()=>{void refresh();};
    update();
    window.addEventListener("focus",update); window.addEventListener("online",update);
    const timer=window.setInterval(update,60000);
    return ()=>{active=false;version++;window.clearInterval(timer);window.removeEventListener("focus",update);window.removeEventListener("online",update);};
  }, [attempt]);
  if(error) return <p role="status">Votre accès collaborateur n’a pas pu être vérifié. <button type="button" onClick={()=>setAttempt(value=>value+1)}>Réessayer</button></p>;
  if(!available) return null;
  return <nav aria-label="Mon activité au salon" className="account-staff-access"><Link href="/staff">Ouvrir mon espace collaborateur →</Link><p>Mon agenda, mes prestations, mes tâches et mes disponibilités. Vous pouvez installer cet espace depuis sa page.</p></nav>;
}
