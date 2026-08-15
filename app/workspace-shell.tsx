"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { workspaceHref, workspaceSpaces, type WorkspaceSpaceKey } from "@/lib/navigation/spaces";
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
  const modules = definition.modules.filter((item) => allowedModuleKeys.includes(item.key));
  const activeModule = modules.find((item) => item.key === moduleKey) ?? modules[0] ?? definition.modules[0];
  const pathname = usePathname();
  const router = useRouter();
  const groups = [...new Set(modules.map((item) => item.group))];
  const mobileItems = modules.filter((item) => item.primary).slice(0, 4);
  const notificationsModule = modules.find((item) => item.key === "notifications");

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
    <aside className="workspace-sidebar">
      <Link className="workspace-brand" href="/"><span>M</span><strong>Mata Beauty</strong></Link>
      <label className="workspace-space-picker">
        <span>Espace actif</span>
        <select value={space} onChange={(event) => router.push(workspaceHref(event.target.value as WorkspaceSpaceKey))}>
          {availableSpaces.map((key) => <option key={key} value={key}>{workspaceSpaces[key].label}</option>)}
        </select>
      </label>
      <nav aria-label={`Navigation ${definition.label}`}>
        {groups.map((group) => <div className="workspace-nav-group" key={group}>
          <p>{group}</p>
          {modules.filter((item) => item.group === group).map((item) => {
            const href = workspaceHref(space, item.key);
            const active = pathname === href || item.key === moduleKey;
            return <Link aria-current={active ? "page" : undefined} className={active ? "active" : ""} href={href} key={item.key}>
              <span aria-hidden>{item.icon}</span>{item.label}
            </Link>;
          })}
        </div>)}
      </nav>
      <button className="workspace-signout" type="button" onClick={signOut}>Se déconnecter</button>
    </aside>
    <main className="workspace-main">
      <header className="workspace-topbar">
        <div><p>{definition.eyebrow}</p><h1>{activeModule.label}</h1></div>
        <div className="workspace-tools"><form role="search" onSubmit={search}><label><span className="sr-only">Rechercher dans ce module</span><input name="workspace-search" type="search" placeholder="Rechercher…" /></label></form>{notificationsModule && <Link className="workspace-notifications" href={workspaceHref(space, notificationsModule.key)} aria-label="Notifications">◌</Link>}<span className="workspace-account" title={userEmail}>{userEmail.slice(0, 1).toUpperCase()}</span></div>
      </header>
      <div className="workspace-breadcrumb"><Link href={definition.prefix}>{definition.label}</Link><span>/</span><span>{activeModule.label}</span></div>
      {children}
    </main>
    <nav className="workspace-mobile-nav" aria-label="Navigation mobile">
      {mobileItems.map((item) => <Link className={item.key === moduleKey ? "active" : ""} href={workspaceHref(space, item.key)} key={item.key}><span>{item.icon}</span><small>{item.label}</small></Link>)}
      <Link className={!mobileItems.some((item) => item.key === moduleKey) ? "active" : ""} href={`${definition.prefix}/menu`}><span>•••</span><small>Plus</small></Link>
    </nav>
  </div>;
}
