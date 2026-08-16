"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ReferralCard({ type }: { type: "client" | "provider" }) {
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const label = type === "provider" ? "Invitez un professionnel" : "Invitez un ami";

  async function createCode() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { data, error } = await client.rpc("get_or_create_referral_code", { target_type: type });
    if (error) { setNotice("Le parrainage sera disponible après la mise à jour lancement."); return; }
    setCode(String(data)); setNotice("Code prêt à partager. Aucune récompense financière n’est active.");
  }

  async function share() {
    if (!code) return;
    const text = type === "provider" ? `Rejoignez Mata Beauty avec mon code ${code}` : `Découvrez Mata Beauty avec mon code ${code}`;
    if (navigator.share) await navigator.share({ title: "Mata Beauty", text, url: window.location.origin });
    else await navigator.clipboard.writeText(`${text} — ${window.location.origin}`);
    setNotice("Invitation prête à être envoyée.");
  }

  return <article className="panel referral-card"><div><span>◇ PARRAINAGE</span><h2>{label}</h2><p>Partagez Mata Beauty. Les récompenses restent désactivées tant qu’aucune offre n’est validée.</p></div>{code ? <><strong>{code}</strong><button onClick={() => void share()}>Partager</button></> : <button onClick={() => void createCode()}>Créer mon code</button>}{notice && <small role="status">{notice}</small>}</article>;
}
