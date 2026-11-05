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
    const services = items.filter(item => item.collaborator_id === active);
    const declarations = declared.filter(item => item.collaborator_id === active);
    return <section className="workspace-content staff-services">
      <header className="staff-page-heading"><div><h2>Mes prestations</h2><p>Choisissez ce que vous réalisez au salon.</p></div>
        <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setMessage(""); void load().catch(() => setMessage("Les prestations n’ont pas pu être chargées.")).finally(() => setLoading(false)); }}>↻ Actualiser</button>
      </header>
      {message && <p className="staff-notice" role="status">{message}</p>}
      {loading && <p role="status">Chargement des prestations…</p>}
      {!loading && members.length === 0 && <article className="staff-card"><h3>Aucun salon associé</h3><p>Contactez le responsable si votre invitation a déjà été acceptée.</p></article>}
      {members.length > 0 && <>
        <article className="staff-card"><label className="staff-field">Mon salon<select value={active ?? ""} onChange={event => setSelected(event.target.value)} disabled={busy || loading}>{members.map(member => <option key={member.collaborator_id} value={member.collaborator_id}>{items.find(item => item.business_id === member.business_id)?.salon_name ?? "Mon salon"}</option>)}</select></label></article>
        <article className="staff-card"><div className="staff-card-heading"><h3>Prestations que je réalise</h3><span>{services.filter(item => item.assigned).length} sélectionnée(s)</span></div>
          <p>Activez les prestations que les clients peuvent réserver avec vous.</p>
          <fieldset className="staff-service-options" disabled={busy || loading}><legend className="sr-only">Choisir mes prestations</legend>
            {services.map(item => <label className={`staff-service-choice${item.assigned ? " selected" : ""}`} key={item.service_id}><span>{item.title}<small>{item.assigned ? "Je réalise cette prestation" : "Non sélectionnée"}</small></span><input type="checkbox" checked={item.assigned} onChange={() => void toggle(item)} /></label>)}
          </fieldset>
          {!loading && !services.length && <p className="staff-empty">Le catalogue de ce salon est vide. Vous pouvez renseigner une prestation ci-dessous.</p>}
          <details className="staff-help"><summary>Comment fonctionne la réservation ?</summary><p>Votre fiche doit être active et réservable et vos horaires renseignés. Le responsable gère les prix. Retirer une prestation conserve vos rendez-vous existants.</p></details>
        </article>
        <details className="staff-card staff-add-service"><summary>＋ Renseigner une prestation</summary><p>Proposez une prestation au responsable du salon.</p><form className="salon-form" onSubmit={declare}>
          <input type="hidden" name="collaborator" value={active ?? ""}/><label>Nom de la prestation<input name="title" placeholder="Ex. : Tresses, brushing…" required minLength={2} maxLength={120}/></label><label>Description<textarea name="description" placeholder="Précisez votre savoir-faire" maxLength={2000}/></label><button className="staff-primary" disabled={busy || loading}>{busy ? "Enregistrement…" : "Enregistrer ma prestation"}</button>
        </form><p>Le responsable complète le prix et la durée avant la réservation en ligne.</p></details>
        <article className="staff-card"><h3>Mes prestations proposées</h3>{declarations.length ? <div className="staff-declarations">{declarations.map(item => <article key={item.id}><strong>{item.title}</strong><span className="staff-status">Transmise au responsable</span>{item.description && <p>{item.description}</p>}</article>)}</div> : <p className="staff-empty">Vous n’avez pas encore proposé de prestation.</p>}</article>
      </>}
    </section>;
}
