"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { WorkspaceModule, WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { workspaceHref, workspaceSpaces } from "@/lib/navigation/spaces";
import { configureSupabaseBrowserClient, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { CreatorStudio } from "./creator-studio";
import { ClientControlCenter } from "./client-control-center";
import { SalonControlCenter } from "./salon-control-center";
import { WorkspaceMessaging } from "./workspace-messaging";

type Row = Record<string, unknown>;
type ResourceDefinition = { table: string; select: string; title: (row: Row) => string; meta: (row: Row) => string };

const resources: Partial<Record<NonNullable<WorkspaceModule["resource"]>, ResourceDefinition>> = {
  bookings: { table: "bookings", select: "id,status,starts_at,total_amount", title: (row) => `Rendez-vous ${shortId(row.id)}`, meta: (row) => `${label(row.status)} · ${date(row.starts_at)}` },
  payments: { table: "payments", select: "id,payment_status,amount,gross_amount,platform_fee,professional_net_amount,created_at", title: (row) => `${money(row.gross_amount ?? row.amount)}`, meta: (row) => `${label(row.payment_status)} · Commission ${money(row.platform_fee)} · Net ${money(row.professional_net_amount)} · ${date(row.created_at)}` },
  notifications: { table: "notifications", select: "id,title,body,created_at,read_at", title: (row) => text(row.title, "Notification"), meta: (row) => `${text(row.body, "")} · ${date(row.created_at)}` },
  messages: { table: "messages", select: "id,body,created_at", title: (row) => text(row.body, "Message"), meta: (row) => date(row.created_at) },
  profiles: { table: "profiles", select: "id,first_name,last_name,role", title: (row) => `${text(row.first_name, "Compte")} ${text(row.last_name, "")}`.trim(), meta: (row) => label(row.role) },
  providers: { table: "provider_profiles", select: "profile_id,business_name,status,city", title: (row) => text(row.business_name, "Professionnel"), meta: (row) => `${label(row.status)} · ${text(row.city, "Ville non renseignée")}` },
  businesses: { table: "businesses", select: "id,name,status,city", title: (row) => text(row.name, "Salon"), meta: (row) => `${label(row.status)} · ${text(row.city, "Ville non renseignée")}` },
  collaborators: { table: "collaborators", select: "id,display_name,title,is_active", title: (row) => text(row.display_name, "Collaborateur"), meta: (row) => `${text(row.title, "Équipe")} · ${row.is_active ? "Actif" : "Inactif"}` },
  services: { table: "provider_services", select: "id,title,price_amount,is_active", title: (row) => text(row.title, "Prestation"), meta: (row) => `${money(row.price_amount)} · ${row.is_active ? "Active" : "Inactive"}` },
  videos: { table: "posts", select: "id,caption,status,created_at", title: (row) => text(row.caption, "Publication"), meta: (row) => `${label(row.status)} · ${date(row.created_at)}` },
  reviews: { table: "reviews", select: "id,rating,comment,is_visible,created_at", title: (row) => `${text(row.rating, "–")}/5 · ${text(row.comment, "Avis")}`, meta: (row) => `${row.is_visible ? "Visible" : "Masqué"} · ${date(row.created_at)}` },
  reports: { table: "reports", select: "id,reason,status,created_at", title: (row) => text(row.reason, "Demande"), meta: (row) => `${label(row.status)} · ${date(row.created_at)}` },
  audit: { table: "admin_audit_logs", select: "id,action,created_at", title: (row) => label(row.action), meta: (row) => date(row.created_at) },
};

export function WorkspaceModuleView({ space, module, allowedModuleKeys, supabaseUrl, supabaseAnonKey, userId, providerApproved }: { space: WorkspaceSpaceKey; module: WorkspaceModule; allowedModuleKeys: string[]; supabaseUrl: string; supabaseAnonKey: string; userId: string; providerApproved: boolean }) {
  configureSupabaseBrowserClient({ url: supabaseUrl, anonKey: supabaseAnonKey });
  const definition = module.resource ? resources[module.resource] : module.key === "dashboard" ? resources.bookings : undefined;
  const searchParams = useSearchParams();
  const query = (searchParams?.get("q") ?? "").trim().toLocaleLowerCase("fr");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "unavailable">(definition ? "loading" : "unavailable");
  useEffect(() => {
    if (!definition) return;
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client) { queueMicrotask(() => setState("unavailable")); return; }
    client.from(definition.table).select(definition.select).limit(100).then(({ data, error }) => {
      if (!active) return;
      if (error) { setState("unavailable"); return; }
      const next = (data ?? []) as unknown as Row[];
      setRows(next); setState(next.length ? "ready" : "empty");
    });
    return () => { active = false; };
  }, [definition, supabaseAnonKey, supabaseUrl]);
  const visibleRows = useMemo(() => query ? rows.filter((row) => JSON.stringify(row).toLocaleLowerCase("fr").includes(query)) : rows, [query, rows]);

  if (space === "salon" && module.key === "messages") return <WorkspaceMessaging userId={userId} />;
  if (space === "salon" && module.key !== "videos") return <SalonControlCenter module={module} userId={userId} />;
  if ((space === "pro" || space === "salon") && module.key === "videos") return <CreatorStudio userId={userId} providerApproved={providerApproved} />;
  if ((space === "client" || space === "pro") && module.key === "messages") return <WorkspaceMessaging userId={userId} />;
  if (space === "client" && module.key === "profile") return <ClientControlCenter userId={userId} />;
  const shortcuts = workspaceSpaces[space].modules.filter((item) => item.key !== module.key && allowedModuleKeys.includes(item.key)).slice(0, 4);
  return <section className="workspace-content">
    <div className="workspace-intro"><div><span>Module sécurisé</span><h2>{module.label}</h2><p>{module.description}</p>{module.key === "dashboard" && (space === "pro" || space === "salon") && <Link className="workspace-quick-publish" href={workspaceHref(space, "videos")}>＋ Publier une vidéo</Link>}</div><div className="workspace-status"><i />Données limitées par vos droits</div></div>
    <div className="workspace-metrics">
      <article><span>Éléments visibles</span><strong>{state === "ready" ? visibleRows.length : "—"}</strong><small>{query ? `Recherche « ${query} »` : "Périmètre autorisé"}</small></article>
      <article><span>État du module</span><strong>{state === "unavailable" ? "Limité" : "Actif"}</strong><small>Accès contrôlé côté serveur</small></article>
      <article><span>Espace</span><strong>{workspaceSpaces[space].label.replace("Espace ", "")}</strong><small>Session conservée</small></article>
    </div>
    <div className="workspace-grid">
      <article className="workspace-panel"><header><div><span>Vue actuelle</span><h3>{module.label}</h3></div></header>
        {state === "loading" && <div className="workspace-empty">Chargement des données autorisées…</div>}
        {state === "unavailable" && <div className="workspace-empty"><strong>Données momentanément indisponibles</strong><p>Réessayez dans quelques instants. Aucun changement n’a été appliqué.</p></div>}
        {state === "empty" && <div className="workspace-empty"><strong>Aucun élément à afficher</strong><p>Votre périmètre ne contient encore aucune donnée pour ce module.</p></div>}
        {state === "ready" && definition && visibleRows.length === 0 && <div className="workspace-empty"><strong>Aucun résultat</strong><p>Aucune donnée autorisée ne correspond à cette recherche.</p></div>}
        {state === "ready" && definition && visibleRows.length > 0 && <div className="workspace-list">{visibleRows.map((row, index) => <div key={String(row.id ?? index)}><span>{definition.title(row)}</span><small>{definition.meta(row)}</small></div>)}</div>}
      </article>
      <aside className="workspace-panel workspace-shortcuts"><header><div><span>Accès rapides</span><h3>Continuer</h3></div></header>{shortcuts.map((item) => <Link href={workspaceHref(space, item.key)} key={item.key}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.description}</small></div><b>›</b></Link>)}</aside>
    </div>
  </section>;
}

function text(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value : fallback; }
function label(value: unknown) { return text(value, "Non renseigné").replaceAll("_", " "); }
function shortId(value: unknown) { return text(value, "").slice(0, 8).toUpperCase(); }
function date(value: unknown) { if (typeof value !== "string") return "Date non renseignée"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Date non renseignée" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function money(value: unknown) { const amount = typeof value === "number" ? value : Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(amount) : "Montant non renseigné"; }
