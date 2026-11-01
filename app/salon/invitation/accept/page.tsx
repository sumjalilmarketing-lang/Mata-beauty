"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const tokenKey = "mata.salon.invitation.pending";

export default function AcceptSalonInvitationPage() {
  const enabled = process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED === "true";
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!enabled) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      queueMicrotask(() => setReady(true));
      return;
    }
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const saved = fromLink || window.sessionStorage.getItem(tokenKey);
    if (saved && /^[A-Za-z0-9_-]{40,60}$/.test(saved)) {
      window.sessionStorage.setItem(tokenKey, saved);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      queueMicrotask(() => setToken(saved));
    }
    const client = getSupabaseBrowserClient();
    if (client) void client.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session)); setReady(true);
    }).catch(() => setReady(true));
    else queueMicrotask(() => setReady(true));
  }, [enabled]);

  async function accept() {
    const client = getSupabaseBrowserClient();
    if (!client || !token || busy) return;
    setBusy(true); setFeedback("");
    try {
      const { data } = await client.auth.getSession();
      if (!data.session) {
        window.sessionStorage.setItem(tokenKey, token);
        window.location.assign(`/?connexion=requise&returnTo=${encodeURIComponent("/salon/invitation/accept")}`);
        return;
      }
      const response = await fetch("/api/salon/invitations/accept", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("accept_failed");
      window.sessionStorage.removeItem(tokenKey);
      setToken(null);
      window.location.assign("/staff");
    } catch {
      setFeedback("L’invitation ne peut pas être acceptée. Vérifiez que le compte connecté utilise l’adresse invitée, puis demandez au salon de renvoyer un lien valide si besoin.");
    } finally { setBusy(false); }
  }

  return <main className="workspace-content">
    <section className="workspace-panel salon-panel salon-invitation-accept" aria-labelledby="salon-invitation-title">
      <span className="salon-eyebrow">MATA Beauty · Espace équipe</span>
      <h1 id="salon-invitation-title">Rejoindre un salon</h1>
      {!enabled && <p role="status">Les invitations collaborateur ne sont pas encore activées.</p>}
      {!ready && <p role="status">Vérification de votre invitation…</p>}
      {ready && !token && <p role="alert">Ce lien d’invitation est manquant ou invalide.</p>}
      {ready && token && <>
        <p>Connectez-vous avec l’adresse e-mail qui a reçu l’invitation. Le lien est à usage unique et expire après 48 heures.</p>
        {!signedIn && <p>Après connexion, revenez sur cette page pour confirmer votre arrivée dans l’équipe.</p>}
        {feedback && <p role="alert">{feedback}</p>}
        <button className="salon-primary" disabled={busy} onClick={() => void accept()}>{busy ? "Validation…" : signedIn ? "Accepter l’invitation" : "Se connecter et continuer"}</button>
        {!signedIn && <p><Link href={`/?connexion=requise&returnTo=${encodeURIComponent("/salon/invitation/accept")}`}>Se connecter</Link></p>}
      </>}
    </section>
  </main>;
}
