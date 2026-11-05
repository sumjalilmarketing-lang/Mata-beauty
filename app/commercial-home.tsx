"use client";

import Link from "next/link";
import { workspaceHref, type WorkspaceModule } from "@/lib/navigation/spaces";
import { WorkspaceInstallHelp } from "./workspace-install-help";
import "./commercial-home.css";

const actions = [
  { key: "field", icon: "◷", title: "Badger et suivre mes visites", description: "Début de journée, arrivée chez un prospect, départ et fin de journée. La position est enregistrée lors du pointage." },
  { key: "crm", icon: "◎", title: "Mon CRM et mes prospects", description: "Ajouter un prospect, noter un échange, suivre le démarchage et préparer la prochaine action." },
  { key: "dossiers", icon: "✓", title: "Examiner et valider les dossiers", description: "Consulter les pièces, demander un complément et décider sur les dossiers professionnels qui vous sont attribués." },
  { key: "cases", icon: "▣", title: "Mes dossiers attribués", description: "Retrouver les consignes du responsable, les échéances et enregistrer vos comptes rendus." },
  { key: "appointments", icon: "□", title: "Mes rendez-vous commerciaux", description: "Organiser vos visites et vos rendez-vous avec les prospects." },
  { key: "follow-ups", icon: "↗", title: "Mes relances", description: "Retrouver les prospects à recontacter et les actions arrivées à échéance." },
  { key: "reports", icon: "≡", title: "Mes rapports", description: "Transmettre et consulter les comptes rendus de vos visites et de votre activité." },
  { key: "notifications", icon: "◌", title: "Mes notifications", description: "Retrouver vos affectations, messages et informations de compte." },
  { key: "teams", icon: "◇", title: "Mon équipe commerciale", description: "Inviter les agents, attribuer les dossiers et suivre les activités de votre équipe." },
] as const;

export function CommercialHome({ modules }: { modules: readonly WorkspaceModule[] }) {
  const allowed = new Set(modules.map(module => module.key));
  return <section className="commercial-home" aria-label="Mon espace de travail commercial">
    <header><span>MON ESPACE COMMERCIAL</span><h2>Ma journée de commercial</h2><p>Vos outils de prospection, vos dossiers et vos visites, réunis au même endroit.</p></header>
    <nav className="commercial-home-actions" aria-label="Mes outils commerciaux">{actions.filter(action => allowed.has(action.key)).map(action => <Link key={action.key} href={workspaceHref("commercial", action.key)}><span className="commercial-home-icon" aria-hidden="true">{action.icon}</span><div><h3>{action.title}</h3><p>{action.description}</p></div><span aria-hidden="true">→</span></Link>)}</nav>
    <aside className="commercial-home-install"><h3>Mon espace sur mon écran d’accueil</h3><p>Ajoutez Mata Commercial sur votre appareil pour ouvrir directement votre espace personnel. Vos accès suivent votre compte.</p><WorkspaceInstallHelp /></aside>
  </section>;
}
