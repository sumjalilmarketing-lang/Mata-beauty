"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicErrorMessage } from "@/lib/ui/public-error";

export function BookingReview({ bookingId, clientId, providerId, performer }: { bookingId: string; clientId: string; providerId: string; performer: string | null }) {
  const [exists, setExists] = useState<boolean | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    const api = getSupabaseBrowserClient();
    if (api) void api.from("reviews").select("id").eq("booking_id", bookingId).maybeSingle().then(result => { if (active) { if (result.error) setMessage("Votre avis n’a pas pu être chargé."); else setExists(Boolean(result.data)); } });
    return () => { active = false; };
  }, [bookingId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const api = getSupabaseBrowserClient(); if (!api || lock.current) return;
    lock.current = true; setBusy(true); const form = new FormData(event.currentTarget);
    try {
      const result = await api.from("reviews").insert({ booking_id: bookingId, client_id: clientId, provider_id: providerId, rating: Number(form.get("rating")), comment: String(form.get("comment") ?? "").trim() || null });
      if (result.error) throw result.error;
      setExists(true); setMessage("Merci. Votre avis vérifié est enregistré.");
    } catch (error) { setMessage(publicErrorMessage(error, "Votre avis n’a pas pu être enregistré.")); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div>{message && <p role="status">{message}</p>}{exists === true ? <p>Avis enregistré · Réservation vérifiée</p> : exists === false && <details><summary>Donner mon avis sur cette prestation</summary><p>{performer ? `Prestation réalisée par ${performer}.` : "Partagez votre expérience avec ce professionnel."}</p><form className="dashboard-form" onSubmit={submit}><label>Note<select name="rating" required defaultValue="5">{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label><label>Votre expérience<textarea name="comment" maxLength={2000} rows={3} /></label><button disabled={busy}>Publier mon avis</button></form></details>}</div>;
}
