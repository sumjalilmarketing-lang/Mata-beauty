# Recette — équipe et attribution des rendez-vous

Date : 11 octobre 2026, Europe/Paris. Rapport provisoire à compléter après les parcours navigateur et le déploiement.

La gestion des employés et l’attribution des rendez-vous sont implémentées. Les contrôles locaux, les 27 vérifications API QA et le parcours navigateur étendu sur Chromium et WebKit sont PASS. La validation sur `https://mata-beauty.com` reste à compléter. Ce document ne prononce pas de validation de lancement public.

## Périmètre livré

- Fiches collaborateurs : prénom, nom public, photo, fonction, spécialités, prestations autorisées, disponibilité et archivage avec conservation de l’historique.
- Horaires hebdomadaires, pauses entre prestations, congés, repos, absences et horaires exceptionnels.
- Activation volontaire de la réservation par équipe ; maintien du parcours des professionnels indépendants.
- Choix d’un employé qualifié et disponible, ou affectation automatique enregistrée côté serveur.
- Nom et photo de l’intervenant dans la confirmation et les rendez-vous ; notifications d’affectation et de réaffectation.
- Agenda par collaborateur, signalement des conflits après modification des disponibilités, réaffectation avec motif et historique.
- Avis vérifié rattaché à l’intervenant effectivement enregistré sur la réservation terminée.

Créer une fiche employé ne crée pas de compte d’authentification et n’accorde aucun rôle administratif. Le paiement reste en mode de démonstration conformément aux instructions du dépôt. Les horaires du module sont explicitement affichés à l’heure du Sénégal.

## Fichiers concernés

| Fichiers | Rôle |
|---|---|
| `app/team-management.tsx` | Fiches employés, disponibilités, agenda, réaffectation et historique consultable indépendamment de la possibilité de réaffecter |
| `app/booking-review.tsx` | Publication d’un avis sur une réservation terminée |
| `app/mata-beauty-app.tsx` | Disponibilités de l’équipe, choix de l’intervenant, retour serveur de l’affectation et ouverture du parcours par prestation |
| `app/live-dashboard.tsx`, `app/client-control-center.tsx` | Intervenant dans les rendez-vous et les avis |
| `app/salon-control-center.tsx`, `app/workspace-module.tsx`, `lib/navigation/spaces.ts` | Intégration dans les espaces Professionnel et Salon |
| `lib/domain/notifications.ts` | Destinations des notifications vers les espaces concernés |
| `app/globals.css`, `app/workspace.css` | Présentation des choix et de la gestion d’équipe |
| `scripts/verify-employee-assignment.mjs` | Scénarios API sur QA isolée et production du relevé de résultats |
| `tests/remote/employee-assignment.spec.ts`, `playwright.remote.config.ts` | Parcours navigateur, régression du changement de date et historique après prestation terminée |

## Migrations versionnées

| Migration dans `supabase/migrations/` | Objet |
|---|---|
| `20261008170112_employee_booking_assignment.sql` | Modèle équipe, disponibilités, affectation, agenda, RLS, historique, notifications et avis |
| `20261008172740_employee_assignment_guards.sql` | Verrous des ressources, prévention des demandes répétées et ordre des verrous |
| `20261008173647_employee_calendar_contract.sql` | Durée des options obligatoires et contrôle des comptes actifs lors des modifications de calendrier |
| `20261008174332_employee_resource_namespace.sql` | Contrainte de chevauchement distinguant les ressources par professionnel |
| `20261008174522_require_enabled_team_assignment.sql` | Refus d’une affectation explicite lorsque la réservation par équipe est désactivée |
| `20261011092427_harden_employee_account_access.sql` | Restrictions de lecture après suspension/désactivation et garde des modifications directes de l’équipe |

Les nouvelles tables publiques `collaborator_hours`, `collaborator_exceptions` et `booking_assignments` activent RLS. Les fonctions internes sont placées dans `booking_private` sans accès direct accordé aux rôles publics. Les opérations autorisées côté serveur vérifient la propriété et les conditions d’affectation.

Le contrat de réservation actuellement servi en production a été inspecté : il vérifie les créneaux via `get_available_slots` avant de calculer le devis et la durée. Cette inspection ne remplace pas une exécution du nouveau parcours en production.

## Contrôles locaux

Ces résultats proviennent des commandes exécutées dans la session de validation du 11 octobre 2026, après les correctifs de revue.

| Contrôle | Résultat | Statut |
|---|---|---|
| `pnpm lint` | Vérification globale terminée sans erreur | PASS |
| `pnpm typecheck` | TypeScript terminé sans erreur | PASS |
| `pnpm test` | 105 tests unitaires réussis | PASS |
| `pnpm build` | Build terminé avec succès | PASS |

Ces contrôles ne prouvent ni les interactions navigateur ni le fonctionnement du domaine public.

## Vérifications API réellement exécutées

Environnement : QA isolée, projet `kazlvtxkbsdhbfvtqqdp`. Le script refuse de démarrer sur une autre URL. Il utilise des comptes temporaires, un réviseur QA avec MFA et des comptes dont les e-mails transactionnels sont neutralisés pour le test ; il prévoit leur nettoyage en fin d’exécution.

Preuve : `work/employee-assignment/api-results.json`, horodaté `2026-10-11T09:31:27.316Z`, soit 11 h 31 min 27 s à Paris. Résultat lu : **27 PASS, 0 FAIL**. Les PASS ci-dessous portent uniquement sur les assertions présentes dans `scripts/verify-employee-assignment.mjs`.

| N° | Action contrôlée | Résultat observé | Statut |
|---|---|---|---|
| 1 | Liste des disponibilités | Deux employés qualifiés proposés, réservation par équipe active | PASS |
| 2 | Gestion de l’équipe par un client tiers | RPC de modification refusée | PASS |
| 3 | Lecture des horaires privés par un client tiers | Aucune ligne accessible | PASS |
| 4 | Deux réservations simultanées du même employé | Une seule création ; autre requête refusée avec conflit `23P01` | PASS |
| 5 | Identité et prix contractuels | Nom enregistré et prix recalculé côté serveur à 15 000 XOF | PASS |
| 6 | Réservation pendant la pause de l’employé | Création incompatible refusée | PASS |
| 7 | Deux affectations automatiques simultanées | Deux employés disponibles différents attribués | PASS |
| 8 | Absence sur une réservation existante | Conflit d’affectation signalé dans l’agenda | PASS |
| 9 | Même réaffectation demandée deux fois | Un seul changement enregistré, en plus de l’affectation initiale | PASS |
| 10 | Intervenant après réaffectation | Nouveau nom conservé dans la réservation | PASS |
| 11 | Double demande de réservation automatique | Une seule réservation créée | PASS |
| 12 | Notifications du client | Une notification initiale et une seule notification de réaffectation | PASS |
| 13 | Notification du salon | Une seule notification de réaffectation | PASS |
| 14 | Réaffectation tentée par un client | Refus côté serveur | PASS |
| 15 | Employé non qualifié | Réservation refusée | PASS |
| 16 | Employé inactif | Réservation refusée | PASS |
| 17 | Avis avec identifiant d’employé falsifié | Avis rattaché à l’intervenant réel, identifiant fourni ignoré | PASS |
| 18 | Propriétaire suspendu avec son JWT existant : agenda et candidats | Deux RPC refusées avec `42501` | PASS |
| 19 | Propriétaire suspendu : horaires, absences et historique | Aucune ligne privée accessible | PASS |
| 20 | Propriétaire suspendu : écritures directes équipe | Modifications refusées ou sans ligne modifiée ; état relu et inchangé | PASS |
| 21 | Client suspendu : historique de sa réservation | Aucune ligne accessible | PASS |
| 22 | Propriétaire désactivé avec son JWT existant : agenda et candidats | Deux RPC refusées avec `42501` | PASS |
| 23 | Propriétaire désactivé : horaires, absences et historique | Aucune ligne privée accessible | PASS |
| 24 | Propriétaire désactivé : écritures directes équipe | Modifications refusées ou sans ligne modifiée ; état relu et inchangé | PASS |
| 25 | Client désactivé : historique de sa réservation | Aucune ligne accessible | PASS |
| 26 | Réactivation du propriétaire et du client | Historique autorisé de nouveau, avec les deux événements attendus | PASS |
| 27 | Employé explicite alors que l’équipe est désactivée | Affectation refusée côté serveur | PASS |

La vérification des notifications ci-dessus porte sur leurs enregistrements et destinataires en base. Elle n’atteste pas la réception d’un e-mail dans une boîte réelle, ni le parcours de clic depuis une notification.

## Anomalies traitées pendant la revue

| Problème | Correction | Preuve disponible à ce stade |
|---|---|---|
| JWT encore valide après suspension : accès aux données privées d’équipe | Policies RLS restrictives et gardes dans les RPC de lecture | Scénarios API 18–19, 21–23, 25–26 PASS |
| Écritures directes permettant de contourner le garde des RPC | Contrôle du compte actif sur `collaborators` et les changements de `team_booking_enabled` | Scénarios API 20 et 24 PASS |
| Choix d’un employé conservé après changement de date, pouvant masquer les autres créneaux | Réinitialisation du choix lors du changement de date | Test navigateur ajouté ; résultat de cette révision en attente |
| Historique masqué pour les rendez-vous terminés, annulés ou passés | Action « Voir l’historique » séparée de la réaffectation ; formulaire limité aux rendez-vous admissibles | Test navigateur après completion ajouté ; résultat en attente |
| Horodatage calculé pendant le rendu du composant | Horodatage conservé en état et actualisé ; contrôle frais à la soumission et garde serveur conservés | Lint et TypeScript PASS |

La revue de code n’a pas identifié d’autre blocage concret dans les modifications examinées. Cette conclusion est limitée au périmètre de la revue et ne constitue pas un audit exhaustif de toute la plateforme.

## Parcours navigateur et Preview — à compléter

| Parcours | État à la rédaction | Statut |
|---|---|---|
| Création employé, photo, spécialités et horaires | Parcours Chromium exécuté sur la Preview QA | PASS |
| Sélection d’employé, changement de date et réservation Client | Employé indisponible retiré, choix automatique rétabli, réservation manuelle enregistrée | PASS |
| Absence, réaffectation, confirmation, prestation terminée et avis | Intervenant réaffecté enregistré et utilisé pour l’avis vérifié | PASS |
| Historique accessible après prestation terminée, sans formulaire de réaffectation | Affectation initiale, nouvel intervenant et motif visibles | PASS |
| Attribution automatique depuis le formulaire Client | Awa disponible à J+1 choisie côté serveur, nom affiché et persisté | PASS |
| Notification Client | Clic Ouvrir, bon rendez-vous et statut lu vérifiés dans l’interface et la base | PASS |
| Désactivation, réactivation et archivage | Boutons et confirmation exécutés ; disponibilités mises à jour, deux réservations, trois événements et avis conservés | PASS |
| Chromium, affichage mobile simulé 390×844 et desktop | Scénario étendu : 1 PASS en 2 minutes le 11 octobre à 11:40 Paris | PASS |
| WebKit, même parcours étendu | Retest : 1 PASS en 1,8 minute, aucune erreur de page ; aucun filtrage d’erreurs | PASS |

Preview testée : `https://mata-beauty-3qgv7dved-africrm.vercel.app`, déploiement `dpl_fTswTgv2MWZhjkS9y6UNFaR8tJQ8`, base QA vérifiée. Captures renouvelées le 11 octobre : `work/employee-assignment/owner-team.png` et `work/employee-assignment/client-assignment.png`. Un affichage mobile simulé n’est pas un essai sur téléphone réel.

Premier essai WebKit : parcours métier terminé, assertion globale erreurs FAIL. La trace identifie huit requêtes annulées (`Load request cancelled`, statut -1) lors des navigations forcées du test, avec les mêmes endpoints HTTP 200 et en-tête CORS correct avant/après. Le helper de navigation a été corrigé pour utiliser les liens visibles. Retest complet PASS. Aucun filtre d’erreurs ajouté, aucun affaiblissement CORS applicatif.

## Production et limites restantes — à compléter

| Contrôle restant | Résultat attendu | Statut |
|---|---|---|
| Migrations de cette livraison sur la base de production | Présence vérifiée des six migrations et contrôles de schéma | NOT TESTED |
| Déploiement de cette livraison | Déploiement réussi et commit/identifiant consignés | NOT TESTED |
| Version réellement servie par `https://mata-beauty.com` | Correspondance démontrée avec le déploiement attendu | NOT TESTED |
| Parcours authentifié Client ↔ Professionnel en production | Réservation, affectation, absence/réaffectation et historique vérifiés sur le domaine public | NOT TESTED |
| Réception effective des e-mails d’affectation/réaffectation | Boîte de test réelle consultée, contenu et liens vérifiés | NOT TESTED |
| Employé possédant déjà un accès individuel | Notification et destination vérifiées avec ce profil | NOT TESTED |
| iPhone réel, Safari/Chrome | Choix employé, clavier, scroll et confirmation utilisables | NOT TESTED |
| Android réel, Chrome | Même contrôle physique | NOT TESTED |
| Trackpad physique | Défilement complet des formulaires, de l’agenda et de l’historique | NOT TESTED — PHYSICAL TRACKPAD REQUIRED |

La réception réelle des e-mails, les essais matériels et les parcours authentifiés de production ne sont pas déduits des résultats API QA, unitaires ou du build. La conclusion de livraison doit être mise à jour après les contrôles encore en attente.
