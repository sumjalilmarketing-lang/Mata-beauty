"use client";
import { workspaceText } from "@/lib/domain/workspace-copy";
import { useApplicationLocale } from "./use-application-locale";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useRef, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { workspaceHref, workspaceSpaces, simpleNavigation, navigationLabel, navigationParent, type WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import "./workspace.css";
import "./workspace-more-menu.css";
import { ProductHelp } from "./product-help";
import { NotificationBadge } from "./notification-center";

type Props = {
  space: WorkspaceSpaceKey;
  moduleKey: string;
  availableSpaces: WorkspaceSpaceKey[];
  allowedModuleKeys: string[];
  userEmail: string;
  children: ReactNode;
};

export function WorkspaceShell({ space, moduleKey, availableSpaces, allowedModuleKeys, userEmail, children }: Props) {
  const locale = useApplicationLocale();
  const t = (text: string) => workspaceText(text, locale);
  const definition = workspaceSpaces[space];
  const modules = definition.modules.filter((item) => allowedModuleKeys.includes(item.key));
  const activeModule = modules.find((item) => item.key === moduleKey) ?? modules[0] ?? definition.modules[0];
  const pathname = usePathname();
  const router = useRouter();
  const simpleKeys = space === "client" || space === "pro" ? simpleNavigation[space] : null;
  const mainModules = simpleKeys ? simpleKeys.flatMap((key) => modules.filter((item) => item.key === key)) : modules;
  const groups = simpleKeys ? ["Navigation"] : [...new Set(modules.map((item) => item.group))];
  const mobileItems = simpleKeys ? space === "pro" ? mainModules.slice(0, 4) : mainModules : modules.filter((item) => item.primary).slice(0, 4);
  const moreItems = modules.filter(item => !mobileItems.some(primary => primary.key === item.key)).sort((a, b) => Number(b.key === "settings") - Number(a.key === "settings"));
  const moreDialog = useRef<HTMLDialogElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const parent = navigationParent(space, moduleKey);
  const secondary = simpleKeys ? modules.filter((item) => item.key !== "dashboard" && !mainModules.includes(item) && navigationParent(space, item.key) === parent) : [];
  const notificationsModule = modules.find((item) => item.key === "notifications");
  const visibleSpaces = ["client", "pro", "salon", "staff"].includes(space)
    ? availableSpaces.filter(key => ["client", "pro", "salon", "staff"].includes(key)) : availableSpaces;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("workspace-search") ?? "").trim();
    const target = workspaceHref(space, activeModule.key);
    router.push(query ? `${target}?q=${encodeURIComponent(query)}` : target);
  }

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return <div lang={locale} className={`workspace-layout workspace-${space}`}>
    <aside className="workspace-sidebar">
      <Link className="workspace-brand" href="/"><span>M</span><strong>Mata Beauty</strong></Link>
      <label className="workspace-space-picker">
        <span>{t("Espace actif")}</span>
        <select aria-label={t("Espace actif")} value={space} onChange={(event) => router.push(event.target.value === "feed" ? "/" : workspaceHref(event.target.value as WorkspaceSpaceKey))}>
          <option value="feed">{t("Fil d’inspiration")}</option>
          {visibleSpaces.map((key) => <option key={key} value={key}>{t(workspaceSpaces[key].label)}</option>)}
        </select>
      </label>
      <nav aria-label={`Navigation ${t(definition.label)}`}>
        {groups.map((group) => <div className="workspace-nav-group" key={group}>
          <p>{t(group)}</p>
          {mainModules.filter((item) => simpleKeys || item.group === group).map((item) => {
            const href = workspaceHref(space, item.key);
            const active = pathname === href || item.key === parent;
            return <Link aria-current={active ? "page" : undefined} className={active ? "active" : ""} href={href} key={item.key}>
              <span aria-hidden>{item.icon}</span>{t(navigationLabel(space, item))}
            </Link>;
          })}
        </div>)}
      </nav>
      {space === "commercial" && <nav aria-label="Autres espaces Mata Beauty"><Link href="/">Découvrir le feed</Link>{availableSpaces.includes("client") && <Link href="/app">Mon espace client</Link>}</nav>}
      <button className="workspace-signout" type="button" onClick={signOut}>{t("Se déconnecter")}</button>
    </aside>
    <main className="workspace-main">
      <header className="workspace-topbar">
        <div><p>{t(definition.eyebrow)}</p><h1>{t(activeModule.label)}</h1></div>
        <div className="workspace-tools"><form role="search" onSubmit={search}><label><span className="sr-only">{t("Rechercher dans ce module")}</span><input name="workspace-search" type="search" placeholder={t("Rechercher…")} /></label></form>{notificationsModule && <Link className="workspace-notifications" href={workspaceHref(space, notificationsModule.key)} aria-label={t("Notifications")}>◌<NotificationBadge /></Link>}<span className="workspace-account" title={userEmail}>{userEmail.slice(0, 1).toUpperCase()}</span></div>
      </header>
      <div className="workspace-breadcrumb"><Link href={definition.prefix}>{t(definition.label)}</Link><span>/</span><span>{t(activeModule.label)}</span></div>
      {secondary.length > 0 && !(space === "client" && moduleKey === "profile") && <details className="workspace-secondary" open={secondary.some((item) => item.key === moduleKey)}><summary>{space === "client" ? t("Mon compte") : t("Dans cette rubrique")}</summary><nav aria-label={t("Navigation secondaire")}>{secondary.map((item) => <Link key={item.key} href={workspaceHref(space, item.key)} aria-current={item.key === moduleKey ? "page" : undefined}>{t(navigationLabel(space, item))}</Link>)}</nav></details>}
      {children}
      <details className="workspace-panel"><summary>{t("Installer cet espace sur mon téléphone")}</summary><p>{t("Ouvrez cet espace dans le navigateur et connectez-vous avant de l’ajouter à l’écran d’accueil.")}</p><p>iPhone : Safari → Partager → Sur l’écran d’accueil.</p><p>Android : menu du navigateur → Installer l’application ou Ajouter à l’écran d’accueil.</p><p>{t("L’icône ouvrira directement cet espace. Un ancien raccourci qui ouvre le feed doit être recréé depuis cette page.")}</p></details>
      {(parent === "profile" || parent === "public-profile") && <ProductHelp professional={space === "pro"} />}
    </main>
    <nav className="workspace-mobile-nav" aria-label={t("Navigation mobile")}>
      {mobileItems.map((item) => <Link className={item.key === parent ? "active" : ""} href={workspaceHref(space, item.key)} key={item.key}><span>{item.icon}</span><small>{t(navigationLabel(space, item))}</small></Link>)}
      {space !== "client" && moreItems.length > 0 && <button type="button" className={moreOpen || !mobileItems.some(item => item.key === parent) ? "active" : ""} aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="workspace-more-menu" onClick={() => { moreDialog.current?.showModal(); setMoreOpen(true); }}><span aria-hidden>•••</span><small>{t("Plus")}</small></button>}
    </nav>
    <dialog ref={moreDialog} id="workspace-more-menu" className="workspace-more-menu" aria-labelledby="workspace-more-title" onClose={() => setMoreOpen(false)} onClick={event => { if (event.target === event.currentTarget) moreDialog.current?.close(); }}>
      <div className="workspace-more-content"><header><div><h2 id="workspace-more-title">{t("Plus")}</h2><p>{t(definition.label)}</p></div><button type="button" autoFocus aria-label={t("Fermer le menu")} onClick={() => moreDialog.current?.close()}>✕</button></header>
      <nav aria-label={t("Autres rubriques")}>{moreItems.map(item => <Link key={item.key} href={workspaceHref(space, item.key)} aria-current={item.key === moduleKey ? "page" : undefined} onClick={() => moreDialog.current?.close()}><span aria-hidden>{item.icon}</span><span>{t(navigationLabel(space, item))}</span><span aria-hidden>›</span></Link>)}</nav>
      {space === "commercial" && <nav aria-label="Changer d’espace"><Link href="/" onClick={() => moreDialog.current?.close()}>Découvrir le feed</Link>{availableSpaces.filter(key => key !== "commercial").map(key => <Link key={key} href={workspaceHref(key)} onClick={() => moreDialog.current?.close()}>{t(workspaceSpaces[key].label)}</Link>)}</nav>}
      <button className="workspace-more-signout" type="button" onClick={() => { moreDialog.current?.close(); void signOut(); }}>{t("Se déconnecter")}</button></div>
    </dialog>
  </div>;
}
