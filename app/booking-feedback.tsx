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
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        async function load() {
            setReady(false); setError(""); setReviews([]); setOwn(false);
            try {
                const api = getSupabaseBrowserClient();
                if (!api) throw Error("unavailable");
                const { data, error: authError } = await api.auth.getUser();
                if (authError || !data.user) throw Error("unauthorized");
                const result = await api.rpc("get_booking_reviews", { target_booking_id: bookingId }).abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]));
                if (result.error) throw result.error;
                if (!active) return;
                const rows = (result.data ?? []) as Review[];
                setReviews(rows); setOwn(rows.some(row => row.type === direction && row.reviewer_id === data.user?.id)); setReady(true);
            } catch { if (active) setError("Avis indisponibles. Réessayez."); }
        }
        void load();
        return () => { active = false; controller.abort(); };
    }, [bookingId, direction, attempt]);
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
        setAttempt(value => value + 1);
    }
    catch {
        setError("Avis non enregistré : vérifiez votre accès et réessayez.");
    }
    finally {
        setBusy(false);
    } }
    return <section aria-label="Évaluation du rendez-vous">{!ready && !error && <p role="status">Chargement des avis…</p>}{error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer les avis</button></div>}{own ? <div role="status"><p>Votre évaluation est enregistrée.</p>{reviews.filter(review => review.type === direction).map(review => <p key={review.id}>{review.rating} / 5 · {review.comment || "Sans commentaire"}{review.visibility === "internal" ? " · Interne au salon" : " · Avis public après dévoilement"}</p>)}</div> : ready && <details><summary>{direction === "client_to_provider" ? "Évaluer cette prestation" : "Évaluer ce client"}</summary><p>Les avis publics sont dévoilés après les deux évaluations ou après 48 heures. Les commentaires internes restent réservés au salon.</p><form className="dashboard-form" onSubmit={submit}><label>Note<select name="rating" defaultValue="5">{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label><fieldset><legend>Critères</legend>{(direction === "client_to_provider" ? [["quality", "Qualité"], ["welcome", "Accueil"], ["punctuality", "Ponctualité"]] : [["punctuality", "Ponctualité"], ["respect", "Respect"], ["behaviour", "Comportement"]]).map(([value, label]) => <label key={value}><input type="checkbox" name="criteria" value={value}/>{label}</label>)}</fieldset><label>Commentaire<textarea name="comment" maxLength={2000}/></label>{direction === "provider_to_client" && <label>Visibilité<select name="visibility" defaultValue="internal"><option value="internal">Interne au salon</option><option value="public">Public après dévoilement</option></select></label>}<button disabled={busy}>{busy ? "Enregistrement…" : "Envoyer mon évaluation"}</button></form></details>}{reviews.filter(r => r.type !== direction).map(r => <p key={r.id}>Avis reçu : {r.rating} / 5 · {r.comment ?? "Sans commentaire"}{r.visibility === "internal" ? " · Interne" : ""}</p>)}</section>;
}
