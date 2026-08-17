"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export type SidebarNavigationItem = {
  key: string;
  label: string;
  icon: string;
  href?: string;
  active?: boolean;
  badge?: string | number;
  onSelect?: () => void;
};

export type SidebarNavigationGroup = {
  key: string;
  label: string;
  icon: string;
  direct?: boolean;
  items: SidebarNavigationItem[];
};

export function SidebarBadge({ children }: { children: ReactNode }) {
  return <span className="sidebar-badge">{children}</span>;
}

export function SidebarLink({ item, onNavigate }: { item: SidebarNavigationItem; onNavigate?: () => void }) {
  const content = <><i aria-hidden>{item.icon}</i><span>{item.label}</span>{item.badge !== undefined && <SidebarBadge>{item.badge}</SidebarBadge>}</>;
  if (!item.href) return <button type="button" className={item.active ? "active" : ""} aria-current={item.active ? "page" : undefined} onClick={() => { item.onSelect?.(); onNavigate?.(); }}>{content}</button>;
  return <Link className={item.active ? "active" : ""} aria-current={item.active ? "page" : undefined} href={item.href} onClick={onNavigate}>{content}</Link>;
}

export function SidebarGroupTrigger({ group, expanded, onToggle }: { group: SidebarNavigationGroup; expanded: boolean; onToggle: () => void }) {
  return <button type="button" className={`sidebar-group-trigger ${expanded ? "expanded" : ""}`} aria-expanded={expanded} aria-controls={`sidebar-group-${group.key}`} onClick={onToggle}><i aria-hidden>{group.icon}</i><span>{group.label}</span><b aria-hidden>›</b></button>;
}

export function SidebarGroupContent({ group, expanded, onNavigate }: { group: SidebarNavigationGroup; expanded: boolean; onNavigate?: () => void }) {
  return <div className="sidebar-group-content" id={`sidebar-group-${group.key}`} hidden={!expanded}>{group.items.map((item) => <SidebarLink item={item} key={item.key} onNavigate={onNavigate} />)}</div>;
}

export function SidebarGroup({ group, expanded, onToggle, onNavigate }: { group: SidebarNavigationGroup; expanded: boolean; onToggle: () => void; onNavigate?: () => void }) {
  if (group.direct) return <div className="sidebar-direct-link"><SidebarLink item={group.items[0]} onNavigate={onNavigate} /></div>;
  return <section className="sidebar-group"><SidebarGroupTrigger group={group} expanded={expanded} onToggle={onToggle} /><SidebarGroupContent group={group} expanded={expanded} onNavigate={onNavigate} /></section>;
}

export function SidebarNavigation({ groups, storageKey, singleOpen = false, onNavigate }: { groups: SidebarNavigationGroup[]; storageKey: string; singleOpen?: boolean; onNavigate?: () => void }) {
  const activeGroup = useMemo(() => groups.find((group) => group.items.some((item) => item.active) && !group.direct)?.key ?? "", [groups]);
  const collapsibleGroupKeys = groups.filter((group) => !group.direct).map((group) => group.key).join(",");
  const [openGroups, setOpenGroups] = useState<string[]>(activeGroup ? [activeGroup] : []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(storageKey)?.split(",").filter(Boolean) ?? [];
    const validKeys = new Set(collapsibleGroupKeys.split(",").filter(Boolean));
    const valid = saved.filter((key) => validKeys.has(key));
    const timer = window.setTimeout(() => setOpenGroups(activeGroup ? [activeGroup, ...valid.filter((key) => key !== activeGroup)] : valid), 0);
    return () => window.clearTimeout(timer);
  }, [activeGroup, collapsibleGroupKeys, storageKey]);

  function toggle(key: string) {
    setOpenGroups((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : singleOpen ? [key] : [...current, key];
      window.sessionStorage.setItem(storageKey, next.join(","));
      return next;
    });
  }

  return <>{groups.filter((group) => group.items.length).map((group) => <SidebarGroup group={group} expanded={group.direct || openGroups.includes(group.key)} onToggle={() => toggle(group.key)} onNavigate={onNavigate} key={group.key} />)}</>;
}
