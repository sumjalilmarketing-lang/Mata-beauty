# Mata Beauty — audit préalable de navigation — 2026-08-18

## Périmètre

- Branche de départ : `codex/video-upload-critical-fix`, commit `365a3217a79178b24157901d295228f21acdcaec`.
- Branche de travail : `codex/navigation-reorganization`.
- Espaces inventoriés : client, professionnel, salon, employé, onboarding, support, modération, finance, opérations/admin et Super Admin.
- La refonte est strictement non destructive : aucune donnée, migration métier, politique RLS ou fonctionnalité validée ne doit être supprimée.

## Architecture actuelle

La configuration principale est déjà centralisée dans `lib/navigation/spaces.ts`, avec dix espaces et des modules protégés par rôle et, pour les espaces internes, par permission. La coque commune `WorkspaceShell` rend toutefois tous les modules autorisés sous forme de liens plats regroupés par simples titres visuels.

Constats techniques :

1. Les groupes actuels ne sont pas interactifs : aucune ouverture, fermeture, animation ou mémorisation.
2. La catégorie active n'est pas ouverte puisqu'il n'existe pas encore d'accordéon.
3. Sur mobile, la sidebar disparaît et le cinquième bouton `Plus` pointe vers `/menu`, que `WorkspaceRoute` transforme en `dashboard`. Il n'existe donc pas de vrai tiroir mobile.
4. `WorkspaceRoute` retire les modules qui n'ont pas de `resource`, sauf Dashboard et quelques parcours Salon. Plusieurs fonctions déclarées dans le menu ne peuvent donc pas être ouvertes.
5. Dashboard, Profil et Paramètres sont encore des groupes mêlant résumé, identité et configuration.
6. Certaines fonctions liées sont éclatées : notifications dans Compte, statistiques dans Pilotage, Studio sous un unique module regroupant création et bibliothèque.
7. Le Super Admin utilise une seconde navigation plate, codée dans `app/super-admin.tsx`, distincte de la matrice commune.
8. Les routes serveur et les permissions sont déjà contrôlées par `requireWorkspace`, `canAccessWorkspace`, `canAccessWorkspaceModule`, les RPC et RLS. Cette protection doit être conservée et étendue aux nouvelles routes, jamais remplacée par un simple masquage visuel.

## Inventaire des routes

| Espace | Préfixe actuel | Rôle/condition serveur | État du menu |
|---|---|---|---|
| Client | `/app` | rôle applicatif `client` | 13 liens plats |
| Professionnel | `/pro` | rôle applicatif `provider` | 15 liens plats |
| Salon | `/salon` | rôle `provider`, puis RLS propriétaire/collaborateur | 17 liens plats |
| Employé | `/staff` | collaborateur actif | 9 liens plats |
| Onboarding | `/onboarding` | `verification_agent` ou `super_admin` + permissions | 11 liens plats |
| Support | `/support-agent` | `support`, `admin` ou `super_admin` + permissions | 12 liens plats |
| Modération | `/moderation` | `moderator`, `admin` ou `super_admin` + permissions | 12 liens plats |
| Finance | `/finance` | `finance` ou `super_admin` + permissions | 14 liens plats |
| Opérations | `/operations` | `admin`, `content_manager` ou `super_admin` + permissions | 16 liens plats |
| Super Admin | `/admin` et `/admin/[module]` | `super_admin` | deux systèmes de navigation, tous deux plats |

## Matrice de déplacement

### Client

| Fonction actuelle | Espace actuel | Emplacement correct | Route finale | Autorisation |
|---|---|---|---|---|
| Feed | Essentiel | Découvrir / Pour toi | `/app/feed` | client |
| Découverte catalogue | Essentiel | Découvrir / Catégories | `/app/discover` | client |
| Réservations | Activité | Mes rendez-vous / À venir | `/app/bookings` | client + RLS propriétaire |
| Inspirations | Bibliothèque | Mes inspirations / Vidéos enregistrées | `/app/inspirations` | client + RLS propriétaire |
| Favoris | Bibliothèque | Mes inspirations / Prestations favorites | `/app/favorites` | client + RLS propriétaire |
| Messages | Activité | Communication / Messages | `/app/messages` | participant conversation |
| Notifications | Compte | Communication / Notifications | `/app/notifications` | client + RLS propriétaire |
| Avis | Compte | Communication / Avis | `/app/reviews` | client + réservation terminée |
| Paiements | Activité | Paiements / Historique | `/app/payments` | client + RLS propriétaire |
| Support | Compte | Support / Mes demandes | `/app/support` | client + RLS propriétaire |
| Profil | Compte | Mon profil / Informations personnelles | `/app/profile` | client + RLS propriétaire |
| Paramètres | Compte | Paramètres / Compte | `/app/settings` | client |

### Professionnel

| Fonction actuelle | Espace actuel | Emplacement correct | Route finale | Autorisation |
|---|---|---|---|---|
| Agenda | Pilotage | Activité / Agenda | `/pro/agenda` | provider |
| Réservations | Pilotage | Activité / Réservations | `/pro/bookings` | provider + RLS propriétaire |
| Disponibilités | mélangées à Agenda | Activité / Disponibilités | `/pro/availability` | provider + RLS propriétaire |
| Messages | Relations | Relations / Messages | `/pro/messages` | participant conversation |
| Clientes | Relations | Relations / Clients | `/pro/clients` | relation métier réelle |
| Avis | Relations | Relations / Avis | `/pro/reviews` | provider concerné |
| Notifications | Compte | Relations / Notifications clients | `/pro/notifications` | provider |
| Prestations | Offre | Offre / Prestations | `/pro/services` | provider + RLS propriétaire |
| Studio | Contenu | Contenu / Studio | `/pro/videos` | provider approuvé pour publier |
| Portfolio | Contenu | Contenu / Portfolio | `/pro/portfolio` | provider |
| Statistiques | Pilotage | Contenu / Statistiques contenu | `/pro/statistics` | provider + statistiques privées |
| Revenus | Finance | Finance / Revenus | `/pro/revenue` | provider + RLS propriétaire |
| Support | Compte | Support / Mes tickets | `/pro/support` | provider |
| Profil public | Compte | Profil professionnel / Profil public | `/pro/public-profile` | provider |
| Paramètres | Compte | Paramètres / Compte | `/pro/settings` | provider |

### Salon et employé

| Fonction actuelle | Espace actuel | Emplacement correct | Route finale | Autorisation |
|---|---|---|---|---|
| Agenda/Réservations | Pilotage | Activité | `/salon/agenda`, `/salon/bookings` | propriétaire/collaborateur autorisé |
| Ressources | Organisation | Activité / Ressources | `/salon/resources` | propriétaire/collaborateur autorisé |
| Équipe | Organisation | Équipe / Membres | `/salon/team` | propriétaire/manager |
| Prestations | Offre | Offre / Prestations | `/salon/services` | propriétaire/manager |
| Studio/Portfolio | Contenu | Contenu / Studio, Portfolio | `/salon/videos`, `/salon/portfolio` | salon autorisé |
| Clientes/Messages/Avis | Relations | Relations | routes existantes conservées | RLS salon |
| Revenus/Versements | Finance | Finance | `/salon/revenue`, `/salon/payouts` | permission financière salon |
| Profil salon | Compte | Profil du salon | `/salon/profile` | propriétaire/manager |
| Fonctions employé | Mon activité/Relations | Activité, Relations, Profil, Paramètres | préfixe `/staff` conservé | collaborateur actif + RLS |

### Espaces internes

| Espace | Groupes actuels | Groupes finaux | Routes conservées ou ajoutées | Protection |
|---|---|---|---|---|
| Support | Assistance, Files, Contexte, Pilotage, Compte | Tickets, Utilisateurs, Réservations, Paiements, Connaissances, Rapports, Profil, Paramètres | préfixe `/support-agent` | rôle + permission par module |
| Onboarding | Traitement, Historique, Conformité, Compte | Dossiers, Documents, Affectations, Historique, Notifications, Profil, Paramètres | préfixe `/onboarding` | `documents.review`, `providers.read`, etc. |
| Finance | Finance, Paiements, Contrôle, Trésorerie, Pilotage, Compte | Transactions, Remboursements, Versements, Wallets, Commissions, Rapprochement, Rapports, Audit, Profil, Paramètres | préfixe `/finance` | permissions financières granulaires |
| Modération | Modération, Contenus, Décisions, Référentiel, Compte | Signalements, Contenus, Sanctions, Appels, Historique, Règles, Profil, Paramètres | préfixe `/moderation` | permissions de signalement/modération |
| Opérations/Admin | Opérations, Marketplace, Catalogue, Équipes, Communication, Pilotage, Contrôle | Dashboard, Marketplace, Relation client, Onboarding, Contenu, Rapports, Profil, Paramètres | préfixe `/operations` | permissions granulaires, sans secrets |

### Super Admin

| Fonctions actuelles | Emplacement correct | Routes/modules | Permission minimale |
|---|---|---|---|
| Clients, professionnels, salons, employés, agents, rôles, permissions, sessions, suspendus | Utilisateurs | clés actuelles conservées | `users.read`, `roles.manage`, `users.suspend` |
| Prestations, catégories, réservations, disponibilités, promotions, zones | Marketplace | clés actuelles conservées | `categories.manage`, `bookings.read`, `content.manage` |
| Vidéos, commentaires, signalements | Contenu | clés actuelles conservées | `content.manage`, `reviews.moderate`, `reports.manage` |
| Tickets, escalades, litiges | Relation client | clés actuelles conservées | `support.manage`, `reports.manage` |
| KYC et validations | Onboarding | clés actuelles conservées | `documents.review`, `providers.verify` |
| Transactions, commissions, remboursements, versements, rapports | Finance | clés actuelles conservées | permissions financières existantes |
| Notifications et campagnes | Communication | clés actuelles conservées | `notifications.send`, `content.manage` |
| Audit, événements sécurité, suppressions | Sécurité | clés actuelles conservées | `audit.read`, `roles.manage`, `users.delete` |
| Santé, intégrations, journaux, paramètres | Plateforme | clés actuelles conservées | `settings.read/update`, `audit.read` |

## Doublons et fonctions mal placées

- `notifications` apparaît dans presque tous les groupes Compte alors qu'il appartient à Relations/Communication, sauf notifications strictement techniques.
- Les statistiques professionnelles et Salon sont rangées dans Pilotage alors que les statistiques de publication appartiennent à Contenu ; les KPI synthétiques restent sur Dashboard.
- Studio concentre création, publications, brouillons, programmation, archives, commentaires et statistiques. Le composant reste unique, mais les sous-routes doivent ouvrir directement le bon onglet afin d'éviter une duplication de logique.
- Profil et Paramètres mélangent identité, informations publiques, paiements et sécurité. Ils doivent être séparés sémantiquement sans dupliquer les formulaires.
- Le Super Admin possède une navigation métier dans `SuperAdminApp` et une autre dans `workspaceSpaces.admin`. Une source hiérarchique commune doit piloter les groupes et les permissions.

## Architecture cible

1. Une source unique décrit espaces, groupes, modules, icônes, permissions, badges et éventuelle cible fonctionnelle.
2. `Dashboard` reste un lien direct, jamais un groupe fourre-tout.
3. Chaque autre catégorie utilise un composant accordéon partagé avec `aria-expanded`, contrôle clavier et groupe actif ouvert automatiquement.
4. L'état ouvert est mémorisé par espace dans `sessionStorage`; sur mobile, un seul groupe reste ouvert.
5. Un vrai tiroir mobile est ouvert par `Plus`, sans navigation fictive vers Dashboard. La barre basse reste limitée à cinq actions.
6. Les routes aliases spécialisées réutilisent les composants métier existants avec un sous-écran initial, sans copier leur logique.
7. Le serveur continue de valider espace, module et permission. Les modules sans table générique restent accessibles s'ils ont une surface fonctionnelle déclarée ; aucun accès ne dépend seulement de la visibilité du menu.

## Risques à couvrir par les tests

- Régression des routes historiques (`/pro/videos`, `/app/inspirations`, `/admin`).
- Ouverture du mauvais groupe après navigation ou rafraîchissement.
- Route alias affichée mais non autorisée côté serveur.
- Tiroir mobile inaccessible au clavier ou dépassant à 320 px.
- Plus de cinq actions dans la barre basse.
- Groupe vide après filtrage des permissions.
- Déconnexion dupliquée ou inaccessible.
- Divergence entre navigation Super Admin et matrice de permissions.

AUDIT PRÉALABLE: TERMINÉ — IMPLÉMENTATION AUTORISÉE
