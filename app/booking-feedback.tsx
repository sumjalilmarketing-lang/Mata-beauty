"use client";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Review = {
    id: string;
    reviewer_id: string;
    type: string;
    rating: number;
    comment: string | null;
    visibility: string;
};
export function BookingFeedback({ bookingId, direction }: {
    bookingId: string;
    direction: "client_to_provider" | "provider_to_client";
}) {
    const [reviews, setReviews] = useState<Review[]>([]), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const [own, setOwn] = useState(false);
    useEffect(() => { let active = true; const api = getSupabaseBrowserClient(); if (!api)
        return; void api.auth.getUser().then(async ({ data }) => { const r = await api.rpc("get_booking_reviews", { target_booking_id: bookingId }); if (!active)
        return; if (r.error) {
        setError("Avis indisponibles. Réessayez ultérieurement.");
        return;
    } const rows = (r.data ?? []) as Review[]; setReviews(rows); setOwn(rows.some(x => x.type === direction && x.reviewer_id === data.user?.id)); setReady(true); }); return () => { active = false; }; }, [bookingId, direction]);
    async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy)
        return; setBusy(true); setError(""); const form = new FormData(event.currentTarget); try {
        const api = getSupabaseBrowserClient();
        const session = await api?.auth.getSession();
        const token = session?.data.session?.access_token;
        if (!token)
            throw Error();
        const response = await fetch("/api/bookings/reviews", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, type: direction, rating: Number(form.get("rating")), comment: String(form.get("comment") ?? ""), criteria: form.getAll("criteria"), visibility: direction === "provider_to_client" ? String(form.get("visibility")) : "public" }) });
        if (!response.ok)
            throw Error();
        setOwn(true);
    }
    catch {
        setError("Avis non enregistré : vérifiez votre accès et réessayez.");
    }
    finally {
        setBusy(false);
    } }
    return <section aria-label="Évaluation du rendez-vous">{error && <p role="alert">{error}</p>}{own ? <p role="status">Votre évaluation est enregistrée.</p> : ready && <details><summary>{direction === "client_to_provider" ? "Évaluer cette prestation" : "Évaluer ce client"}</summary><p>Les avis publics sont dévoilés après les deux évaluations ou après 48 heures. Les commentaires internes restent réservés au salon.</p><form className="dashboard-form" onSubmit={submit}><label>Note<select name="rating" defaultValue="5">{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label><fieldset><legend>Critères</legend>{(direction === "client_to_provider" ? [["quality", "Qualité"], ["welcome", "Accueil"], ["punctuality", "Ponctualité"]] : [["punctuality", "Ponctualité"], ["respect", "Respect"], ["behaviour", "Comportement"]]).map(([value, label]) => <label key={value}><input type="checkbox" name="criteria" value={value}/>{label}</label>)}</fieldset><label>Commentaire<textarea name="comment" maxLength={2000}/></label>{direction === "provider_to_client" && <label>Visibilité<select name="visibility" defaultValue="internal"><option value="internal">Interne au salon</option><option value="public">Public après dévoilement</option></select></label>}<button disabled={busy}>{busy ? "Enregistrement…" : "Envoyer mon évaluation"}</button></form></details>}{reviews.filter(r => r.type !== direction).map(r => <p key={r.id}>{r.rating} / 5 · {r.comment ?? "Sans commentaire"}{r.visibility === "internal" ? " · Interne" : ""}</p>)}</section>;
}
