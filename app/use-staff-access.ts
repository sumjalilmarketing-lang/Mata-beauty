"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useStaffAccess() {
  const [available, setAvailable] = useState<boolean | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
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
      } catch { if(active && request === version) { setError(true); } }
    }
    const update=()=>{void refresh();};
    update();
    const visibility=()=>{if(document.visibilityState === "visible") update();};
    document.addEventListener("visibilitychange",visibility);
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>{window.setTimeout(update,0);});
    window.addEventListener("focus",update); window.addEventListener("online",update);
    const timer=window.setInterval(update,60000);
    return ()=>{active=false;version++;subscription.unsubscribe();document.removeEventListener("visibilitychange",visibility);window.clearInterval(timer);window.removeEventListener("focus",update);window.removeEventListener("online",update);};
  }, [attempt]);
  return {available,error,retry:()=>setAttempt(value=>value+1)};
}
