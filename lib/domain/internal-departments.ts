export const internalDepartments = [
  { key: "commercial", label: "Commerciaux", role: "commercial", roles: ["commercial", "verification_agent"], href: "/commercial", description: "Gérer ses prospects, contacts et relances dans le CRM. Consulter les dossiers professionnels et leurs justificatifs, demander des compléments, approuver ou refuser un dossier." },
  { key: "finance", label: "Finance et comptabilité", role: "finance", roles: ["finance"], href: "/finance", description: "Consulter les paiements, commissions, remboursements, wallets, versements et journaux financiers." },
  { key: "support", label: "Service client et réclamations", role: "support", roles: ["support"], href: "/support-agent", description: "Traiter les tickets, répondre aux clients, suivre les réclamations et consulter le contexte des réservations." },
] as const;
export type InternalDepartment = "all" | typeof internalDepartments[number]["key"];
export function departmentIncludesRole(department: InternalDepartment, roles: readonly string[]) {
  if (department === "all") return true;
  const definition = internalDepartments.find(item => item.key === department);
  return definition?.roles.some(role => roles.includes(role)) ?? false;
}
