# Mata Beauty — réorganisation complète de la navigation — 2026-08-18

## Verdict

**PASS — navigation hiérarchique déployée et testée sur Preview.**

- Branche : `codex/navigation-reorganization`
- Commit applicatif testé : `f07728b` (`fix: require onboarding review access`)
- Preview : https://mata-beauty-n99gt9o4f-africrm.vercel.app
- Déploiement Vercel : `dpl_6mvoGoNvfG148VvoDTtdf51Enu9a`, état `READY`
- Production : **non déployée**
- Supabase distant : **42 migrations locales / 42 distantes alignées**
- Recette Playwright distante : **13/13 PASS**, avec comptes temporaires supprimés après exécution

## Ancienne architecture

L’audit préalable est conservé dans `docs/MATA_BEAUTY_NAVIGATION_AUDIT_2026-08-18.md`. Les dix espaces utilisaient des listes plates de 9 à 17 liens. Il n’existait ni accordéon fonctionnel, ni persistance du groupe ouvert, ni vrai tiroir mobile. Le bouton mobile « Plus » redirigeait indirectement vers le Dashboard. Le Super Admin possédait une navigation plate distincte et plusieurs fonctions étaient rangées sous des catégories trop générales.

## Nouvelle architecture

- `Dashboard` est un lien direct et reste une synthèse.
- Les fonctions détaillées sont rangées dans des groupes accordéon par domaine métier.
- Un second clic referme un groupe ; le groupe actif est ouvert automatiquement.
- L’état est mémorisé par espace dans `sessionStorage`.
- Sur mobile, la barre basse contient au maximum cinq actions et « Plus » ouvre un vrai tiroir fermable et accessible.
- Les alias de navigation réutilisent les modules métier existants : aucune logique métier ni donnée n’a été dupliquée.
- `Profil` contient l’identité et les informations publiques ; `Paramètres` contient uniquement la configuration du compte.
- Le rendu partagé se trouve dans `app/sidebar-navigation.tsx` et est utilisé par `app/workspace-shell.tsx` et `app/super-admin.tsx`.

## Arborescence complète par rôle

### Client — `/app`

- Dashboard
- Découvrir : Pour toi, Abonnements, Tendances, Catégories, Autour de moi
- Mes rendez-vous : À venir, En attente, Terminés, Annulés, Historique
- Mes inspirations : Vidéos enregistrées, Vidéos aimées, Collections, Prestations favorites, Salons favoris, Professionnels suivis
- Communication : Messages, Notifications, Avis
- Paiements : Historique, Paiements en attente, Reçus, Remboursements
- Support : Nouveau ticket, Mes demandes, Réclamations, Aide
- Mon profil : Informations personnelles, Photo, Préférences beauté, Localisation, Confidentialité, Devenir professionnel
- Paramètres : Compte, Sécurité, Connexion Google, Notifications, Langue, Apparence, Données personnelles

### Professionnel — `/pro`

- Dashboard
- Activité : Agenda, Réservations, Disponibilités, Planning
- Relations : Messages, Clients, Avis, Abonnés, Notifications clients
- Offre : Prestations, Catégories, Tarifs, Promotions, Options
- Contenu : Studio, Publier, Mes vidéos, Brouillons, Publications programmées, Portfolio, Photos, Statistiques contenu
- Finance : Revenus, Paiements, Wallet, Versements, Commissions, Historique
- Support : Nouveau ticket, Mes tickets, Aide, Litiges
- Profil professionnel : Profil public, Informations professionnelles, Salon, Localisation, Horaires, Documents, Vérification, Aperçu public
- Paramètres : Compte, Sécurité, Notifications, Connexion Google, Confidentialité, Paiements

### Salon — `/salon`

- Dashboard
- Activité : Agenda du salon, Réservations, Disponibilités, Ressources
- Équipe : Membres, Invitations, Horaires, Permissions, Performances
- Offre : Prestations, Tarifs, Promotions, Catégories
- Contenu : Studio, Vidéos, Portfolio, Photos, Statistiques
- Relations : Clients, Messages, Avis, Abonnés
- Finance : Revenus, Paiements, Wallet, Versements, Commissions
- Profil du salon : Informations, Adresse, Horaires, Équipe publique, Galerie, Aperçu public
- Support : Assistance
- Paramètres : Compte et sécurité

### Employé — `/staff`

- Dashboard
- Activité : Mon agenda, Mes rendez-vous, Mes prestations
- Relations : Mes clientes, Mes messages
- Performance : Mes statistiques
- Profil : Mon profil
- Paramètres : Compte et notifications

### Agent onboarding — `/onboarding`

- Dashboard
- Dossiers : Nouveaux, En cours, Compléments demandés, Validés, Refusés
- Documents : Identité, Entreprise, Coordonnées, Documents expirants
- Affectations : Mes dossiers, Dossiers non assignés
- Historique : Décisions, Audit
- Notifications
- Profil
- Paramètres

### Support — `/support-agent`

- Dashboard
- Tickets : Nouveaux, Mes tickets, Non assignés, Prioritaires, En attente, Résolus
- Utilisateurs : Clients, Professionnels, Salons
- Réservations : Recherche, Litiges, Annulations
- Paiements : Consultation, Remboursements, Escalades Finance
- Connaissances : FAQ, Procédures, Réponses modèles
- Rapports, Profil, Paramètres

### Modération — `/moderation`

- Dashboard
- Signalements : Nouveaux, Urgents, En cours, Traités
- Contenus : Vidéos, Photos, Commentaires, Profils
- Sanctions : Avertissements, Suspensions, Bannissements
- Appels, Historique, Règles, Profil, Paramètres

### Finance — `/finance`

- Dashboard
- Transactions : Toutes, Confirmées, En attente, Échouées, Anomalies
- Remboursements : Demandés, En traitement, Terminés
- Versements : À traiter, En cours, Terminés, Échoués
- Wallets, Commissions, Rapprochement, Rapports, Audit financier, Profil, Paramètres

### Administrateur opérationnel — `/operations` et `/admin` filtré

- Dashboard
- Marketplace : Utilisateurs, Professionnels, Salons, Réservations, Catégories, Villes et zones, Promotions
- Relation client : Support, Rapports
- Onboarding : Dossiers
- Contenu : Publications, Modération
- Communication : Notifications
- Sécurité : Audit autorisé uniquement
- Profil, Paramètres opérationnels

Dans le centre `/admin`, la navigation est filtrée par permission : l’administrateur opérationnel ne voit ni rôles, ni permissions, ni sessions privilégiées, ni événements sécurité, ni maintenance. Il conserve la lecture Audit et Configuration lorsqu’elles sont explicitement accordées.

### Super Admin — `/admin`

- Dashboard
- Utilisateurs : Clients, Professionnels, Salons, Employés, Agents internes, Administrateurs, Rôles, Permissions, Comptes suspendus, Sessions
- Marketplace : Prestations, Catégories, Réservations, Disponibilités, Promotions, Villes, Zones
- Contenu : Vidéos, Publications, Photos, Hashtags, Commentaires, Signalements, Modération
- Relation client : Tickets, Réclamations, Litiges, Satisfaction, Base de connaissances
- Onboarding : Dossiers, Professionnels en attente, Documents, KYC, Validations, Refus, Historique
- Finance : Transactions, Paiements, Commissions, Wallets, Versements, Remboursements, Litiges, Rapprochement, Rapports
- Communication : Notifications, Emails, Modèles, Campagnes, Messages système
- Sécurité : Audit, Événements sécurité, Accès refusés, Sessions privilégiées, Rôles sensibles, Demandes de suppression
- Plateforme : Santé des services, Intégrations, Webhooks, Jobs, Paramètres fonctionnels, Fonctionnalités, Journaux techniques
- Rapports
- Paramètres

## Routes, composants et alias

Les préfixes historiques sont conservés : `/app`, `/pro`, `/salon`, `/staff`, `/onboarding`, `/support-agent`, `/moderation`, `/finance`, `/operations` et `/admin`. Les anciennes routes principales telles que `/pro/videos`, `/app/inspirations` et `/admin` restent fonctionnelles.

Les sous-routes spécialisées sont des alias vers le module réel. Exemples :

| Nouvelle entrée | Module réutilisé | Effet |
|---|---|---|
| `/pro/publish`, `/pro/drafts`, `/pro/scheduled` | Studio `/pro/videos` | ouvre la surface Contenu existante |
| `/pro/availability`, `/pro/planning` | Agenda | conserve les données et règles de disponibilité |
| `/app/bookings-pending`, `/app/booking-history` | Réservations | conserve la source Supabase et les RLS existantes |
| `/salon/photos`, `/salon/gallery` | Portfolio | évite une seconde galerie concurrente |
| alias financiers Super Admin | Paiements/Audit | n’expose pas un module à un rôle par simple alias transversal |

Composants concernés :

- ajouté : `app/sidebar-navigation.tsx` (`SidebarNavigation`, `SidebarGroup`, `SidebarLink`) ;
- modifié : `app/workspace-shell.tsx` pour groupes, tiroir mobile, groupe actif et barre basse ;
- modifié : `app/super-admin.tsx` pour la hiérarchie et le filtrage par permissions ;
- modifié : `lib/navigation/spaces.ts` comme source déclarative des dix espaces ;
- modifié : `app/workspace.css` pour le rendu premium, les animations discrètes et le responsive.

## Doublons supprimés et fonctions replacées

- Les notifications quittent les groupes génériques « Compte » et rejoignent Relations/Communication.
- Studio devient l’entrée principale du groupe Contenu ; Publier, brouillons et programmations réutilisent le même module.
- Les statistiques de contenu rejoignent Contenu ; seuls les KPI synthétiques restent dans Dashboard.
- Les informations personnelles et professionnelles sont regroupées dans Profil.
- Sécurité, connexion, confidentialité et préférences techniques sont regroupées dans Paramètres.
- Les deux rendus de sidebar partagent désormais le même composant accordéon.
- Trois alias administratifs trop larges ont été corrigés : Litiges Finance, Historique Onboarding et Professionnels en attente.

## Sécurité, rôles et RLS

- Le masquage visuel n’est pas la protection : les routes continuent d’utiliser `requireWorkspace`, `canAccessWorkspace` et `canAccessWorkspaceModule`.
- Le centre `/admin` filtre chaque module sur les permissions Supabase du contexte administrateur.
- Client et Professionnel non administrateurs sont refusés avant le chargement du centre de contrôle.
- Support, Onboarding, Modération, Finance et Admin ne voient que les groupes/modules permis ; le Super Admin voit l’ensemble.
- La migration non destructive `20260818100000_staff_membership_rls.sql` autorise uniquement un collaborateur authentifié à lire sa propre adhésion active (`profile_id = auth.uid()`). RLS reste activée.
- La migration a été appliquée et vérifiée sur le projet distant : `20260818100000` local = distant ; total **42/42**.
- Aucun secret n’a été ajouté au dépôt, aucune Service Role Key n’est envoyée au frontend et aucune RLS n’a été désactivée.
- Les identifiants de recette et le bypass d’automatisation existant ont été utilisés uniquement en mémoire ; les dix comptes temporaires et le salon temporaire sont supprimés par la fin de test.
- Connexion Super Admin : création de session dans `admin_sessions` et événement `admin.signed_in` vérifiés dans `audit_logs`.

## Résultats de validation

| Contrôle | Résultat |
|---|---|
| ESLint | PASS |
| TypeScript strict | PASS |
| Vitest | PASS — 14 fichiers, 82 tests |
| Tests structurels | PASS — 21/21 |
| Build Next.js local | PASS — 17 pages générées, routes dynamiques compilées |
| Build Vercel Preview | PASS — état `READY` |
| Playwright Preview | PASS — 13/13 en 1,7 min |
| Migrations Supabase | PASS — 42/42 alignées |

### Matrice Playwright distante

1. Client : tous les groupes et sous-menus ouvrables, routes `/app` conservées — PASS.
2. Professionnel : tous les groupes et sous-menus ouvrables, routes `/pro` conservées — PASS.
3. Salon : tous les groupes et sous-menus ouvrables, routes `/salon` conservées — PASS.
4. Employé : adhésion réelle résolue par RLS, routes `/staff` accessibles — PASS.
5. Responsive : tiroir, fermeture, barre basse et absence de débordement — PASS.
6. Client refusé sur `/admin` — PASS.
7. Professionnel refusé sur `/admin` — PASS.
8. Support limité aux modules autorisés — PASS.
9. Onboarding limité aux dossiers et décisions autorisés — PASS.
10. Finance limitée aux réservations, finances et audits autorisés — PASS.
11. Modérateur limité aux fonctions de confiance — PASS.
12. Admin séparé des fonctions Super Admin — PASS.
13. Super Admin complet, session et connexion journalisées — PASS.

### Responsive

| Largeur | Mode | Résultat |
|---|---|---|
| 320 px | barre basse + tiroir | PASS, aucun scroll horizontal |
| 375 px | barre basse + tiroir | PASS, aucun scroll horizontal |
| 390 px | barre basse + tiroir | PASS, aucun scroll horizontal |
| 430 px | barre basse + tiroir | PASS, aucun scroll horizontal |
| 768 px | tablette avec sidebar compacte | PASS |
| 1024 px | desktop | PASS |
| 1440 px | grand écran | PASS |

## Conclusion

La réorganisation est non destructive : aucune réservation, vidéo, conversation, prestation, paiement, profil, rôle ou donnée utilisateur n’a été supprimé. Les menus sont compacts, hiérarchiques, accessibles et reliés aux modules existants. Les accès visibles correspondent aux rôles et permissions réellement vérifiés sur Supabase.

**NAVIGATION REORGANIZATION: PASS**
