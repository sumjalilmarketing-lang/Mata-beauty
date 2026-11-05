"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { localDateTimeInputToInstant } from "@/lib/domain/time-zone";
type Task = {
    id: string;
    collaborator_id: string;
    title: string;
    description: string;
    status: string;
    due_at: string | null;
};
type Person = {
    id: string;
    display_name: string;
};
type Declaration = {
    id: string;
    collaborator_id: string;
    title: string;
    description: string;
};
export function SalonStaffTasks({ businessId, members = [], timeZone }: {
    businessId?: string;
    members?: Person[];
    timeZone?: string;
}) {
    const [displayTimeZone, setDisplayTimeZone] = useState(timeZone ?? "UTC");
    const [loading, setLoading] = useState(true);
    useEffect(() => { const timer = window.setTimeout(() => setDisplayTimeZone(timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"), 0); return () => window.clearTimeout(timer); }, [timeZone]);
    const [tasks, setTasks] = useState<Task[]>([]), [declarations, setDeclarations] = useState<Declaration[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
    const load = useCallback(async () => { const api = getSupabaseBrowserClient(); if (!api)
        throw Error(); const result = await api.rpc("list_my_staff_tasks", { target_business: businessId ?? null }).abortSignal(AbortSignal.timeout(12000)); if (result.error)
        throw Error(); setTasks((result.data ?? []) as Task[]); if (businessId) {
        const d = await api.rpc("list_staff_service_declarations", { target_business: businessId }).abortSignal(AbortSignal.timeout(12000));
        if (d.error)
            throw Error();
        setDeclarations((d.data ?? []) as Declaration[]);
    } }, [businessId]);
    useEffect(() => { const initial = window.setTimeout(() => void load().catch(() => setMessage("Les tâches n’ont pas pu être chargées.")).finally(() => setLoading(false)), 0); const refresh = () => void load().catch(() => { }); const timer = window.setInterval(refresh, 30000); window.addEventListener("focus", refresh); return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", refresh); }; }, [load]);
    async function assign(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy)
        return; const form = e.currentTarget, data = new FormData(form); setBusy(true); try {
        const due = String(data.get("due") ?? "");
        const r = await getSupabaseBrowserClient()?.rpc("assign_salon_staff_task", { target_business: businessId, target_collaborator: data.get("member"), target_title: data.get("title"), target_description: data.get("description"), target_due_at: due ? localDateTimeInputToInstant(due, displayTimeZone).toISOString() : null });
        if (!r || r.error)
            throw Error();
        form.reset();
        await load();
        setMessage("Tâche assignée. Le collaborateur reçoit une notification.");
    }
    catch {
        setMessage("Attribution refusée. Vérifiez le compte collaborateur et vos droits.");
    }
    finally {
        setBusy(false);
    } }
    async function update(task: Task, status: string) { if (busy) return; setBusy(true); try {
        const r = await getSupabaseBrowserClient()?.rpc("update_my_staff_task", { target_task: task.id, target_status: status });
        if (!r || r.error)
            throw Error();
        await load();
    }
    catch {
        setMessage("Modification refusée.");
    }
    finally {
        setBusy(false);
    } }
    return <section className="workspace-panel salon-panel"><h2>{businessId ? "Tâches de l’équipe" : "Mes tâches"}</h2>{message && <p role="status">{message}</p>}{loading && <p role="status">Chargement des tâches…</p>}<button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setMessage(""); void load().catch(() => setMessage("Les tâches n’ont pas pu être chargées.")).finally(() => setLoading(false)); }}>Actualiser les tâches</button>{businessId && <form className="salon-form" onSubmit={assign}><label>Collaborateur<select name="member" required disabled={busy}><option value="">Choisir</option>{members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}</select></label><label>Tâche<input name="title" required minLength={2} maxLength={160}/></label><label>Consignes<textarea name="description" maxLength={2000}/></label><label>Échéance ({displayTimeZone})<input name="due" type="datetime-local"/></label><button disabled={busy}>Assigner la tâche</button></form>}{tasks.map(task => <article key={task.id}><strong>{task.title}</strong><p>{task.description}</p>{businessId && <p>{members.find(m => m.id === task.collaborator_id)?.display_name ?? "Collaborateur"}</p>}{task.due_at && <p>Échéance : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: displayTimeZone }).format(new Date(task.due_at))}</p>}<label>Statut<select value={task.status} disabled={busy} onChange={e => void update(task, e.target.value)}><option value="todo">À faire</option><option value="in_progress">En cours</option><option value="done">Terminée</option></select></label></article>)}{!loading && !message && tasks.length === 0 && <p>Aucune tâche assignée.</p>}{businessId && <details><summary>Prestations renseignées par les collaborateurs</summary>{declarations.map(d => <article key={d.id}><strong>{d.title}</strong><p>{members.find(m => m.id === d.collaborator_id)?.display_name ?? "Collaborateur"}</p><p>{d.description}</p></article>)}<p>Ajoutez ces prestations au catalogue du salon avec leur durée et leur prix, puis attribuez-les au collaborateur.</p></details>}</section>;
}
