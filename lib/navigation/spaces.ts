import type { AdminPermissionKey, AdminRoleKey } from "../domain/admin";

export type WorkspaceSpaceKey = "client" | "pro" | "salon" | "staff" | "onboarding" | "support" | "moderation" | "finance" | "operations" | "admin";

export type WorkspaceModule = {
  key: string;
  label: string;
  icon: string;
  group: string;
  description: string;
  permission?: AdminPermissionKey;
  primary?: boolean;
  targetKey?: string;
  resource?: "bookings" | "payments" | "notifications" | "messages" | "profiles" | "providers" | "businesses" | "collaborators" | "services" | "videos" | "reviews" | "reports" | "audit";
};

export type WorkspaceNavigationItem = { key: string; label: string; icon: string; targetKey?: string; primary?: boolean };
export type WorkspaceNavigationGroup = { key: string; label: string; icon: string; direct?: boolean; items: readonly WorkspaceNavigationItem[] };

export type WorkspaceSpace = {
  key: WorkspaceSpaceKey;
  label: string;
  prefix: string;
  eyebrow: string;
  allowedAdminRoles?: readonly AdminRoleKey[];
  modules: readonly WorkspaceModule[];
  navigation: readonly WorkspaceNavigationGroup[];
};

// The short builder keeps the large navigation matrix readable.
// eslint-disable-next-line @next/next/no-assign-module-variable
const module = (key: string, label: string, icon: string, group: string, description: string, options: Partial<Pick<WorkspaceModule, "permission" | "primary" | "resource">> = {}): WorkspaceModule => ({ key, label, icon, group, description, ...options });

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
] as const;

const proModules = [
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
  module("dashboard", "Mon dashboard", "⌂", "Mon activité", "Vos rendez-vous, messages et priorités.", { primary: true }),
  module("agenda", "Mon agenda", "□", "Mon activité", "Vos horaires et disponibilités.", { primary: true, resource: "bookings" }),
  module("bookings", "Mes rendez-vous", "▣", "Mon activité", "Rendez-vous qui vous sont affectés.", { primary: true, resource: "bookings" }),
  module("clients", "Mes clientes", "◎", "Relations", "Clientes rencontrées dans le cadre du salon.", { primary: true, resource: "profiles" }),
  module("messages", "Mes messages", "✉", "Relations", "Conversations autorisées.", { primary: true, resource: "messages" }),
  module("services", "Mes prestations", "≡", "Mon activité", "Prestations que le salon vous autorise à réaliser.", { resource: "services" }),
  module("statistics", "Mes statistiques", "↗", "Mon activité", "Votre activité personnelle sans données financières confidentielles."),
  module("profile", "Mon profil", "○", "Compte", "Identité professionnelle affichée par le salon.", { resource: "profiles" }),
  module("settings", "Paramètres", "⚙", "Compte", "Notifications et sécurité de votre compte."),
] as const;

const onboardingModules = [
  module("dashboard", "Dashboard", "⌂", "Traitement", "Demandes non assignées, urgences, délais et tâches.", { primary: true, permission: "documents.review" }),
  module("new", "Nouvelles demandes", "+", "Traitement", "Dossiers reçus et non assignés.", { primary: true, permission: "providers.read", resource: "providers" }),
  module("in-progress", "Dossiers en cours", "▣", "Traitement", "Dossiers affectés et en analyse.", { primary: true, permission: "documents.review", resource: "providers" }),
  module("requests", "Compléments demandés", "✉", "Traitement", "Pièces et informations complémentaires attendues.", { primary: true, permission: "documents.review", resource: "providers" }),
  module("approved", "Dossiers validés", "✓", "Historique", "Professionnels approuvés.", { permission: "providers.read", resource: "providers" }),
  module("rejected", "Dossiers refusés", "×", "Historique", "Décisions négatives et justifications.", { permission: "providers.read", resource: "providers" }),
  module("documents", "Documents", "◇", "Conformité", "Documents KYC soumis à revue.", { permission: "documents.review" }),
  module("assignments", "Affectations", "◎", "Traitement", "Répartition des dossiers entre agents.", { permission: "documents.review" }),
  module("history", "Historique", "≣", "Conformité", "Décisions et événements de conformité.", { permission: "documents.review", resource: "audit" }),
  module("notifications", "Notifications", "◌", "Compte", "Alertes liées aux dossiers.", { resource: "notifications" }),
  module("settings", "Paramètres", "⚙", "Compte", "Préférences et sécurité de l’agent.", { permission: "settings.read" }),
] as const;

const supportModules = [
  module("dashboard", "Dashboard", "⌂", "Assistance", "Files, urgences, SLA et tâches de l’agent.", { primary: true, permission: "support.manage" }),
  module("tickets", "Tickets", "▣", "Assistance", "Tous les tickets autorisés.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("unassigned", "Non assignés", "+", "Files", "Tickets à prendre en charge.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("mine", "Mes tickets", "◎", "Files", "Tickets affectés à votre compte.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("priority", "Prioritaires", "!", "Files", "Tickets urgents ou en dépassement.", { primary: true, permission: "support.manage", resource: "reports" }),
  module("escalations", "Escalades", "↗", "Assistance", "Dossiers transmis à une autre équipe.", { permission: "reports.manage", resource: "reports" }),
  module("users", "Utilisateurs", "♙", "Contexte", "Informations utiles sans gestion des rôles.", { permission: "users.read", resource: "profiles" }),
  module("bookings", "Réservations", "□", "Contexte", "Réservations liées aux demandes.", { permission: "bookings.read", resource: "bookings" }),
  module("knowledge", "Base de connaissances", "¶", "Assistance", "Procédures et réponses validées."),
  module("reports", "Rapports", "%", "Pilotage", "Volume, délais et satisfaction."),
  module("notifications", "Notifications", "◌", "Compte", "Alertes et affectations.", { resource: "notifications" }),
  module("settings", "Paramètres", "⚙", "Compte", "Préférences et sécurité de l’agent."),
] as const;

const moderationModules = [
  module("dashboard", "Dashboard", "⌂", "Modération", "Files, urgences, récidives et activité.", { primary: true, permission: "reports.manage" }),
  module("reports", "Signalements", "!", "Modération", "Signalements ouverts et contexte.", { primary: true, permission: "reports.manage", resource: "reports" }),
  module("videos", "Vidéos", "▶", "Contenus", "Vidéos signalées ou masquées.", { primary: true, permission: "reports.manage", resource: "videos" }),
  module("comments", "Commentaires", "✉", "Contenus", "Commentaires signalés.", { primary: true, permission: "reviews.moderate" }),
  module("profiles", "Profils", "◎", "Contenus", "Profils signalés et antécédents.", { primary: true, permission: "providers.read", resource: "profiles" }),
  module("messages", "Messages signalés", "◇", "Contenus", "Messages remontés à la modération.", { permission: "reports.manage", resource: "messages" }),
  module("appeals", "Appels", "↺", "Décisions", "Contestations des décisions."),
  module("sanctions", "Sanctions", "×", "Décisions", "Mesures appliquées et durée."),
  module("history", "Historique", "≣", "Décisions", "Décisions, justifications et audit.", { permission: "reports.manage", resource: "audit" }),
  module("rules", "Règles de modération", "¶", "Référentiel", "Règles et procédures applicables."),
  module("notifications", "Notifications", "◌", "Compte", "Nouveaux signalements et appels.", { resource: "notifications" }),
  module("settings", "Paramètres", "⚙", "Compte", "Préférences et sécurité."),
] as const;

const financeModules = [
  module("dashboard", "Dashboard", "⌂", "Finance", "Volume, commissions, remboursements, versements et anomalies.", { primary: true, permission: "payments.read" }),
  module("transactions", "Transactions", "¤", "Paiements", "Transactions autorisées et leur statut.", { primary: true, permission: "payments.read", resource: "payments" }),
  module("pending", "Paiements en attente", "…", "Paiements", "Paiements non finalisés.", { primary: true, permission: "payments.read", resource: "payments" }),
  module("failed", "Paiements échoués", "×", "Paiements", "Échecs et motifs disponibles.", { primary: true, permission: "payments.read", resource: "payments" }),
  module("refunds", "Remboursements", "↺", "Paiements", "Demandes, décisions et audit.", { primary: true, permission: "payments.refund", resource: "payments" }),
  module("disputes", "Litiges", "⚖", "Contrôle", "Litiges financiers et pièces liées.", { permission: "payments.read", resource: "reports" }),
  module("commissions", "Commissions", "%", "Contrôle", "Règles et écritures de commission.", { permission: "commissions.manage", resource: "payments" }),
  module("wallets", "Wallets", "▣", "Trésorerie", "Soldes dérivés des écritures autorisées.", { permission: "payments.read" }),
  module("payouts", "Versements", "↗", "Trésorerie", "Lots et état des versements.", { permission: "payouts.manage" }),
  module("reconciliation", "Rapprochement", "≋", "Contrôle", "Écarts entre paiements et écritures."),
  module("reports", "Rapports", "¶", "Pilotage", "Rapports financiers exportables.", { permission: "audit.read", resource: "audit" }),
  module("anomalies", "Anomalies", "!", "Contrôle", "Écarts et événements à examiner."),
  module("audit", "Audit financier", "≣", "Contrôle", "Journal non modifiable des actions financières.", { permission: "audit.read", resource: "audit" }),
  module("settings", "Paramètres autorisés", "⚙", "Compte", "Préférences sans secrets ni configuration critique.", { permission: "settings.read" }),
] as const;

const operationsModules = [
  module("dashboard", "Dashboard", "⌂", "Opérations", "Vue opérationnelle sans secrets ni gestion des super administrateurs.", { primary: true }),
  module("users", "Utilisateurs", "◎", "Marketplace", "Comptes et statuts autorisés.", { primary: true, permission: "users.read", resource: "profiles" }),
  module("providers", "Professionnels", "✦", "Marketplace", "Professionnels et état opérationnel.", { primary: true, permission: "providers.read", resource: "providers" }),
  module("salons", "Salons", "⌑", "Marketplace", "Salons et instituts.", { primary: true, permission: "providers.read", resource: "businesses" }),
  module("bookings", "Réservations", "▣", "Marketplace", "Réservations de la plateforme.", { primary: true, permission: "bookings.read", resource: "bookings" }),
  module("categories", "Catégories", "◇", "Catalogue", "Catégories et prestations.", { permission: "categories.manage", resource: "services" }),
  module("areas", "Villes et zones", "⌖", "Catalogue", "Zones desservies et référentiel géographique."),
  module("promotions", "Promotions", "%", "Catalogue", "Promotions actives et programmées.", { permission: "content.manage" }),
  module("support", "Support", "?", "Équipes", "Suivi opérationnel du support.", { permission: "support.manage", resource: "reports" }),
  module("onboarding", "Onboarding", "✓", "Équipes", "Suivi des validations professionnelles.", { permission: "documents.review", resource: "providers" }),
  module("moderation", "Modération", "!", "Équipes", "Signalements et décisions.", { permission: "reports.manage", resource: "reports" }),
  module("content", "Contenus", "▶", "Communication", "Contenus et publications.", { permission: "content.manage", resource: "videos" }),
  module("notifications", "Notifications", "◌", "Communication", "Notifications ciblées.", { permission: "notifications.send", resource: "notifications" }),
  module("reports", "Rapports", "¶", "Pilotage", "Rapports opérationnels."),
  module("audit", "Audit", "≣", "Contrôle", "Actions opérationnelles journalisées.", { permission: "audit.read", resource: "audit" }),
  module("settings", "Paramètres opérationnels", "⚙", "Contrôle", "Réglages non sensibles.", { permission: "settings.read" }),
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
  module("sessions", "Sessions", "◌", "Utilisateurs et accès", "Sessions administratives actives.", { permission: "roles.manage" }),
  module("suspended", "Comptes suspendus", "×", "Utilisateurs et accès", "Comptes suspendus et motifs.", { permission: "users.suspend", resource: "profiles" }),
  module("services", "Prestations", "≡", "Marketplace", "Catalogue des prestations.", { permission: "categories.manage", resource: "services" }),
  module("categories", "Catégories", "◇", "Marketplace", "Taxonomie de la marketplace.", { permission: "categories.manage", resource: "services" }),
  module("bookings", "Réservations", "▣", "Marketplace", "Réservations globales.", { permission: "bookings.read", resource: "bookings" }),
  module("availability", "Disponibilités", "□", "Marketplace", "Disponibilités et exceptions."),
  module("areas", "Villes et zones", "⌖", "Marketplace", "Référentiel géographique."),
  module("promotions", "Promotions", "%", "Marketplace", "Promotions et campagnes.", { permission: "content.manage" }),
  module("videos", "Contenu social", "▶", "Réseau social", "Publications, créateurs, tendances et modération.", { permission: "content.manage", resource: "videos" }),
  module("comments", "Commentaires", "✉", "Réseau social", "Commentaires et réponses.", { permission: "reviews.moderate" }),
  module("social-reports", "Signalements", "!", "Réseau social", "Signalements sociaux.", { permission: "reports.manage", resource: "reports" }),
  module("tickets", "Tickets", "?", "Relation client", "Tickets et conversations.", { permission: "support.manage", resource: "reports" }),
  module("escalations", "Escalades", "↗", "Relation client", "Escalades inter-équipes.", { permission: "support.manage", resource: "reports" }),
  module("disputes", "Litiges", "⚖", "Relation client", "Litiges et réclamations.", { permission: "reports.manage", resource: "reports" }),
  module("transactions", "Transactions", "¤", "Finance", "Transactions financières.", { permission: "payments.read", resource: "payments" }),
  module("commissions", "Commissions", "%", "Finance", "Règles de commission.", { permission: "commissions.manage" }),
  module("refunds", "Remboursements", "↺", "Finance", "Remboursements et audit.", { permission: "payments.refund", resource: "payments" }),
  module("payouts", "Versements", "↗", "Finance", "Versements professionnels.", { permission: "payouts.manage" }),
  module("financial-reports", "Rapports financiers", "¶", "Finance", "Rapports et anomalies.", { permission: "audit.read", resource: "audit" }),
  module("kyc", "Documents KYC", "◇", "Onboarding et conformité", "Documents et validations.", { permission: "documents.review" }),
  module("validations", "Validations", "✓", "Onboarding et conformité", "Décisions professionnelles.", { permission: "providers.verify", resource: "providers" }),
  module("notifications", "Notifications", "◌", "Communication", "Notifications système.", { permission: "notifications.send", resource: "notifications" }),
  module("campaigns", "Campagnes", "✦", "Communication", "Campagnes et modèles.", { permission: "content.manage" }),
  module("platform-settings", "Paramètres généraux", "⚙", "Plateforme", "Réglages généraux sans affichage de secrets.", { permission: "settings.update" }),
  module("integrations", "Intégrations", "⌘", "Plateforme", "Intégrations et webhooks masqués.", { permission: "settings.update" }),
  module("system-logs", "Journaux système", "≣", "Plateforme", "Événements techniques autorisés.", { permission: "audit.read", resource: "audit" }),
  module("audit", "Journaux d’audit", "≣", "Sécurité et audit", "Actions sensibles non modifiables.", { permission: "audit.read", resource: "audit" }),
  module("security", "Événements de sécurité", "⌾", "Sécurité et audit", "Accès privilégiés et tentatives refusées.", { permission: "roles.manage", resource: "audit" }),
  module("deletion-requests", "Demandes de suppression", "×", "Sécurité et audit", "Demandes RGPD et suivi.", { permission: "users.delete" }),
] as const;

const n = (key: string, label: string, targetKey = key, icon = "·", primary = false): WorkspaceNavigationItem => ({ key, label, targetKey, icon, primary });
const g = (key: string, label: string, icon: string, items: readonly WorkspaceNavigationItem[], direct = false): WorkspaceNavigationGroup => ({ key, label, icon, items, direct });
const dashboard = (label = "Dashboard") => g("dashboard", label, "⌂", [n("dashboard", label, "dashboard", "⌂", true)], true);

const clientNavigation = [dashboard(),
  g("discover", "Découvrir", "⌕", [n("feed", "Pour toi", "feed", "▶", true), n("following", "Abonnements", "feed"), n("trending", "Tendances", "feed"), n("discover", "Catégories", "discover", "◇"), n("nearby", "Autour de moi", "discover", "⌖")]),
  g("appointments", "Mes rendez-vous", "▣", [n("bookings", "À venir", "bookings", "▣", true), n("bookings-pending", "En attente", "bookings"), n("bookings-completed", "Terminés", "bookings"), n("bookings-cancelled", "Annulés", "bookings"), n("booking-history", "Historique", "bookings")]),
  g("inspirations", "Mes inspirations", "✦", [n("inspirations", "Vidéos enregistrées", "inspirations"), n("liked-videos", "Vidéos aimées", "inspirations"), n("collections", "Collections", "inspirations"), n("favorites", "Prestations favorites", "favorites"), n("favorite-salons", "Salons favoris", "favorites"), n("followed-professionals", "Professionnels suivis", "favorites")]),
  g("communication", "Communication", "✉", [n("messages", "Messages", "messages", "✉", true), n("notifications", "Notifications", "notifications", "◌"), n("reviews", "Avis", "reviews", "★")]),
  g("payments", "Paiements", "¤", [n("payments", "Historique", "payments"), n("pending-payments", "Paiements en attente", "payments"), n("receipts", "Reçus", "payments"), n("refunds", "Remboursements", "payments")]),
  g("support", "Support", "?", [n("new-ticket", "Nouveau ticket", "support"), n("support", "Mes demandes", "support"), n("claims", "Réclamations", "support"), n("help", "Aide", "support")]),
  g("profile", "Mon profil", "○", [n("profile", "Informations personnelles", "profile"), n("profile-photo", "Photo", "profile"), n("beauty-preferences", "Préférences beauté", "profile"), n("profile-location", "Localisation", "profile"), n("privacy", "Confidentialité", "profile"), n("become-pro", "Devenir professionnel", "profile")]),
  g("settings", "Paramètres", "⚙", [n("settings", "Compte", "settings"), n("security", "Sécurité", "settings"), n("google", "Connexion Google", "settings"), n("notification-settings", "Notifications", "settings"), n("language", "Langue", "settings"), n("appearance", "Apparence", "settings"), n("personal-data", "Données personnelles", "settings")]),
] as const;

const proNavigation = [dashboard(),
  g("activity", "Activité", "□", [n("agenda", "Agenda", "agenda", "□", true), n("bookings", "Réservations", "bookings", "▣", true), n("availability", "Disponibilités", "agenda"), n("planning", "Planning", "agenda")]),
  g("relations", "Relations", "◎", [n("messages", "Messages", "messages", "✉", true), n("clients", "Clients", "clients"), n("reviews", "Avis", "reviews", "★"), n("followers", "Abonnés", "clients"), n("notifications", "Notifications clients", "notifications")]),
  g("offer", "Offres & tarifs", "≡", [n("services", "Mes prestations", "services", "≡", true), n("create-service", "Créer une prestation", "services", "+", true), n("pricing", "Tarifs", "services"), n("options", "Options & suppléments", "services"), n("promotions", "Promotions", "services"), n("packages", "Forfaits", "services"), n("home-services", "Prestations à domicile", "services"), n("published-offers", "Offres publiées", "services"), n("service-drafts", "Brouillons", "services"), n("archived-services", "Archivées", "services")]),
  g("content", "Contenu", "▶", [n("videos", "Studio", "videos", "▶"), n("publish", "Publier", "videos"), n("my-videos", "Mes vidéos", "videos"), n("drafts", "Brouillons", "videos"), n("scheduled", "Publications programmées", "videos"), n("portfolio", "Portfolio", "portfolio"), n("photos", "Photos", "videos"), n("statistics", "Statistiques contenu", "videos")]),
  g("finance", "Finance", "¤", [n("revenue", "Revenus", "revenue"), n("payments", "Paiements", "revenue"), n("wallet", "Wallet", "revenue"), n("payouts", "Versements", "revenue"), n("commissions", "Commissions", "revenue"), n("financial-history", "Historique", "revenue")]),
  g("support", "Support", "?", [n("new-ticket", "Nouveau ticket", "support"), n("support", "Mes tickets", "support"), n("help", "Aide", "support"), n("disputes", "Litiges", "support")]),
  g("professional-profile", "Profil professionnel", "○", [n("public-profile", "Profil public", "public-profile"), n("professional-info", "Informations professionnelles", "public-profile"), n("salon-link", "Salon", "public-profile"), n("location", "Localisation", "public-profile"), n("hours", "Horaires", "public-profile"), n("documents", "Documents", "public-profile"), n("verification", "Vérification", "public-profile"), n("public-preview", "Aperçu public", "public-profile")]),
  g("settings", "Paramètres", "⚙", [n("settings", "Compte", "settings"), n("security", "Sécurité", "settings"), n("notification-settings", "Notifications", "settings"), n("google", "Connexion Google", "settings"), n("privacy", "Confidentialité", "settings"), n("payment-settings", "Paiements", "settings")]),
] as const;

const salonNavigation = [dashboard(),
  g("activity", "Activité", "□", [n("agenda", "Agenda du salon", "agenda", "□", true), n("bookings", "Réservations", "bookings", "▣", true), n("availability", "Disponibilités", "agenda"), n("resources", "Ressources", "agenda")]),
  g("team", "Équipe", "◎", [n("team", "Membres", "team", "◎", true), n("invitations", "Invitations", "team"), n("team-hours", "Horaires", "team"), n("permissions", "Permissions", "team"), n("team-performance", "Performances", "statistics")]),
  g("offer", "Offres & tarifs", "≡", [n("services", "Prestations", "services", "≡", true), n("create-service", "Créer une prestation", "services", "+", true), n("pricing", "Tarifs", "services"), n("options", "Options & suppléments", "services"), n("promotions", "Promotions", "services"), n("packages", "Forfaits", "services"), n("home-services", "Prestations à domicile", "services"), n("published-offers", "Offres publiées", "services"), n("service-drafts", "Brouillons", "services"), n("archived-services", "Archivées", "services"), n("service-staff", "Membres affectés", "services"), n("service-availability", "Disponibilités", "agenda")]),
  g("content", "Contenu", "▶", [n("videos", "Studio", "videos", "▶"), n("my-videos", "Vidéos", "videos"), n("portfolio", "Portfolio", "portfolio"), n("photos", "Photos", "portfolio"), n("statistics", "Statistiques", "statistics")]),
  g("relations", "Relations", "♙", [n("clients", "Clients", "clients"), n("messages", "Messages", "messages"), n("reviews", "Avis", "reviews"), n("followers", "Abonnés", "clients")]),
  g("finance", "Finance", "¤", [n("revenue", "Revenus", "revenue"), n("payments", "Paiements", "revenue"), n("wallet", "Wallet", "revenue"), n("payouts", "Versements", "payouts"), n("commissions", "Commissions", "revenue")]),
  g("profile", "Profil du salon", "○", [n("profile", "Informations", "profile"), n("address", "Adresse", "profile"), n("hours", "Horaires", "agenda"), n("public-team", "Équipe publique", "team"), n("gallery", "Galerie", "portfolio"), n("public-preview", "Aperçu public", "profile")]),
  g("support", "Support", "?", [n("support", "Assistance", "support")]), g("settings", "Paramètres", "⚙", [n("settings", "Compte et sécurité", "settings")]),
] as const;

const staffNavigation = [dashboard(), g("activity", "Activité", "□", [n("agenda", "Mon agenda", "agenda", "□", true), n("bookings", "Mes rendez-vous", "bookings", "▣", true), n("services", "Mes prestations", "services")]), g("relations", "Relations", "◎", [n("clients", "Mes clientes", "clients"), n("messages", "Mes messages", "messages", "✉", true)]), g("performance", "Performance", "↗", [n("statistics", "Mes statistiques", "statistics")]), g("profile", "Profil", "○", [n("profile", "Mon profil", "profile")]), g("settings", "Paramètres", "⚙", [n("settings", "Compte et notifications", "settings")])] as const;

const onboardingNavigation = [dashboard(), g("cases", "Dossiers", "▣", [n("new", "Nouveaux", "new", "+", true), n("in-progress", "En cours", "in-progress", "▣", true), n("requests", "Compléments demandés", "requests", "✉", true), n("approved", "Validés", "approved"), n("rejected", "Refusés", "rejected")]), g("documents", "Documents", "◇", [n("documents", "Identité", "documents"), n("business-documents", "Entreprise", "documents"), n("contact-documents", "Coordonnées", "documents"), n("expiring-documents", "Documents expirants", "documents")]), g("assignments", "Affectations", "◎", [n("assignments", "Mes dossiers", "assignments"), n("unassigned", "Dossiers non assignés", "new")]), g("history", "Historique", "≣", [n("history", "Décisions", "history"), n("audit", "Audit", "history")]), g("notifications", "Notifications", "◌", [n("notifications", "Notifications", "notifications")]), g("profile", "Profil", "○", [n("profile", "Profil agent", "settings")]), g("settings", "Paramètres", "⚙", [n("settings", "Compte et sécurité", "settings")])] as const;

const supportNavigation = [dashboard(), g("tickets", "Tickets", "▣", [n("tickets", "Nouveaux", "tickets", "▣", true), n("mine", "Mes tickets", "mine", "◎", true), n("unassigned", "Non assignés", "unassigned", "+", true), n("priority", "Prioritaires", "priority", "!", true), n("pending", "En attente", "tickets"), n("resolved", "Résolus", "tickets")]), g("users", "Utilisateurs", "♙", [n("users", "Clients", "users"), n("professionals", "Professionnels", "users"), n("salons", "Salons", "users")]), g("bookings", "Réservations", "□", [n("bookings", "Recherche", "bookings"), n("disputes", "Litiges", "escalations"), n("cancellations", "Annulations", "bookings")]), g("payments", "Paiements", "¤", [n("payments", "Consultation", "bookings"), n("refunds", "Remboursements", "escalations"), n("finance-escalations", "Escalades Finance", "escalations")]), g("knowledge", "Connaissances", "¶", [n("knowledge", "FAQ", "knowledge"), n("procedures", "Procédures", "knowledge"), n("templates", "Réponses modèles", "knowledge")]), g("reports", "Rapports", "%", [n("reports", "Rapports", "reports")]), g("profile", "Profil", "○", [n("profile", "Profil agent", "settings")]), g("settings", "Paramètres", "⚙", [n("settings", "Compte et sécurité", "settings")])] as const;

const moderationNavigation = [dashboard(), g("reports", "Signalements", "!", [n("reports", "Nouveaux", "reports", "!", true), n("urgent", "Urgents", "reports"), n("in-progress", "En cours", "reports"), n("processed", "Traités", "history")]), g("content", "Contenus", "▶", [n("videos", "Vidéos", "videos", "▶", true), n("photos", "Photos", "videos"), n("comments", "Commentaires", "comments", "✉", true), n("profiles", "Profils", "profiles", "◎", true)]), g("sanctions", "Sanctions", "×", [n("warnings", "Avertissements", "sanctions"), n("suspensions", "Suspensions", "sanctions"), n("bans", "Bannissements", "sanctions")]), g("appeals", "Appels", "↺", [n("appeals", "Appels", "appeals")]), g("history", "Historique", "≣", [n("history", "Historique", "history")]), g("rules", "Règles", "¶", [n("rules", "Règles", "rules")]), g("profile", "Profil", "○", [n("profile", "Profil agent", "settings")]), g("settings", "Paramètres", "⚙", [n("settings", "Compte et sécurité", "settings")])] as const;

const financeNavigation = [dashboard(), g("transactions", "Transactions", "¤", [n("transactions", "Toutes", "transactions", "¤", true), n("confirmed", "Confirmées", "transactions"), n("pending", "En attente", "pending", "…", true), n("failed", "Échouées", "failed", "×", true), n("anomalies", "Anomalies", "anomalies")]), g("refunds", "Remboursements", "↺", [n("refunds", "Demandés", "refunds", "↺", true), n("refunds-processing", "En traitement", "refunds"), n("refunds-completed", "Terminés", "refunds")]), g("payouts", "Versements", "↗", [n("payouts", "À traiter", "payouts"), n("payouts-processing", "En cours", "payouts"), n("payouts-completed", "Terminés", "payouts"), n("payouts-failed", "Échoués", "payouts")]), g("wallets", "Wallets", "▣", [n("wallets", "Wallets", "wallets")]), g("commissions", "Commissions", "%", [n("commissions", "Commissions", "commissions")]), g("reconciliation", "Rapprochement", "≋", [n("reconciliation", "Rapprochement", "reconciliation")]), g("reports", "Rapports", "¶", [n("reports", "Rapports", "reports")]), g("audit", "Audit financier", "≣", [n("audit", "Audit financier", "audit")]), g("profile", "Profil", "○", [n("profile", "Profil finance", "settings")]), g("settings", "Paramètres", "⚙", [n("settings", "Compte et sécurité", "settings")])] as const;

const operationsNavigation = [dashboard(), g("marketplace", "Marketplace", "◇", [n("users", "Utilisateurs", "users", "◎", true), n("providers", "Professionnels", "providers", "✦", true), n("salons", "Salons", "salons", "⌑", true), n("bookings", "Réservations", "bookings", "▣", true), n("categories", "Catégories", "categories"), n("areas", "Villes et zones", "areas"), n("promotions", "Promotions", "promotions")]), g("relations", "Relation client", "?", [n("support", "Support", "support"), n("reports", "Rapports", "reports")]), g("onboarding", "Onboarding", "✓", [n("onboarding", "Dossiers", "onboarding")]), g("content", "Contenu", "▶", [n("content", "Publications", "content"), n("moderation", "Modération", "moderation")]), g("communication", "Communication", "◌", [n("notifications", "Notifications", "notifications")]), g("security", "Sécurité", "≣", [n("audit", "Audit", "audit")]), g("profile", "Profil", "○", [n("profile", "Profil administrateur", "settings")]), g("settings", "Paramètres", "⚙", [n("settings", "Paramètres opérationnels", "settings")])] as const;

const adminNavigation = [dashboard("Dashboard"), g("users", "Utilisateurs", "◎", [n("clients", "Clients"), n("providers", "Professionnels"), n("salons", "Salons"), n("staff", "Employés"), n("agents", "Agents internes"), n("roles", "Administrateurs"), n("permissions", "Rôles et permissions"), n("suspended", "Comptes suspendus"), n("sessions", "Sessions")]), g("marketplace", "Marketplace", "◇", [n("services", "Prestations"), n("categories", "Catégories"), n("bookings", "Réservations"), n("availability", "Disponibilités"), n("promotions", "Promotions"), n("areas", "Villes et zones")]), g("content", "Contenu", "▶", [n("videos", "Vidéos"), n("comments", "Commentaires"), n("social-reports", "Signalements")]), g("relations", "Relation client", "?", [n("tickets", "Tickets"), n("escalations", "Réclamations"), n("disputes", "Litiges")]), g("onboarding", "Onboarding", "✓", [n("kyc", "Documents et KYC"), n("validations", "Validations")]), g("finance", "Finance", "¤", [n("transactions", "Transactions"), n("commissions", "Commissions"), n("refunds", "Remboursements"), n("payouts", "Versements"), n("financial-reports", "Rapports")]), g("communication", "Communication", "◌", [n("notifications", "Notifications"), n("campaigns", "Campagnes")]), g("security", "Sécurité", "⌾", [n("audit", "Audit"), n("security", "Événements sécurité"), n("deletion-requests", "Demandes de suppression")]), g("platform", "Plateforme", "⌘", [n("health", "Santé des services"), n("integrations", "Intégrations et webhooks"), n("system-logs", "Journaux techniques"), n("platform-settings", "Paramètres fonctionnels")])] as const;

export const workspaceSpaces: Record<WorkspaceSpaceKey, WorkspaceSpace> = {
  client: { key: "client", label: "Espace client", prefix: "/app", eyebrow: "Votre beauté", modules: clientModules, navigation: clientNavigation },
  pro: { key: "pro", label: "Espace professionnel", prefix: "/pro", eyebrow: "Votre activité", modules: proModules, navigation: proNavigation },
  salon: { key: "salon", label: "Espace salon", prefix: "/salon", eyebrow: "Votre établissement", modules: salonModules, navigation: salonNavigation },
  staff: { key: "staff", label: "Espace employé", prefix: "/staff", eyebrow: "Votre activité au salon", modules: staffModules, navigation: staffNavigation },
  onboarding: { key: "onboarding", label: "Onboarding", prefix: "/onboarding", eyebrow: "Validation professionnelle", allowedAdminRoles: ["verification_agent", "super_admin"], modules: onboardingModules, navigation: onboardingNavigation },
  support: { key: "support", label: "Support", prefix: "/support-agent", eyebrow: "Relation client", allowedAdminRoles: ["support", "admin", "super_admin"], modules: supportModules, navigation: supportNavigation },
  moderation: { key: "moderation", label: "Modération", prefix: "/moderation", eyebrow: "Confiance et sécurité", allowedAdminRoles: ["moderator", "admin", "super_admin"], modules: moderationModules, navigation: moderationNavigation },
  finance: { key: "finance", label: "Finance", prefix: "/finance", eyebrow: "Contrôle financier", allowedAdminRoles: ["finance", "super_admin"], modules: financeModules, navigation: financeNavigation },
  operations: { key: "operations", label: "Opérations", prefix: "/operations", eyebrow: "Administration opérationnelle", allowedAdminRoles: ["admin", "content_manager", "super_admin"], modules: operationsModules, navigation: operationsNavigation },
  admin: { key: "admin", label: "Super administration", prefix: "/admin", eyebrow: "Contrôle de la plateforme", allowedAdminRoles: ["super_admin"], modules: superAdminModules, navigation: adminNavigation },
};

export function workspaceModule(space: WorkspaceSpaceKey, key: string) {
  const definition = workspaceSpaces[space];
  const navigationItem = definition.navigation.flatMap((group) => group.items).find((item) => item.key === key);
  const targetKey = navigationItem?.targetKey ?? key;
  const target = definition.modules.find((item) => item.key === targetKey) ?? definition.modules[0];
  return navigationItem ? { ...target, key: navigationItem.key, label: navigationItem.label, icon: navigationItem.icon, targetKey } : target;
}

export function workspaceNavigationModules(space: WorkspaceSpaceKey) {
  const definition = workspaceSpaces[space];
  return definition.navigation.flatMap((group) => group.items.map((item) => workspaceModule(space, item.key)));
}

export function workspaceHref(space: WorkspaceSpaceKey, moduleKey = "dashboard") {
  const definition = workspaceSpaces[space];
  return moduleKey === "dashboard" ? definition.prefix : `${definition.prefix}/${moduleKey}`;
}
