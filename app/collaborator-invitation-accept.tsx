"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient } from "@/lib/supabase/client";

export function CollaboratorInvitationAccept({ token, supabaseUrl, supabaseAnonKey }: { token: string; supabaseUrl: string; supabaseAnonKey: string }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    void client?.auth.getUser().then(({ data }) => { if (active) setEmail(data.user?.email?.toLowerCase() ?? null); });
    window.history.replaceState(null, "", window.location.pathname);
    return () => { active = false; };
  }, []);
  const loginUrl = `/?connexion=requise&returnTo=${encodeURIComponent(`/salon/invitation/accept?token=${encodeURIComponent(token)}`)}`;
  async function accept() {
    if (!token || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/salon/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) { setMessage(result.error ?? "Invitation impossible à accepter."); return; }
      window.location.assign("/staff");
    } catch { setMessage("Connexion indisponible. Vérifiez votre réseau puis réessayez."); }
    finally { setBusy(false); }
  }
  return <main className="workspace-content" style={{ maxWidth: 620, margin: "8vh auto", padding: 24 }}>
    <section className="workspace-panel salon-panel">
      <span>MATA BEAUTY · ÉQUIPE</span><h1>Rejoindre un salon</h1>
      {!token ? <p role="alert">Ce lien d’invitation est incomplet. Demandez au responsable de vous envoyer une nouvelle invitation.</p> : email ? <>
        <p>Vous êtes connecté(e) avec <strong>{email}</strong>. L’acceptation associera ce compte au salon autorisé et activera uniquement les permissions prévues dans l’invitation.</p>
        <button className="salon-primary" disabled={busy} onClick={() => void accept()}>{busy ? "Acceptation…" : "Accepter et rejoindre le salon"}</button>
      </> : <>
        <p>Connectez-vous ou créez votre compte avec l’adresse e-mail qui a reçu l’invitation. Le compte existant ne sera pas remplacé.</p>
        <Link className="salon-primary" href={loginUrl}>Se connecter ou créer mon compte</Link>
      </>}
      {message && <p role="alert">{message}</p>}
    </section>
  </main>;
}
