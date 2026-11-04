"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AuthModal } from "@/app/auth-modal";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { pendingSalonInvitation, salonInvitationPath, salonInvitationTokenKey } from "@/lib/domain/salon-invitation";
import "./invitation.css";

export default function AcceptSalonInvitationPage() {
  const router = useRouter();
  const enabled = process.env.NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED === "true";
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [salonName, setSalonName] = useState("");
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [feedback, setFeedback] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const candidate = enabled ? pendingSalonInvitation(fromLink, readBrowserStorage("sessionStorage", salonInvitationTokenKey)) : null;
    if (candidate) writeBrowserStorage("sessionStorage", salonInvitationTokenKey, candidate);
    else removeBrowserStorage("sessionStorage", salonInvitationTokenKey);
    // The secret stays in memory/session storage, never in requests or server logs.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    queueMicrotask(() => { if (active) setToken(candidate); });
    const client = getSupabaseBrowserClient();
    if (candidate && client) void (async () => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const { data } = await client.rpc("preview_business_invitation", { target_token_hash: hash });
      if (active && data && typeof data.salonName === "string") setSalonName(data.salonName);
    })().catch(() => {});
    const listener = client?.auth.onAuthStateChange((_event, session) => {
      if (active) { setSignedIn(Boolean(session)); setEmail(session?.user.email ?? ""); }
    });
    if (enabled && client) void client.auth.getSession().then(({ data }) => {
      if (active) { setSignedIn(Boolean(data.session)); setEmail(data.session?.user.email ?? ""); setReady(true); }
    }).catch(() => { if (active) setReady(true); });
    else queueMicrotask(() => { if (active) setReady(true); });
    return () => { active = false; listener?.data.subscription.unsubscribe(); };
  }, [enabled]);

  async function accept() {
    const client = getSupabaseBrowserClient();
    if (!enabled || !client || !token || inFlight.current) return;
    inFlight.current = true; setBusy(true); setFeedback("");
    try {
      const { data } = await client.auth.getSession();
      if (!data.session) { setAuthOpen(true); return; }
      const response = await fetch("/api/salon/invitations/accept", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ token }),
      });
      if (response.status === 401) { setSignedIn(false); setAuthOpen(true); return; }
      if (!response.ok) throw new Error("accept_failed");
      const result = await response.json() as { state?: string; redirectTo?: string };
      if (result.state === "pending_approval") { removeBrowserStorage("sessionStorage", salonInvitationTokenKey); setToken(null); setPendingApproval(true); return; }
      removeBrowserStorage("sessionStorage", salonInvitationTokenKey);
      setToken(null); setFeedback("Invitation acceptée. Ouverture de votre espace équipe…");
      router.replace(result.redirectTo === "/salon" ? "/salon" : "/staff");
      router.refresh();
    } catch {
      setFeedback("Impossible de confirmer cette invitation. Utilisez un compte confirmé ; pour une invitation par email, l’adresse doit correspondre. Si le lien a expiré ou a déjà été utilisé, demandez une nouvelle invitation.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  function notNow() {
    if (inFlight.current) return;
    removeBrowserStorage("sessionStorage", salonInvitationTokenKey);
    setToken(null); setDeclined(true); setFeedback("");
  }
  async function changeAccount() {
    const client = getSupabaseBrowserClient(); if (!client || busy) return;
    setBusy(true);
    try { const { error } = await client.auth.signOut(); if (error) throw error; setSignedIn(false); setEmail(""); setAuthOpen(true); }
    catch { setFeedback("La déconnexion n’a pas pu être confirmée. Réessayez."); }
    finally { setBusy(false); }
  }

  return <main className="team-invitation-page">
    <section className="team-invitation-card" aria-labelledby="salon-invitation-title">
      <Link className="team-invitation-brand" href="/" aria-label="Mata Beauty, accueil"><Image src="/brand/icon-192.png" alt="" width={56} height={56} /><span>Mata Beauty</span></Link>
      <p className="team-invitation-kicker">Invitation à rejoindre une équipe</p>
      <h1 id="salon-invitation-title">{salonName ? `Rejoindre l’équipe de ${salonName}` : "Souhaitez-vous rejoindre l’équipe ?"}</h1>
      {!enabled ? <p role="status">Les invitations collaborateur sont temporairement indisponibles.</p> : !ready ? <p role="status">Chargement de votre invitation…</p> : pendingApproval ? <><p role="status">Votre demande a été transmise au responsable du salon. Votre accès sera activé après sa confirmation.</p><Link className="team-invitation-secondary" href="/auth/workspace">Accéder à mon compte</Link></> : declined ? <>
        <p role="status">Vous n’avez pas rejoint l’équipe. Aucun accès n’a été ajouté à votre compte.</p>
        <p>Vous pouvez fermer cette page. Si vous changez d’avis avant l’expiration du lien, rouvrez le lien d’invitation.</p><Link className="team-invitation-secondary" href="/">Retour à Mata Beauty</Link>
      </> : token ? <>
        <p>Une équipe vous invite sur Mata Beauty. Choisissez votre réponse ci-dessous : vous n’avez rien à écrire ni à répondre par email.</p>
        <p>{signedIn ? <>Compte connecté : <strong>{email}</strong>. L’invitation sera rattachée à ce compte.</> : "Connectez-vous ou créez un compte confirmé. Pour une invitation par email, utilisez l’adresse invitée. Pour WhatsApp, acceptez le lien personnel envoyé par le responsable pour accéder à votre espace équipe."}</p>
        <p className="team-invitation-note">Le lien est personnel et valable 48 heures. L’ouverture de cette page ne donne aucun accès. En acceptant, vous rejoignez le salon avec les droits définis par le responsable. Ne transférez pas ce lien personnel.</p>
        <div className="team-invitation-actions"><button className="team-invitation-primary" type="button" disabled={busy} onClick={() => void accept()}>{busy ? "Validation…" : "Accepter et accéder à mon espace"}</button><button className="team-invitation-secondary" type="button" disabled={busy} onClick={notNow}>Non, pas maintenant</button></div>
        {signedIn && <button className="team-invitation-account" type="button" disabled={busy} onClick={() => void changeAccount()}>Utiliser un autre compte</button>}
      </> : <p role="status">{feedback || "Ce lien d’invitation est manquant ou invalide. Ouvrez le lien transmis par le responsable du salon, ou demandez une nouvelle invitation."}</p>}
      {token && feedback && <p className="team-invitation-error" role="alert">{feedback}</p>}
    </section>
    {authOpen && <AuthModal intendedRole="client" returnTo={salonInvitationPath} onClose={() => setAuthOpen(false)} onAuthenticated={() => { setAuthOpen(false); setSignedIn(true); setFeedback("Vous êtes connecté. Touchez « Accepter et accéder à mon espace » pour confirmer votre choix."); }} />}
  </main>;
}
