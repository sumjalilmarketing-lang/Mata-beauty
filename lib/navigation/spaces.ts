import type { AdminPermissionKey, AdminRoleKey } from "../domain/admin";

export type WorkspaceSpaceKey = "client" | "pro" | "salon" | "staff" | "onboarding" | "support" | "moderation" | "finance" | "operations" | "admin";

export type WorkspaceModule = {
  key: string;
  label: string;
  icon: string;
  group: string;
  description: string;
  permission?: AdminPermissionKey;
  staffPermission?: "bookings.read" | "bookings.manage" | "messages.read" | "messages.reply" | "services.read" | "clients.read" | readonly ("bookings.read" | "bookings.manage" | "messages.read" | "messages.reply" | "services.read" | "clients.read")[];
  primary?: boolean;
  resource?: "bookings" | "payments" | "notifications" | "messages" | "profiles" | "providers" | "businesses" | "collaborators" | "services" | "videos" | "reviews" | "reports" | "audit" | "wallets" | "payouts" | "reconciliation" | "financial-events" | "commissions" | "disputes" | "comments" | "sessions" | "promotions" | "campaigns" | "settings" | "deletion-requests";
};

export type WorkspaceSpace = {
  key: WorkspaceSpaceKey;
  label: string;
  prefix: string;
  eyebrow: string;
  allowedAdminRoles?: readonly AdminRoleKey[];
  modules: readonly WorkspaceModule[];
};

// The short builder keeps the large navigation matrix readable.
// eslint-disable-next-line @next/next/no-assign-module-variable
const module = (key: string, label: string, icon: string, group: string, description: string, options: Partial<Pick<WorkspaceModule, "permission" | "staffPermission" | "primary" | "resource">> = {}): WorkspaceModule => ({ key, label, icon, group, description, ...options });

const clientModules = [
  module("dashboard", "Dashboard", "⌂", "Essentiel", "Vos rendez-vous, messages, rappels et actions prioritaires.", { primary: true }),
  module("feed", "Feed", "▶", "Essentiel", "Les vidéos et inspirations publiées par les professionnels.", { primary: true, resource: "videos" }),
  module("discover", "Découvrir", "⌕", "Essentiel", "Recherchez des prestations, professionnels et salons.", { primary: true, resource: "providers" }),
  module("bookings", "Réservations", "▣", "Activité", "À venir, en attente, terminées et annulées.", { primary: true, resource: "bookings" }),
  module("messages", "Messages", "✉", "Activité", "Toutes vos conversations liées aux rendez-vous.", { primary: true, resource: "messages" }),
  module("payments", "Paiements", "¤", "Activité", "Historique, paiements à terminer et remboursements.", { resource: "payments" }),
  module("inspirations", "Inspirations", "✦", "Bibliothèque", "Vidéos enregistrées, collections, historique et créateurs suivis.", { resource: "videos" }),
  module("favorites", "Favoris", "♡", "Bibliothèque", "Professionnels et salons enregistrés.", { resource: "providers" }),
  module("reviews", "Avis", "★", "Compte", "Avis publiés et demandes d’avis après rendez-vous.", { resource: "reviews" }),
  module("notifications", "Notifications", "◌", "Compte", "Rappels, messages et informations de compte.", { resource: "notifications" }),
  module("support", "Support", "?", "Compte", "Vos demandes d’assistance et leur suivi.", { resource: "reports" }),
  module("profile", "Profil", "○", "Compte", "Identité, coordonnées, ville, bio et préférences beauté.", { resource: "profiles" }),
  module("settings", "Paramètres", "⚙", "Compte", "Sécurité, notifications, confidentialité et gestion des données."),
  module("application", "Ma candidature professionnelle", "◇", "Compte", "Préparez vos informations et documents, puis suivez leur vérification."),
] as const;

const proModules = [
  module("team", "Mon équipe", "◎", "Pilotage", "Collaborateurs, prestations autorisées, horaires et affectations.", { resource: "collaborators" }),
  module("dashboard", "Dashboard", "⌂", "Pilotage", "Rendez-vous du jour, demandes, messages, revenus et alertes.", { primary: true }),
  module("agenda", "Agenda", "□", "Pilotage", "Disponibilités, absences et calendrier professionnel.", { primary: true, resource: "bookings" }),
  module("bookings", "Réservations", "▣", "Pilotage", "Demandes, confirmations, rendez-vous en cours et historique.", { primary: true, resource: "bookings" }),
  module("messages", "Messages", "✉", "Relations", "Conversations avec vos clientes.", { primary: true, resource: "messages" }),
  module("services", "Prestations", "≡", "Offre", "Tarifs, durées, options, acompte et disponibilité.", { primary: true, resource: "services" }),
  module("videos", "Studio", "▶", "Contenu", "Publications, création, brouillons, programmation et statistiques.", { resource: "videos" }),
  module("portfolio", "Portfolio", "◇", "Contenu", "Réalisations visibles sur votre profil public."),
  module("clients", "Clientes", "◎", "Relations", "Clientes ayant une relation réelle avec votre activité.", { resource: "profiles" }),
  module("reviews", "Avis", "★", "Relations", "Avis reçus et réponses publiques.", { resource: "reviews" }),
  module("revenue", "Revenus", "¤", "Finance", "Revenus issus des rendez-vous et état des versements.", { resource: "payments" }),
  module("statistics", "Statistiques", "↗", "Pilotage", "Performance des prestations, vidéos et réservations."),
  module("notifications", "Notifications", "◌", "Compte", "Alertes de réservation, messages et conformité.", { resource: "notifications" }),
  module("support", "Support", "?", "Compte", "Assistance professionnelle.", { resource: "reports" }),
  module("public-profile", "Profil public", "○", "Compte", "Avatar, couverture, bio, horaires, localisation et politique d’annulation.", { resource: "providers" }),
  module("settings", "Paramètres", "⚙", "Compte", "Compte, sécurité, paiements, versements et équipe."),
] as const;

const salonModules = [
  module("dashboard", "Dashboard", "⌂", "Pilotage", "Activité globale du salon, alertes et actions rapides.", { primary: true }),
  module("agenda", "Agenda du salon", "□", "Pilotage", "Vues globale, membre et poste avec conflits et absences.", { primary: true, resource: "bookings" }),
  module("bookings", "Réservations", "▣", "Pilotage", "Réservations et affectations du salon.", { primary: true, resource: "bookings" }),
  module("team", "Équipe", "◎", "Organisation", "Invitations, rôles, horaires, spécialités et permissions.", { primary: true, resource: "collaborators" }),
  module("services", "Prestations", "≡", "Offre", "Catalogue commun et prestations par membre.", { primary: true, resource: "services" }),
  module("resources", "Postes et ressources", "⌑", "Organisation", "Fauteuils, cabines, équipements et capacité simultanée."),
  module("clients", "Clientes", "♙", "Relations", "Clientèle du salon et historique partagé.", { resource: "profiles" }),
  module("videos", "Studio", "▶", "Contenu", "Création, publications, brouillons, programmation et statistiques du salon.", { resource: "videos" }),
  module("portfolio", "Portfolio", "◇", "Contenu", "Galerie du salon."),
  module("messages", "Messages", "✉", "Relations", "Conversations du salon.", { resource: "messages" }),
  module("revenue", "Revenus", "¤", "Finance", "Revenus consolidés du salon.", { resource: "payments" }),
  module("payouts", "Versements", "↗", "Finance", "Lots et état des versements."),
  module("statistics", "Statistiques", "%", "Pilotage", "Occupation, activité et performance."),
  module("reviews", "Avis", "★", "Relations", "Avis du salon et réponses.", { resource: "reviews" }),
  module("support", "Support", "?", "Compte", "Assistance du salon.", { resource: "reports" }),
  module("profile", "Profil du salon", "○", "Compte", "Identité publique, localisation et informations pratiques.", { resource: "businesses" }),
  module("settings", "Paramètres", "⚙", "Compte", "Compte propriétaire, sécurité, paiements et permissions."),
] as const;

const staffModules = [
  module("dashboard", "Mon dashboard", "⌂", "Mon activité", "Vos rendez-vous, messages et priorités.", { primary: true, staffPermission: "bookings.read" }),
  module("agenda", "Mon agenda", "□", "Mon activité", "Vos horaires et disponibilités.", { primary: true, staffPermission: "bookings.read", resource: "bookings" }),
  module("bookings", "Mes rendez-vous", "▣", "Mon activité", "Rendez-vous qui vous sont affectés.", { primary: true, staffPermission: "bookings.read", resource: "bookings" }),
  module("clients", "Mes clientes", "◎", "Relations", "Clientes rencontrées dans le cadre du salon.", { primary: true, staffPermission: "clients.read", resource: "profiles" }),
  module("messages", "Mes messages", "✉", "Relations", "Conversations autorisées.", { primary: true, staffPermission: "messages.read", resource: "messages" }),
  module("services", "Mes prestations", "≡", "Mon activité", "Prestations que le salon vous autorise à réaliser.", { staffPermission: "services.read", resource: "services" }),
  module("statistics", "Mes statistiques", "↗", "Mon activité", "Votre activité personnelle sans données financières confidentielles.", { staffPermission: "bookings.read" }),
  module("profile", "Mon profil", "○", "Compte", "Identité professionnelle affichée par le salon.", { staffPermission: "bookings.read", resource: "profiles" }),
  module("settings", "Paramètres", "⚙", "Compte", "Notifications, sécurité et accès au salon.", { staffPermission: ["bookings.read", "bookings.manage", "messages.read", "messages.reply", "services.read", "clients.read"] }),
] as const;

const onboardingModules = [
  module("dashboard", "Dashboard", "⌂", "Traitement", "Demandes non assignées, urgences, délais et tâches.", { primary: true, permission: "documents.review" }),
  module("new", "Nouvelles demandes", "+", "Traitement", "Dossiers reçus et non assignés.", { primary: true, permission: "providers.read", resource: "providers" }),
  module("in-progress", "Dossiers en cours", "▣", "Traitement", "Dossiers affectés et en analyse.", { primary: true, permission: "documents.review", resource: "providers" }),
  module("requests", "Compléments demandés", "✉", "Traitement", "Pièces et informations complémentaires attendues.", { primary: true, permission: "documents.review", resource: "providers" }),
  module("approved", "Dossiers validés", "✓", "Historique", "Professionnels approuvés.", { permission: "providers.read", resource: "providers" }),
  module("rejected", "Dossiers refusés", "×", "Historique", "Décisions négatives et justifications.", { permission: "providers.read", resource: "providers" }),
  module("documents", "Documents", "◇", "Conformité", "Documents KYC soumis à revue.", { permission: "documents.review" }),
  module("history", "Historique", "≣", "Conformité", "Décisions et événements de conformité.", { permission: "documents.review", resource: "audit" }),
  module("notifications", "Notifications", "◌", "Compte", "Alertes liées aux dossiers.", { resource: "notifications" }),
] as const;

const supportModules = [
  module("dashboard", "Dashboard", "⌂", "Assistance", "Files, urgences, SLA et tâches de l’agent.", { primary: true, permission: "support.manage" }),
  module("tickets", "Tickets", "▣", "Assistance", "Tous les tickets autorisés.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("unassigned", "Non assignés", "+", "Files", "Tickets à prendre en charge.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("mine", "Mes tickets", "◎", "Files", "Tickets affectés à votre compte.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("priority", "Prioritaires", "!", "Files", "Tickets urgents ou en dépassement.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("escalations", "Escalades", "↗", "Assistance", "Tickets urgents en attente de traitement.", { permission: "support.manage", resource: "reports" }),
  module("users", "Utilisateurs", "♙", "Contexte", "Informations utiles sans gestion des rôles.", { permission: "users.read", resource: "profiles" }),
  module("bookings", "Réservations", "□", "Contexte", "Réservations liées aux demandes.", { permission: "bookings.read", resource: "bookings" }),
  module("notifications", "Notifications", "◌", "Compte", "Alertes et affectations.", { resource: "notifications" }),
] as const;

const moderationModules = [
  module("dashboard", "Dashboard", "⌂", "Modération", "Files, urgences, récidives et activité.", { primary: true, permission: "reports.manage" }),
  module("reports", "Signalements", "!", "Modération", "Signalements ouverts et contexte.", { primary: true, permission: "reports.manage", resource: "reports" }),
  module("videos", "Vidéos", "▶", "Contenus", "Vidéos signalées ou masquées.", { primary: true, permission: "reports.manage", resource: "videos" }),
  module("comments", "Commentaires", "✉", "Contenus", "Commentaires visibles ou masqués et décisions de modération.", { primary: true, permission: "reviews.moderate", resource: "comments" }),
  module("profiles", "Profils", "◎", "Contenus", "Profils signalés et antécédents.", { primary: true, permission: "providers.read", resource: "profiles" }),
  module("history", "Historique", "≣", "Décisions", "Décisions, justifications et audit.", { permission: "reports.manage", resource: "audit" }),
  module("notifications", "Notifications", "◌", "Compte", "Nouveaux signalements et appels.", { resource: "notifications" }),
] as const;

const financeModules = [
  module("dashboard", "Dashboard", "⌂", "Finance", "Volume, commissions, remboursements, versements et anomalies.", { primary: true, permission: "payments.read" }),
  module("transactions", "Transactions", "¤", "Paiements", "Transactions autorisées et leur statut.", { primary: true, permission: "payments.read", resource: "payments" }),
  module("pending", "Paiements en attente", "…", "Paiements", "Paiements non finalisés.", { primary: true, permission: "payments.read", resource: "payments" }),
  module("failed", "Paiements échoués", "×", "Paiements", "Échecs et motifs disponibles.", { primary: true, permission: "payments.read", resource: "payments" }),
  module("refunds", "Remboursements", "↺", "Paiements", "Demandes, décisions et audit.", { primary: true, permission: "payments.refund", resource: "payments" }),
  module("disputes", "Litiges", "⚖", "Contrôle", "Litiges réservés aux agents habilités au traitement des signalements.", { permission: "reports.manage", resource: "disputes" }),
  module("commissions", "Commissions", "%", "Contrôle", "Écritures de commission enregistrées.", { permission: "commissions.manage", resource: "commissions" }),
  module("wallets", "Wallets", "▣", "Trésorerie", "Soldes dérivés des écritures autorisées.", { permission: "payments.read", resource: "wallets" }),
  module("payouts", "Versements", "↗", "Trésorerie", "État des versements enregistrés. Aucun versement réel ne peut être déclenché en mode mock.", { permission: "payouts.manage", resource: "payouts" }),
  module("reconciliation", "Rapprochement", "≋", "Contrôle", "Résultats de rapprochement enregistrés ; aucun fournisseur réel n’est activé.", { permission: "payments.read", resource: "reconciliation" }),
  module("anomalies", "Anomalies", "!", "Contrôle", "Événements financiers de sécurité enregistrés.", { permission: "audit.read", resource: "financial-events" }),
  module("audit", "Audit financier", "≣", "Contrôle", "Journal non modifiable des actions financières.", { permission: "audit.read", resource: "audit" }),
] as const;

const operationsModules = [
  module("dashboard", "Dashboard", "⌂", "Opérations", "Vue opérationnelle sans secrets ni gestion des super administrateurs.", { primary: true }),
  module("users", "Utilisateurs", "◎", "Marketplace", "Comptes et statuts autorisés.", { primary: true, permission: "users.read", resource: "profiles" }),
  module("providers", "Professionnels", "✦", "Marketplace", "Professionnels et état opérationnel.", { primary: true, permission: "providers.read", resource: "providers" }),
  module("salons", "Salons", "⌑", "Marketplace", "Salons et instituts.", { primary: true, permission: "providers.read", resource: "businesses" }),
  module("bookings", "Réservations", "▣", "Marketplace", "Réservations de la plateforme.", { primary: true, permission: "bookings.read", resource: "bookings" }),
  module("categories", "Catégories", "◇", "Catalogue", "Catégories et prestations.", { permission: "categories.manage", resource: "services" }),
  module("promotions", "Promotions", "%", "Catalogue", "Promotions actives et programmées.", { permission: "content.manage", resource: "promotions" }),
  module("support", "Support", "?", "Équipes", "Suivi opérationnel du support.", { permission: "support.manage", resource: "reports" }),
  module("onboarding", "Onboarding", "✓", "Équipes", "Suivi des validations professionnelles.", { permission: "documents.review", resource: "providers" }),
  module("moderation", "Modération", "!", "Équipes", "Signalements et décisions.", { permission: "reports.manage", resource: "reports" }),
  module("content", "Contenus", "▶", "Communication", "Contenus et publications.", { permission: "content.manage", resource: "videos" }),
  module("notifications", "Notifications", "◌", "Communication", "Notifications ciblées.", { permission: "notifications.send", resource: "notifications" }),
  module("audit", "Audit", "≣", "Contrôle", "Actions opérationnelles journalisées.", { permission: "audit.read", resource: "audit" }),
  module("settings", "Paramètres opérationnels", "⚙", "Contrôle", "Lecture des réglages non sensibles.", { permission: "settings.read", resource: "settings" }),
] as const;

const superAdminModules = [
  module("dashboard", "Dashboard exécutif", "⌂", "Vue générale", "Indicateurs et santé de la plateforme.", { primary: true, permission: "users.read" }),
  module("alerts", "Centre d’alertes", "!", "Vue générale", "Alertes critiques et événements récents.", { primary: true, permission: "audit.read", resource: "audit" }),
  module("activity", "Activité récente", "↗", "Vue générale", "Activité globale autorisée.", { primary: true, permission: "audit.read", resource: "audit" }),
  module("health", "Santé plateforme", "⌾", "Vue générale", "État des services et erreurs récentes.", { primary: true, permission: "settings.read" }),
  module("clients", "Clients", "♙", "Utilisateurs et accès", "Comptes clients.", { primary: true, permission: "users.read", resource: "profiles" }),
  module("providers", "Professionnels", "✦", "Utilisateurs et accès", "Comptes professionnels.", { permission: "providers.read", resource: "providers" }),
  module("salons", "Salons", "⌑", "Utilisateurs et accès", "Salons et propriétaires.", { permission: "providers.read", resource: "businesses" }),
  module("staff", "Employés", "◎", "Utilisateurs et accès", "Collaborateurs de salon.", { permission: "users.read", resource: "collaborators" }),
  module("agents", "Agents internes", "♜", "Utilisateurs et accès", "Agents et rôles internes.", { permission: "roles.manage", resource: "profiles" }),
  module("roles", "Rôles", "⌘", "Utilisateurs et accès", "Rôles système et affectations.", { permission: "roles.manage" }),
  module("permissions", "Permissions", "⊕", "Utilisateurs et accès", "Matrice des permissions.", { permission: "roles.manage" }),
  module("sessions", "Sessions", "◌", "Utilisateurs et accès", "Sessions administratives enregistrées. La suspension et la révocation se gèrent dans Équipe & accès.", { permission: "roles.manage", resource: "sessions" }),
  module("suspended", "Comptes suspendus", "×", "Utilisateurs et accès", "Comptes suspendus et motifs.", { permission: "users.suspend", resource: "profiles" }),
  module("services", "Prestations", "≡", "Marketplace", "Catalogue des prestations.", { permission: "categories.manage", resource: "services" }),
  module("categories", "Catégories", "◇", "Marketplace", "Taxonomie de la marketplace.", { permission: "categories.manage", resource: "services" }),
  module("bookings", "Réservations", "▣", "Marketplace", "Réservations globales.", { permission: "bookings.read", resource: "bookings" }),
  module("promotions", "Promotions", "%", "Marketplace", "Promotions enregistrées et leur statut.", { permission: "content.manage", resource: "promotions" }),
  module("videos", "Contenu social", "▶", "Réseau social", "Publications, créateurs, tendances et modération.", { permission: "content.manage", resource: "videos" }),
  module("comments", "Commentaires", "✉", "Réseau social", "Commentaires et réponses.", { permission: "reviews.moderate", resource: "comments" }),
  module("social-reports", "Signalements", "!", "Réseau social", "Signalements sociaux.", { permission: "reports.manage", resource: "reports" }),
  module("tickets", "Tickets", "?", "Relation client", "Tickets et conversations.", { permission: "support.manage", resource: "reports" }),
  module("escalations", "Escalades", "↗", "Relation client", "Escalades inter-équipes.", { permission: "support.manage", resource: "reports" }),
  module("disputes", "Litiges", "⚖", "Relation client", "Litiges et réclamations.", { permission: "reports.manage", resource: "disputes" }),
  module("transactions", "Transactions", "¤", "Finance", "Transactions financières.", { permission: "payments.read", resource: "payments" }),
  module("commissions", "Commissions", "%", "Finance", "Règles de commission.", { permission: "commissions.manage" }),
  module("refunds", "Remboursements", "↺", "Finance", "Remboursements et audit.", { permission: "payments.refund", resource: "payments" }),
  module("payouts", "Versements", "↗", "Finance", "Versements professionnels.", { permission: "payouts.manage" }),
  module("financial-reports", "Rapports financiers", "¶", "Finance", "Rapports et anomalies.", { permission: "audit.read", resource: "audit" }),
  module("kyc", "Documents KYC", "◇", "Onboarding et conformité", "Documents et validations.", { permission: "documents.review" }),
  module("validations", "Validations", "✓", "Onboarding et conformité", "Décisions professionnelles.", { permission: "providers.verify", resource: "providers" }),
  module("notifications", "Notifications", "◌", "Communication", "Notifications système.", { permission: "notifications.send", resource: "notifications" }),
  module("campaigns", "Campagnes", "✦", "Communication", "Campagnes de notification enregistrées et état d’envoi.", { permission: "notifications.send", resource: "campaigns" }),
  module("platform-settings", "Paramètres généraux", "⚙", "Plateforme", "Réglages généraux sans affichage de secrets.", { permission: "settings.update" }),
  module("system-logs", "Journaux système", "≣", "Plateforme", "Événements techniques autorisés.", { permission: "audit.read", resource: "audit" }),
  module("audit", "Journaux d’audit", "≣", "Sécurité et audit", "Actions sensibles non modifiables.", { permission: "audit.read", resource: "audit" }),
  module("security", "Événements de sécurité", "⌾", "Sécurité et audit", "Accès privilégiés et tentatives refusées.", { permission: "roles.manage", resource: "audit" }),
  module("deletion-requests", "Demandes de suppression", "×", "Sécurité et audit", "Demandes reçues et statut de traitement. Aucune suppression automatique n’est effectuée depuis cette liste.", { permission: "users.delete", resource: "deletion-requests" }),
] as const;

export const workspaceSpaces: Record<WorkspaceSpaceKey, WorkspaceSpace> = {
  client: { key: "client", label: "Espace client", prefix: "/app", eyebrow: "Votre beauté", modules: clientModules },
  pro: { key: "pro", label: "Espace professionnel", prefix: "/pro", eyebrow: "Votre activité", modules: proModules },
  salon: { key: "salon", label: "Espace salon", prefix: "/salon", eyebrow: "Votre établissement", modules: salonModules },
  staff: { key: "staff", label: "Espace employé", prefix: "/staff", eyebrow: "Votre activité au salon", modules: staffModules },
  onboarding: { key: "onboarding", label: "Onboarding", prefix: "/onboarding", eyebrow: "Validation professionnelle", allowedAdminRoles: ["verification_agent", "super_admin"], modules: onboardingModules },
  support: { key: "support", label: "Support", prefix: "/support-agent", eyebrow: "Relation client", allowedAdminRoles: ["support", "admin", "super_admin"], modules: supportModules },
  moderation: { key: "moderation", label: "Modération", prefix: "/moderation", eyebrow: "Confiance et sécurité", allowedAdminRoles: ["moderator", "admin", "super_admin"], modules: moderationModules },
  finance: { key: "finance", label: "Finance", prefix: "/finance", eyebrow: "Contrôle financier", allowedAdminRoles: ["finance", "super_admin"], modules: financeModules },
  operations: { key: "operations", label: "Opérations", prefix: "/operations", eyebrow: "Administration opérationnelle", allowedAdminRoles: ["admin", "content_manager", "super_admin"], modules: operationsModules },
  admin: { key: "admin", label: "Super administration", prefix: "/admin", eyebrow: "Contrôle de la plateforme", allowedAdminRoles: ["super_admin"], modules: superAdminModules },
};

export function workspaceModule(space: WorkspaceSpaceKey, key: string) {
  const definition = workspaceSpaces[space];
  return definition.modules.find((item) => item.key === key) ?? definition.modules[0];
}

export function workspaceHref(space: WorkspaceSpaceKey, moduleKey = "dashboard") {
  const definition = workspaceSpaces[space];
  if (space === "client" && ["dashboard", "feed"].includes(moduleKey)) return "/";
  if (space === "client" && moduleKey === "discover") return "/discover";
  return moduleKey === "dashboard" ? definition.prefix : `${definition.prefix}/${moduleKey}`;
}

export const simpleNavigation = {
  client: ["feed", "discover", "bookings", "messages", "profile"],
  pro: ["dashboard", "videos", "services", "team", "agenda", "messages", "revenue", "public-profile"],
} as const;

export function navigationLabel(space: WorkspaceSpaceKey, item: WorkspaceModule) {
  if (space === "client") return ({ feed: "Inspiration", discover: "Explorer", bookings: "Rendez-vous", inspirations: "Inspirations enregistrées" } as Record<string, string>)[item.key] ?? item.label;
  if (space === "pro" && item.key === "public-profile") return "Profil";
  return item.label;
}

export function navigationParent(space: WorkspaceSpaceKey, key: string) {
  if (space === "client") return simpleNavigation.client.some((item) => item === key) ? key : "profile";
  if (space === "pro") {
    if (key === "bookings") return "agenda";
    if (key === "statistics") return "dashboard";
    return simpleNavigation.pro.some((item) => item === key) ? key : "public-profile";
  }
  return key;
}
