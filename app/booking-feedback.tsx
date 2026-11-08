"use client";
import { useEffect, useState, type FormEvent } from "react";
import styles from "./booking-feedback.module.css";
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
    const [submitted, setSubmitted] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        async function load() {
            setReady(false); setError(""); setReviews([]); setOwn(false); setSubmitted(false);
            try {
                const api = getSupabaseBrowserClient();
                if (!api) throw Error("unavailable");
                const { data, error: authError } = await api.auth.getUser();
                if (authError || !data.user) throw Error("unauthorized");
                const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
                const [result, state] = await Promise.all([
                    api.rpc("get_booking_reviews", { target_booking_id: bookingId }).abortSignal(signal),
                    api.rpc("booking_review_submission_state", { target_booking_id: bookingId, target_type: direction }).abortSignal(signal),
                ]);
                if (state.error || typeof state.data !== "boolean") throw Error("Review state unavailable");
                if (result.error) throw result.error;
                if (!active) return;
                const rows = (result.data ?? []) as Review[];
                setSubmitted(state.data); setReviews(rows); setOwn(rows.some(row => row.type === direction && row.reviewer_id === data.user?.id)); setReady(true);
            } catch { if (active) setError("Avis indisponibles. Réessayez."); }
        }
        void load();
        return () => { active = false; controller.abort(); };
    }, [bookingId, direction, attempt]);
    async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy || submitted)
        return; setBusy(true); setError(""); const form = new FormData(event.currentTarget); try {
        const api = getSupabaseBrowserClient();
        const session = await api?.auth.getSession();
        const token = session?.data.session?.access_token;
        if (!token)
            throw Error();
        const response = await fetch("/api/bookings/reviews", { signal: AbortSignal.timeout(15_000), method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, type: direction, rating: Number(form.get("rating")), comment: String(form.get("comment") ?? ""), criteria: form.getAll("criteria"), visibility: direction === "provider_to_client" ? String(form.get("visibility")) : "public" }) });
        if (response.status === 409) { setAttempt(value => value + 1); throw Error(); }
        if (!response.ok)
            throw Error();
        setOwn(true); setSubmitted(true);
        setAttempt(value => value + 1);
    }
    catch (error) {
        const uncertain = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
        setError(uncertain ? "Enregistrement de l’avis non confirmé. Actualisez les avis avant de réessayer." : "Avis non enregistré : vérifiez votre accès et réessayez.");
    }
    finally {
        setBusy(false);
    } }
    return <section className={styles.feedback} aria-label="Évaluation du rendez-vous">
        {!ready && !error && <p role="status">Chargement des avis…</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer les avis</button></div>}
        {submitted ? <div role="status"><p className={styles.success}>{own ? "Votre évaluation est enregistrée." : "Une évaluation a déjà été enregistrée pour ce rendez-vous par votre équipe."}</p>{reviews.filter(review => review.type === direction).map(review => <ReviewCard key={review.id} review={review} title={own ? "Votre avis" : "Avis de votre équipe"} />)}</div> : ready && <details className={styles.composer}>
            <summary>{direction === "client_to_provider" ? "Donner mon avis" : "Évaluer ce client"}</summary>
            <form className={styles.form} onSubmit={submit}>
                <fieldset className={styles.rating}><legend>Quelle note souhaitez-vous donner ?</legend><div className={styles.stars}>{[1, 2, 3, 4, 5].map(n => <label className={styles.starChoice} key={n}><input required type="radio" name="rating" value={n} disabled={busy} aria-label={`${n} ${n === 1 ? "étoile" : "étoiles"}`} /><span aria-hidden="true">★</span></label>)}</div><small>Choisissez de 1 à 5 étoiles.</small></fieldset>
                <label className={styles.comment}>Votre commentaire<textarea name="comment" maxLength={2000} rows={4} placeholder="Partagez votre expérience…" disabled={busy} /></label>
                <fieldset className={styles.criteria}><legend>Ce que vous avez apprécié</legend>{(direction === "client_to_provider" ? [["quality", "Qualité"], ["welcome", "Accueil"], ["punctuality", "Ponctualité"]] : [["punctuality", "Ponctualité"], ["respect", "Respect"], ["behaviour", "Comportement"]]).map(([value, label]) => <label key={value}><input type="checkbox" name="criteria" value={value} disabled={busy}/>{label}</label>)}</fieldset>
                {direction === "provider_to_client" && <label className={styles.comment}>Visibilité<select name="visibility" defaultValue="internal" disabled={busy}><option value="internal">Interne au salon</option><option value="public">Public après dévoilement</option></select></label>}
                <p className={styles.notice}>Les avis publics sont dévoilés après les deux évaluations ou après 48 heures. Les commentaires internes restent privés.</p>
                <button className={styles.submit} disabled={busy}>{busy ? "Enregistrement…" : "Publier mon avis"}</button>
            </form>
        </details>}
        {reviews.filter(r => r.type !== direction).map(r => <ReviewCard key={r.id} review={r} title="Avis reçu" />)}
    </section>;
}

function ReviewCard({ review, title }: { review: Review; title: string }) {
    return <article className={styles.card}>
        <header><strong>{title}</strong><span className={styles.visibility}>{review.visibility === "internal" ? "Privé · Salon" : "Avis après prestation"}</span></header>
        <div className={styles.displayRating} aria-label={`${review.rating} sur 5 étoiles`}><span aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <span className={n <= review.rating ? styles.filled : styles.empty} key={n}>★</span>)}</span><strong>{review.rating}/5</strong></div>
        <p>{review.comment || "Sans commentaire"}</p>
    </article>;
}
