"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { workspaceHref, workspaceSpaces, type WorkspaceSpaceKey } from "@/lib/navigation/spaces";
import { SidebarNavigation, type SidebarNavigationGroup } from "./sidebar-navigation";
import "./workspace.css";

type Props = {
  space: WorkspaceSpaceKey;
  moduleKey: string;
  availableSpaces: WorkspaceSpaceKey[];
  allowedModuleKeys: string[];
  userEmail: string;
  children: ReactNode;
};

export function WorkspaceShell({ space, moduleKey, availableSpaces, allowedModuleKeys, userEmail, children }: Props) {
  const definition = workspaceSpaces[space];
  const navigationItems = definition.navigation.flatMap((group) => group.items).filter((item) => allowedModuleKeys.includes(item.key));
  const activeItem = navigationItems.find((item) => item.key === moduleKey) ?? navigationItems[0];
  const activeModule = activeItem ? { ...definition.modules.find((item) => item.key === (activeItem.targetKey ?? activeItem.key)) ?? definition.modules[0], ...activeItem } : definition.modules[0];
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const groups: SidebarNavigationGroup[] = definition.navigation.map((group) => ({
    ...group,
    items: [
      ...group.items.filter((item) => allowedModuleKeys.includes(item.key)).map((item) => ({ ...item, href: workspaceHref(space, item.key), active: pathname === workspaceHref(space, item.key) || item.key === moduleKey })),
      ...(group.key === "settings" ? [{ key: "signout", label: "Déconnexion", icon: "↪", onSelect: () => void signOut() }] : []),
    ],
  })).filter((group) => group.items.length);
  const mobileItems = navigationItems.filter((item) => item.primary).slice(0, 4);
  const notificationsModule = navigationItems.find((item) => item.key === "notifications");

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

  return <div className="workspace-layout">
    {mobileNavOpen && <button className="workspace-drawer-backdrop" aria-label="Fermer le menu" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`workspace-sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
      <button className="workspace-drawer-close" type="button" aria-label="Fermer la navigation" onClick={() => setMobileNavOpen(false)}>×</button>
      <Link className="workspace-brand" href="/"><span>M</span><strong>Mata Beauty</strong></Link>
      <label className="workspace-space-picker">
        <span>Espace actif</span>
        <select value={space} onChange={(event) => router.push(workspaceHref(event.target.value as WorkspaceSpaceKey))}>
          {availableSpaces.map((key) => <option key={key} value={key}>{workspaceSpaces[key].label}</option>)}
        </select>
      </label>
      <nav aria-label={`Navigation ${definition.label}`}><SidebarNavigation groups={groups} storageKey={`mata-sidebar-${space}`} singleOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} /></nav>
    </aside>
    <main className="workspace-main">
      <header className="workspace-topbar">
        <button className="workspace-menu-button" type="button" aria-label="Ouvrir le menu" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>☰</button><div><p>{definition.eyebrow}</p><h1>{activeModule.label}</h1></div>
        <div className="workspace-tools"><form role="search" onSubmit={search}><label><span className="sr-only">Rechercher dans ce module</span><input name="workspace-search" type="search" placeholder="Rechercher…" /></label></form>{notificationsModule && <Link className="workspace-notifications" href={workspaceHref(space, notificationsModule.key)} aria-label="Notifications">◌</Link>}<span className="workspace-account" title={userEmail}>{userEmail.slice(0, 1).toUpperCase()}</span></div>
      </header>
      <div className="workspace-breadcrumb"><Link href={definition.prefix}>{definition.label}</Link><span>/</span><span>{activeModule.label}</span></div>
      {children}
    </main>
    <nav className="workspace-mobile-nav" aria-label="Navigation mobile">
      {mobileItems.map((item) => <Link className={item.key === moduleKey ? "active" : ""} href={workspaceHref(space, item.key)} key={item.key}><span>{item.icon}</span><small>{item.label}</small></Link>)}
      <button className={!mobileItems.some((item) => item.key === moduleKey) ? "active" : ""} type="button" aria-label="Ouvrir toutes les rubriques" onClick={() => setMobileNavOpen(true)}><span>•••</span><small>Plus</small></button>
    </nav>
  </div>;
}
