"use client";
import "./push-settings.css";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function pushRequest(method: string, body?: unknown) {
  const session = await getSupabaseBrowserClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Reconnectez-vous pour régler vos notifications.");
  const response = await fetch("/api/push", { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Notifications indisponibles. Réessayez.");
  return data;
}
export function PushSettings() {
  const [key, setKey] = useState("");
  const [supported, setSupported] = useState(false);
  const [installNeeded, setInstallNeeded] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      if (active) setInstallNeeded(iphone && !standalone);
      if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) || !window.isSecureContext) { if (active) setBusy(false); return; }
      if (active) setSupported(true);
      try {
        const [configuration, registration] = await Promise.all([pushRequest("GET"), navigator.serviceWorker.register("/sw.js", { scope: "/" })]);
        const current = await registration.pushManager.getSubscription();
        if (!active) return;
        setKey(configuration.enabled ? configuration.publicKey : "");
        setSubscription(current);
        const saved = (configuration.subscriptions as Array<{ endpoint: string; sound: boolean }> | undefined)?.find(item => item.endpoint === current?.endpoint);
        setEnabled(Boolean(saved) && Notification.permission === "granted");
        if (saved) setSound(saved.sound);
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "Notifications indisponibles."); }
      finally { if (active) setBusy(false); }
    }
    void load(); return () => { active = false; };
  }, []);
  async function enable() {
    setBusy(true); setMessage("");
    let created: PushSubscription | null = null;
    try {
      // Called only by the user's click, required by iOS and permission UX.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Autorisez les notifications dans les réglages du navigateur ou de Mata Beauty, puis réessayez.");
      const registration = await navigator.serviceWorker.ready;
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = Uint8Array.from(raw, letter => letter.charCodeAt(0));
      const current = await registration.pushManager.getSubscription();
      const next = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      if (!current) created = next;
      await pushRequest("POST", { ...next.toJSON(), sound });
      setSubscription(next); setEnabled(true); setMessage("Notifications activées sur cet appareil, y compris quand vous quittez l’application.");
    } catch (error) {
      if (created) await created.unsubscribe().catch(() => false);
      setMessage(error instanceof Error ? error.message : "Activation impossible. Réessayez.");
    } finally { setBusy(false); }
  }
  async function disable() {
    if (!subscription) return;
    setBusy(true); setMessage("");
    try {
      await pushRequest("DELETE", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
      setSubscription(null); setEnabled(false); setMessage("Notifications désactivées sur cet appareil.");
    } catch { setMessage("La désactivation n’a pas pu être confirmée. Réessayez."); }
    finally { setBusy(false); }
  }
  async function changeSound(value: boolean) {
    if (!enabled || !subscription) { setSound(value); return; }
    setBusy(true); setMessage("");
    try { await pushRequest("POST", { ...subscription.toJSON(), sound: value }); setSound(value); }
    catch { setMessage("Le réglage du son n’a pas pu être enregistré."); }
    finally { setBusy(false); }
  }
  return <aside className="push-settings" aria-label="Notifications sur cet appareil">
    <h3>Notifications sur cet appareil</h3>
    <p>Recevez vos nouvelles réservations, confirmations et changements de planning même après avoir quitté Mata Beauty.</p>
    {installNeeded ? <p>Sur iPhone ou iPad : ouvrez Mata Beauty dans Safari, touchez Partager, puis « Sur l’écran d’accueil ». Ouvrez ensuite l’icône Mata Beauty pour activer les notifications.</p> : !supported && !busy ? <p>Les notifications push ne sont pas prises en charge par ce navigateur. Vos notifications restent consultables ici.</p> : <>
      <p>{enabled ? "Activées sur cet appareil" : "Désactivées sur cet appareil"}</p>
      {!key && !busy && <p>L’activation est momentanément indisponible. Réessayez plus tard.</p>}
      <label><input type="checkbox" checked={sound} disabled={busy} onChange={event => void changeSound(event.target.checked)} /> Autoriser le son</label>
      <p>Le compteur sur l’icône indique les notifications non lues, sur les appareils compatibles. Autorisez aussi les pastilles dans les réglages de votre appareil.</p>
      <p>Le son dépend du téléphone : le mode silencieux, Ne pas déranger et les réglages système restent prioritaires.</p>
      {!enabled && <button type="button" disabled={busy || !key} onClick={() => void enable()}>{busy ? "Chargement…" : "Activer les notifications"}</button>}
      {subscription && <button type="button" disabled={busy} onClick={() => void disable()}>Désactiver sur cet appareil</button>}
    </>}
    {message && <p role="status">{message}</p>}
  </aside>;
}
