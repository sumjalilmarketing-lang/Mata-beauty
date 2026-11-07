"use client";
import { useState, type FormEvent } from "react";
import { localDateTimeInputToInstant } from "@/lib/domain/time-zone";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
export function BookingReschedule({ bookingId, timeZone, onSaved }: {
    bookingId: string;
    timeZone: string;
    onSaved: () => Promise<void>;
}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState("");
    async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy)
        return; setBusy(true); setError(""); try {
        const start = localDateTimeInputToInstant(String(new FormData(e.currentTarget).get("start")), timeZone, "start");
        const api = getSupabaseBrowserClient();
        if (!api)
            throw Error();
        const result = await api.rpc("reschedule_owned_booking", { target_booking_id: bookingId, target_starts_at: start.toISOString() }).abortSignal(AbortSignal.timeout(15_000));
        if (result.error)
            throw Error();
        await onSaved();
    }
    catch {
        setError("Déplacement non confirmé : actualisez l’agenda avant de réessayer.");
    }
    finally {
        setBusy(false);
    } }
    return <details><summary>Déplacer le rendez-vous</summary><p>Heure du salon : {timeZone}. La durée, le collaborateur et le prix sont conservés.</p><form onSubmit={submit}><label>Nouveau début<input name="start" type="datetime-local" required/></label><button disabled={busy}>{busy ? "Vérification…" : "Confirmer le déplacement"}</button></form>{error && <p role="alert">{error}</p>}</details>;
}
