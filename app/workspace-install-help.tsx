"use client";
import { workspaceText } from "@/lib/domain/workspace-copy";
import { useApplicationLocale } from "./use-application-locale";
import "./workspace-install-help.css";

export function WorkspaceInstallHelp() {
  const locale = useApplicationLocale();
  const t = (text: string) => workspaceText(text, locale);
  return <details className="workspace-install-help">
    <summary>{t("Installer sur mon appareil")}</summary>
    <p>{t("Ouvrez cet espace dans le navigateur et connectez-vous avant de l’ajouter à l’écran d’accueil.")}</p>
    <p>{t("iPhone et iPad : Safari → Partager → Sur l’écran d’accueil → Ajouter. Si l’option est masquée, touchez Plus.")}</p>
    <p>{t("Téléphone et tablette Android : Chrome → menu ⋮ → Installer et créer un raccourci → Installer. Selon la version : Installer l’application ou Ajouter à l’écran d’accueil.")}</p>
    <p>Ordinateur : dans Chrome ou Edge, ouvrez le menu du navigateur puis « Installer Mata Beauty » ou « Applications → Installer ce site en tant qu’application ». Le libellé dépend du navigateur.</p>
    <p>{t("L’icône ouvrira directement cet espace. Un ancien raccourci qui ouvre le feed doit être recréé depuis cette page.")}</p>
  </details>;
}
