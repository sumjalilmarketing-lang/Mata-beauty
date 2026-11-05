"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Item = {
    collaborator_id: string;
    business_id: string;
    salon_name: string;
    service_id: string;
    title: string;
    assigned: boolean;
};
type Membership = {
    collaborator_id: string;
    business_id: string;
};
type Declaration = {
    id: string;
    collaborator_id: string;
    title: string;
    description: string;
};
export function StaffServiceEditor() {
    const [items, setItems] = useState<Item[]>([]), [members, setMembers] = useState<Membership[]>([]), [declared, setDeclared] = useState<Declaration[]>([]), [selected, setSelected] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
    const load = useCallback(async () => { const api = getSupabaseBrowserClient(); if (!api)
        throw Error(); const [catalog, memberships, declarations] = await Promise.all([api.rpc("staff_service_catalog").abortSignal(AbortSignal.timeout(12000)), api.rpc("current_collaborator_access").abortSignal(AbortSignal.timeout(12000)), api.rpc("list_staff_service_declarations").abortSignal(AbortSignal.timeout(12000))]); if (catalog.error || memberships.error || declarations.error)
        throw Error(); setItems((catalog.data ?? []) as Item[]); setMembers((memberships.data ?? []) as Membership[]); setDeclared((declarations.data ?? []) as Declaration[]); }, []);
    useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => setMessage("Les prestations n’ont pas pu être chargées.")).finally(() => setLoading(false)), 0); return () => window.clearTimeout(timer); }, [load]);
    async function toggle(item: Item) { if (busy)
        return; setBusy(true); try {
        const r = await getSupabaseBrowserClient()?.rpc("staff_set_service", { target_collaborator: item.collaborator_id, target_service: item.service_id, enabled: !item.assigned });
        if (!r || r.error)
            throw Error();
        await load();
        setMessage("Vos prestations sont mises à jour. Le responsable est informé.");
    }
    catch {
        setMessage("Modification impossible. Vérifiez votre accès.");
    }
    finally {
        setBusy(false);
    } }
    async function declare(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy)
        return; const form = e.currentTarget, values = new FormData(form); setBusy(true); try {
        const r = await getSupabaseBrowserClient()?.rpc("staff_declare_service", { target_collaborator: values.get("collaborator"), target_title: values.get("title"), target_description: values.get("description") });
        if (!r || r.error)
            throw Error();
        form.reset();
        await load();
        setMessage("Prestation renseignée. Le responsable peut lui attribuer un prix et une durée dans le catalogue du salon.");
    }
    catch {
        setMessage("La prestation n’a pas été enregistrée.");
    }
    finally {
        setBusy(false);
    } }
    const active = selected || members[0]?.collaborator_id;
    return <section className="workspace-content"><h2>Mes prestations</h2><p>Sélectionnez les prestations du salon que vous réalisez. Leur réservation utilise vos disponibilités réelles. Les prix du salon restent gérés par le responsable.</p>{message && <p role="status">{message}</p>}{loading && <p role="status">Chargement des prestations…</p>}{!loading && members.length === 0 && <p>Aucun accès à un salon disponible. Contactez le responsable si votre invitation a déjà été acceptée.</p>}<button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setMessage(""); void load().catch(() => setMessage("Les prestations n’ont pas pu être chargées.")).finally(() => setLoading(false)); }}>Actualiser les prestations</button><label>Mon salon<select value={active ?? ""} onChange={e => setSelected(e.target.value)} disabled={busy}>{members.map(m => <option key={m.collaborator_id} value={m.collaborator_id}>{items.find(i => i.business_id === m.business_id)?.salon_name ?? "Mon salon"}</option>)}</select></label><fieldset disabled={busy}><legend>Prestations que je réalise</legend>{items.filter(i => i.collaborator_id === active).map(i => <label key={i.service_id}><input type="checkbox" checked={i.assigned} onChange={() => void toggle(i)}/>{i.title}</label>)}</fieldset><p>Votre fiche doit être active et réservable, et vos horaires renseignés. Retirer une prestation n’annule pas vos rendez-vous existants.</p>{members.length > 0 && <details><summary>Renseigner une autre prestation</summary><form className="dashboard-form" onSubmit={declare}><input type="hidden" name="collaborator" value={active ?? ""}/><label>Nom de la prestation<input name="title" required minLength={2} maxLength={120}/></label><label>Description<textarea name="description" maxLength={2000}/></label><button disabled={busy}>Enregistrer ma prestation</button></form><p>Pour être réservable, une nouvelle prestation doit avoir un prix et une durée dans le catalogue du salon.</p></details>}<h3>Prestations renseignées</h3>{declared.filter(d => d.collaborator_id === active).map(d => <article key={d.id}><strong>{d.title}</strong><p>{d.description}</p></article>)}</section>;
}
