"use client";
import { useEffect, useRef, useState } from "react";

type Account = { user_id: string; display_name: string; email: string; account_role: string; is_suspended: boolean; is_archived: boolean; is_test: boolean; is_protected: boolean; deletion_pending: boolean; bookings_count: number };
type Preview = { userId: string; name: string; email: string; protected: boolean; canDelete: boolean; archived: boolean; dependencies: { table: string; count: number }[]; removedData: string[]; retainedData: string[] };
type Outcome = { userId: string; status: string; message?: string; preview?: Preview };
type Action = "suspend" | "archive" | "reactivate" | "delete";
const labels: Record<Action, string> = { suspend: "Suspendre", archive: "Archiver", reactivate: "Réactiver", delete: "Supprimer le compte" };
const dependencyLabels: Record<string, string> = { bookings: "Réservations", payments: "Paiements", invoices: "Factures", provider_profiles: "Dossier professionnel", documents_et_fichiers: "Documents et fichiers privés", account_deletion_requests: "Demandes de suppression", user_activity_history: "Historique du compte", notification_deliveries: "Preuves d’envoi des notifications", audit_logs: "Journal d’audit", support_tickets: "Demandes de support", support_messages: "Messages de support", messages: "Messages", reports: "Signalements", disputes: "Litiges", refunds: "Remboursements" };
const consequences: Record<Action, string> = {
  suspend: "L’accès et les sessions sont révoqués. Toutes les données sont conservées ; le compte peut être réactivé.",
  archive: "Le compte quitte la liste des comptes actifs et son accès est révoqué. Les données restent conservées ; la réactivation le désarchive.",
  reactivate: "Le compte est désarchivé et peut se reconnecter. Ses anciennes sessions ne sont pas restaurées.",
  delete: "Suppression irréversible du profil et de l’identité de connexion, uniquement sans dépendance à conserver. Le journal et les dates de consentement sont conservés."
};

export function ManagedAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [previews, setPreviews] = useState<Outcome[]>([]);
  const [results, setResults] = useState<Outcome[]>([]);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const operations = useRef<{ userId: string; operationId: string }[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/accounts?search=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = await response.json() as { accounts?: Account[]; error?: string };
        if (!response.ok || !body.accounts) throw new Error(body.error || "Liste indisponible.");
        setAccounts(body.accounts); setFeedback("");
      } catch (error) { if (!controller.signal.aborted) setFeedback(error instanceof Error ? error.message : "La liste est indisponible."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, revision]);
  useEffect(() => { if (action) dialog.current?.showModal(); else dialog.current?.close(); }, [action]);
  const visible = accounts.filter(account => filter === "all" || (filter === "test" ? account.is_test : filter === "archived" ? account.is_archived : filter === "suspended" ? account.is_suspended && !account.is_archived : !account.is_suspended && !account.is_archived));
  async function prepare(next: Action, ids: string[]) {
    if (pending.current || !ids.length) return;
    pending.current = true; setBusy(true); setFeedback(""); setResults([]); setReason(""); setConfirmation(""); setPreviews([]);
    operations.current = ids.map(userId => ({ userId, operationId: crypto.randomUUID() }));
    try {
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", accounts: operations.current }) });
      const body = await response.json() as { results?: Outcome[]; error?: string };
      if (!response.ok || !body.results) throw new Error(body.error || "Préparation indisponible.");
      setPreviews(body.results); setAction(next);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Le contrôle préalable a échoué."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function execute() {
    if (!action || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, accounts: operations.current, reason, confirmation }) });
      const body = await response.json() as { results?: Outcome[]; error?: string };
      if (!response.ok || !body.results) { setResults(operations.current.map(account => ({ userId: account.userId, status: "failed", message: body.error || "Réponse invalide." }))); return; }
      setResults(body.results); setSelected([]); setRevision(value => value + 1);
    } catch { setResults(operations.current.map(account => ({ userId: account.userId, status: "pending", message: "Réponse non confirmée. Réessayez pour retrouver le résultat de cette même opération." }))); }
    finally { pending.current = false; setBusy(false); }
  }
  const blocked = previews.some(result => !result.preview || result.preview.protected || (action === "delete" && !result.preview.canDelete));
  const phrase = `SUPPRIMER ${previews.length} COMPTE${previews.length > 1 ? "S" : ""}`;
  return <section aria-label="Gestion des comptes" className="managed-accounts">
    <p>Suspension : accès bloqué. Archivage : accès bloqué et compte classé aux archives. Suppression : effacement irréversible autorisé uniquement sans dépendance à conserver.</p>
    <div className="admin-filter-bar"><label>Rechercher par nom ou e-mail<input value={query} maxLength={200} onChange={event => { setQuery(event.target.value); setSelected([]); }} /></label>
      <label>État du compte<select value={filter} onChange={event => { setFilter(event.target.value); setSelected([]); }}><option value="all">Tous les comptes</option><option value="test">Comptes marqués comme tests</option><option value="active">Actifs</option><option value="suspended">Suspendus</option><option value="archived">Archivés</option></select></label>
      <button className="table-action" onClick={() => setRevision(value => value + 1)}>Actualiser</button>
    </div>
    <p>Les comptes de test sont identifiés par un indicateur serveur, jamais par leur adresse. Jusqu’à 250 résultats récents ; affinez la recherche si nécessaire.</p>
    {feedback && <p role="alert">{feedback}</p>}
    <div className="account-bulk-actions"><strong>{selected.length} compte(s) sélectionné(s)</strong>{(["suspend", "archive", "delete"] as const).map(value => <button key={value} className="table-action" disabled={!selected.length || busy} onClick={() => void prepare(value, selected)}>{value === "delete" ? "Supprimer la sélection" : `${labels[value]} la sélection`}</button>)}</div>
    {loading ? <p role="status">Chargement des comptes…</p> : <div className="admin-table-wrap" role="region" aria-label="Comptes utilisateurs" tabIndex={0}><table className="admin-data-table"><thead><tr><th>Sélection</th><th>Utilisateur</th><th>Rôle et état</th><th>Réservations</th><th>Actions</th></tr></thead><tbody>{visible.map(account => <tr key={account.user_id}>
      <td><input type="checkbox" aria-label={`Sélectionner ${account.email}`} checked={selected.includes(account.user_id)} disabled={account.is_protected || busy || (!selected.includes(account.user_id) && selected.length >= 20)} onChange={event => setSelected(current => event.target.checked ? [...current, account.user_id] : current.filter(id => id !== account.user_id))} /></td>
      <td><strong>{account.display_name || "Sans nom"}</strong><small>{account.email}</small>{account.is_test && <small>Compte marqué test</small>}</td>
      <td>{account.account_role}<small>{account.deletion_pending ? "Suppression à vérifier" : account.is_archived ? "Archivé" : account.is_suspended ? "Suspendu" : "Actif"}</small></td><td>{account.bookings_count}</td>
      <td>{account.is_protected ? <span>Compte protégé · Équipe & accès</span> : <div className="account-row-actions">{([account.is_suspended ? "reactivate" : "suspend", "archive", "delete"] as Action[]).map(value => <button key={value} className="table-action" disabled={busy} onClick={() => void prepare(value, [account.user_id])}>{labels[value]}</button>)}</div>}</td>
    </tr>)}</tbody></table>{!visible.length && <p>Aucun compte correspondant.</p>}</div>}
    <dialog ref={dialog} className="account-action-dialog" aria-labelledby="account-action-title" onCancel={event => { if (busy) event.preventDefault(); else setAction(null); }}>
      <h2 id="account-action-title">{action ? labels[action] : "Gestion des comptes"}</h2><p>{action && consequences[action]}</p>
      {previews.map(result => <article key={result.userId}><h3>{result.preview?.name || "Compte sélectionné"}</h3><p>{result.preview?.email}</p>
        {result.preview ? <><p>{result.preview.protected ? "Compte protégé : opération interdite." : result.preview.canDelete ? "Aucune dépendance bloquante détectée." : "Suppression bloquée : données à conserver."}</p>
          <ul>{result.preview.dependencies.map((dependency, index) => <li key={`${dependency.table}-${index}`}>{dependencyLabels[dependency.table] || "Autres données liées à conserver"} : {dependency.count} élément(s) conservé(s)</li>)}</ul>
          {action === "delete" && <><p>Données effacées si autorisé : {result.preview.removedData.join(", ")}.</p><p>Toujours conservés : {result.preview.retainedData.join(", ")}.</p></>}</> : <p>{result.message}</p>}
      </article>)}
      <label>Justification obligatoire<textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
      {action === "delete" && <label>Pour confirmer, saisissez « {phrase} »<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} /></label>}
      {results.length > 0 && <div role="status">{results.map(result => <p key={result.userId}><strong>{previews.find(item => item.userId === result.userId)?.preview?.email || "Compte"}</strong> — {result.status === "completed" ? "Opération terminée et journalisée." : result.message || "Opération non réalisée."}</p>)}</div>}
      <div className="decision-actions"><button type="button" disabled={busy || blocked || reason.trim().length < 5 || (action === "delete" && confirmation !== phrase) || (results.length > 0 && results.every(result => result.status !== "pending"))} onClick={() => void execute()}>{busy ? "Traitement…" : results.some(result => result.status === "pending") ? "Vérifier le résultat" : "Confirmer l’opération"}</button><button type="button" disabled={busy} onClick={() => setAction(null)}>Fermer</button></div>
    </dialog>
  </section>;
}
