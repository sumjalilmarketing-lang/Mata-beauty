"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

type Hours = { id: string; weekday: number; starts_at: string; ends_at: string };
const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function ProviderAgenda({ userId }: { userId: string }) {
  const [hours, setHours] = useState<Hours[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) { setLoading(false); setNotice("Agenda indisponible. Réessayez plus tard."); return; }
    const result = await client.from("availability_rules").select("id,weekday,starts_at,ends_at").eq("provider_id", userId).order("weekday").order("starts_at");
    if (result.error) setNotice(publicErrorMessage(result.error, "Les horaires n’ont pas pu être chargés."));
    else setHours(result.data ?? []);
    setLoading(false);
  }, [userId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseBrowserClient(); if (!client || busy) return;
    const values = new FormData(event.currentTarget);
    const starts = String(values.get("starts")), ends = String(values.get("ends"));
    if (starts >= ends) { setNotice("L’heure de fin doit suivre l’heure de début."); return; }
    setBusy(true);
    const result = await client.from("availability_rules").insert({ provider_id: userId, weekday: Number(values.get("day")), starts_at: starts, ends_at: ends, slot_interval_minutes: 30 });
    setNotice(result.error ? publicErrorMessage(result.error, "Cet horaire n’a pas pu être ajouté. Vérifiez qu’il n’existe pas déjà.") : "Disponibilités enregistrées.");
    setBusy(false); if (!result.error) await load();
  }
  async function remove(id: string) {
    const client = getSupabaseBrowserClient(); if (!client || busy) return;
    if (!window.confirm("Supprimer cet horaire ? Les rendez-vous existants seront conservés, mais aucun nouveau rendez-vous ne pourra utiliser cette disponibilité.")) return;
    setBusy(true);
    const result = await client.from("availability_rules").delete().eq("id", id).eq("provider_id", userId);
    setNotice(result.error ? "La suppression a échoué." : "Horaire supprimé. Les rendez-vous existants sont conservés.");
    setBusy(false); if (!result.error) await load();
  }
  return <section className="workspace-content"><Link className="workspace-quick-publish" href="/pro/bookings">Mes réservations</Link><article className="panel"><h2>Mes disponibilités</h2><p>Choisissez les horaires où les clients peuvent réserver.</p>{notice && <p role="status">{notice}</p>}<form className="dashboard-form" onSubmit={(event) => void save(event)}><label>Jour<select name="day">{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>De<input name="starts" type="time" required defaultValue="09:00" /></label><label>À<input name="ends" type="time" required defaultValue="18:00" /></label><button className="primary-button" disabled={busy}>{busy ? "Enregistrement…" : "Ajouter un horaire"}</button></form>{loading ? <p>Chargement…</p> : hours.length ? hours.map((hour) => <div className="control-list-row" key={hour.id}><strong>{days[hour.weekday]}</strong><span>{hour.starts_at.slice(0, 5)} – {hour.ends_at.slice(0, 5)}</span><button disabled={busy} onClick={() => void remove(hour.id)}>Supprimer</button></div>) : <p>Aucun horaire défini. Ajoutez votre première disponibilité.</p>}</article></section>;
}

type Payment = { id: string; gross_amount: number; platform_fee: number; professional_net_amount: number; payment_status: string; created_at: string };
export function ProviderRevenue({ userId }: { userId: string }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.from("payments").select("id,gross_amount,platform_fee,professional_net_amount,payment_status,created_at,bookings!inner(provider_id)").eq("bookings.provider_id", userId).order("created_at", { ascending: false }).limit(100).then(({ data, error }) => {
      if (!active) return;
      setPayments((data ?? []) as Payment[]); setState(error ? "error" : "ready");
    });
    return () => { active = false; };
  }, [userId]);
  const money = (amount: number) => `${Number.isFinite(Number(amount)) ? Number(amount).toLocaleString("fr-FR") : "—"} FCFA`;
  return <section className="workspace-content"><article className="panel"><h2>Mes revenus</h2><p>Le paiement en ligne n’est pas encore activé. Aucun versement réel n’est effectué par Mata Beauty.</p>{state === "loading" ? <p>Chargement…</p> : state === "error" ? <p role="alert">Vos revenus sont momentanément indisponibles.</p> : payments.length === 0 ? <p>Vos revenus apparaîtront ici après vos premières prestations.</p> : <div>{payments.map((payment) => <article className="control-list-row" key={payment.id}><span>{new Date(payment.created_at).toLocaleDateString("fr-FR")}</span><dl><dt>Montant client</dt><dd>{money(payment.gross_amount)}</dd><dt>Commission Mata Beauty</dt><dd>{money(payment.platform_fee)}</dd><dt>Net professionnel</dt><dd>{money(payment.professional_net_amount)}</dd><dt>Paiement</dt><dd>{payment.payment_status === "paid" ? "Réglé" : payment.payment_status === "simulated_paid" ? "Simulation" : "À vérifier"}</dd></dl></article>)}</div>}</article></section>;
}
