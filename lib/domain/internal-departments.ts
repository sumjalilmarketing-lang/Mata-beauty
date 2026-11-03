export const internalDepartments = [
  {key:"hr",label:"Ressources humaines",role:"hr_manager",roles:["hr_manager","hr_agent"],href:"/admin/hr",description:"Gestion des dossiers salariés, contrats, congés et préparation de la paie."},
  { key: "commercial", label: "Commerciaux", role: "commercial", roles: ["commercial", "commercial_manager", "commercial_agent", "verification_agent"], href: "/commercial", description: "Gérer ses prospects, contacts et relances dans le CRM. Consulter les dossiers professionnels et leurs justificatifs, demander des compléments, approuver ou refuser un dossier." },
  { key: "finance", label: "Finance et comptabilité", role: "finance", roles: ["finance", "finance_manager", "finance_agent"], href: "/finance", description: "Consulter les paiements, commissions, remboursements, wallets, versements et journaux financiers." },
  { key: "support", label: "Service client et réclamations", role: "support", roles: ["support", "support_manager", "support_agent"], href: "/support-agent", description: "Traiter les tickets, répondre aux clients, suivre les réclamations et consulter le contexte des réservations." },
] as const;
export type InternalDepartment = "all" | typeof internalDepartments[number]["key"];
export function departmentIncludesRole(department: InternalDepartment, roles: readonly string[]) {
  if (department === "all") return true;
  const definition = internalDepartments.find(item => item.key === department);
  return definition?.roles.some(role => roles.includes(role)) ?? false;
}
