"use client";
import { workspaceText } from "@/lib/domain/workspace-copy";
import { useApplicationLocale } from "./use-application-locale";
import "./workspace-install-help.css";

export function WorkspaceInstallHelp() {
  const locale = useApplicationLocale();
  const t = (text: string) => workspaceText(text, locale);
  return <details className="workspace-install-help"><summary>{t("Installer sur mon téléphone")}</summary><p>{t("Ouvrez cet espace dans le navigateur et connectez-vous avant de l’ajouter à l’écran d’accueil.")}</p><p>iPhone : Safari → Partager → Sur l’écran d’accueil.</p><p>Android : menu du navigateur → Installer l’application ou Ajouter à l’écran d’accueil.</p><p>{t("L’icône ouvrira directement cet espace. Un ancien raccourci qui ouvre le feed doit être recréé depuis cette page.")}</p></details>;
}
