# Recette — équipe et attribution des rendez-vous

Date : 11 octobre 2026, Europe/Paris. Module déployé, sonde serveur corrigée et contrôles publics effectués sur le domaine.

La gestion des employés et l’attribution des rendez-vous sont implémentées dans le commit `20d5861836cb18fdb7141eda4d1298755a55c8aa`. Le frontend déployé correspond au commit documentaire suivant `3a38ad1a60a6c13b18b99757bbce4ba451f803fa`, sans différence de code applicatif. Les contrôles locaux, les 27 vérifications API QA et le parcours navigateur étendu sur Chromium et WebKit sont PASS. Cinq scénarios publics ont été exécutés sur `https://mata-beauty.com`. La recette a ensuite révélé et corrigé le format des créneaux indépendants par une septième migration serveur. Les limites authentifiées et matérielles ci-dessous restent distinctes : ce document ne prononce pas une validation globale de lancement public.

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
| `20261011095523_fix_independent_team_availability_shape.sql` | Format objet `{slot_start}` des créneaux des professionnels indépendants |

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
| Choix d’un employé conservé après changement de date, pouvant masquer les autres créneaux | Réinitialisation du choix lors du changement de date | Chromium et WebKit : changement de date PASS |
| Historique masqué pour les rendez-vous terminés, annulés ou passés | Action « Voir l’historique » séparée de la réaffectation ; formulaire limité aux rendez-vous admissibles | Chromium et WebKit : historique après prestation terminée PASS ; états annulé/passé non exécutés séparément |
| Horodatage calculé pendant le rendu du composant | Horodatage conservé en état et actualisé ; contrôle frais à la soumission et garde serveur conservés | Lint et TypeScript PASS |

La revue de code n’a pas identifié d’autre blocage concret dans les modifications examinées. Cette conclusion est limitée au périmètre de la revue et ne constitue pas un audit exhaustif de toute la plateforme.

## Parcours navigateur et Preview

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

## Production et limites restantes

| Contrôle restant | Résultat attendu | Statut |
|---|---|---|
| Migrations de cette livraison sur la base de production | Sept migrations appliquées et relues ; RLS active sur les trois nouvelles tables ; aucun helper privé exécutable par anon/authenticated | PASS |
| Build production promu sans reconstruction | `dpl_EfsvKDxDgNwbzCebG9jdtLKtM9rJ`, commit `3a38ad1`, READY ; build 33 s ; base publique production confirmée | PASS |
| Smoke navigateur du build production préparé | 3 PASS sur le build final : accueil/découverte sans erreurs, champs mots de passe indépendants en 390 et 1366 px | PASS |
| Sonde serveur après correction | `/api/health/server` du nouveau build et de mata-beauty.com : HTTP 200, configuration/base/serviceRole vrais | PASS |
| Correction ciblée de la clé serveur Production | Autorisation humaine explicite reçue ; seule variable Production remplacée via mémoire/stdin, type Secret conservé | PASS |
| Promotion et version réellement servie par `https://mata-beauty.com` | Alias exact vers le nouveau déploiement et 15/15 références JS identiques au build testé | PASS |
| Tests navigateur sur le domaine public | 5 PASS : deux tailles pour les mots de passe, absence d’erreurs accueil/découverte, navigation publique, authentification sur sept tailles de 375×812 à 1920×1080 | PASS |
| Créneaux indépendants après correction serveur | 7 prestations contrôlées, format objet valide, nombres de créneaux identiques ; CUA : créneau 10:00, récapitulatif, connexion requise | PASS |
| Régression automatisée indépendante en production | Chromium : 1 PASS (15,7 s) ; WebKit : 1 PASS (8,8 s), format RPC/horaires/récapitulatif/connexion requis contrôlés sans écriture de réservation | PASS |
| Parcours authentifié Client ↔ Professionnel en production | Réservation, affectation, absence/réaffectation et historique vérifiés sur le domaine public | NOT TESTED |
| Réception effective des e-mails d’affectation/réaffectation | Boîte de test réelle consultée, contenu et liens vérifiés | NOT TESTED |
| Employé possédant déjà un accès individuel | Notification et destination vérifiées avec ce profil | NOT TESTED |
| iPhone réel, Safari/Chrome | Choix employé, clavier, scroll et confirmation utilisables | NOT TESTED |
| Android réel, Chrome | Même contrôle physique | NOT TESTED |
| Trackpad physique | Défilement complet des formulaires, de l’agenda et de l’historique | NOT TESTED — PHYSICAL TRACKPAD REQUIRED |

La réception réelle des e-mails, les essais matériels et les parcours authentifiés de production ne sont pas déduits des résultats API QA, unitaires ou du build. Aucun utilisateur authentifié n’est disponible dans le navigateur contrôlé : le site affiche « Se connecter à MATA Beauty ».

Build production promu : `https://mata-beauty-kbznw31cq-africrm.vercel.app`. Métadonnées SHA vérifiées ; `gitDirty=1` provient des rapports sous `docs`, exclus du déploiement, sans modification de code applicatif après le commit. Empreinte SHA256 commune des références JS : `5b438abd80268a4836117fdb325664c00e64a765ff10bd7c876462d3cc4ec250`. Preuve : `work/employee-assignment/production-version-proof.json`. Scan initial du nouveau déploiement après promotion : 50 entrées, aucune erreur/5xx ni avertissement ; ce scan limité n’équivaut pas à une surveillance continue.

## Conservation des données et environnements

- Avant/après les migrations production : les créneaux des sept prestations publiées sont identiques (comparaison nombre et empreinte des horaires sur sept jours) ; huit réservations présentes avant et après.
- Aucune équipe activée implicitement. Les durées calculées incluent les options obligatoires : zéro différence avec le calcul de référence sur le catalogue production.
- Versions enregistrées en production par MCP : `20261011094416`, `20261011094423`, `20261011094426`, `20261011094433`, `20261011094436`, `20261011094440` ; correspondance par nom aux six migrations versionnées dans Git.
- Correctif de format indépendant enregistré ensuite : `20261011095542`. Cette septième migration est appliquée et testée en production ; elle devra être appliquée à la QA lors de sa prochaine reprise (QA actuellement en pause).
- Après les tests navigateur, zéro compte `codex-employee-ui-*` et zéro salon de ces fixtures restant en QA.
- QA remise en pause (`INACTIVE`). `yobalelma_db`, temporairement suspendu avec autorisation, restauré et vérifié `ACTIVE_HEALTHY`.
- Advisors production : aucune nouvelle table sans RLS. Les avertissements SECURITY DEFINER des RPC publiques de disponibilités et des RPC protégées par vérification de propriétaire/compte actif sont explicitement évalués, pas assimilés à une absence de contrôle. Voir [règle Supabase RPC authentifiées](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Réserve historique distincte : HaveIBeenPwned leaked-password protection — BLOCKED BY PLAN — activation possible après upgrade Pro. Aucune activation ou imitation ajoutée dans cette livraison.

## Anomalie préexistante découverte avant promotion

**BUG-SERVER-KEY : sonde serveur 503 — corrigé.** Le premier staging production et l’ancien domaine public renvoyaient tous deux 503 sur `/api/health/server`, alors que les trois tests navigateur publics du staging passaient. Les logs Supabase prouvent deux requêtes serveur Vercel `HEAD /rest/v1/categories` rejetées en 401 à 09:46:40Z et 09:46:59Z ; la même requête avec la clé serveur active du projet répond 200 à 09:47:48Z. Les permissions SQL de `service_role` sont correctes. Cause : clé serveur Production Vercel invalide/refusée. Après un rejet automatique avant exécution, l’utilisateur a explicitement autorisé le transfert sécurisé et le redéploiement. Seule la variable serveur Production a été remplacée, en conservant son type Secret, par mémoire/stdin. Nouveau build et domaine : sonde HTTP 200. Aucune clé exposée au navigateur ni permission élargie.

**BUG-INDEPENDENT-SLOTS : « Invalid Date » — corrigé.** Reproduit sur le domaine après promotion en ouvrant une prestation indépendante. Les tests d’équipe QA et le contrôle du nombre de créneaux ne couvraient pas la forme JSON de cette branche. Cause : `to_jsonb(t)` sérialise en valeur scalaire un résultat PostgreSQL à une seule colonne ; l’interface attend un objet avec `slot_start`. La migration corrective construit explicitement cet objet sans modifier les horaires. Test SQL avant application : 26 horaires conservés par la nouvelle expression. Après application : sept prestations, zéro créneau mal formé, quantités identiques et toujours huit réservations. Contrôle CUA : 26 boutons horaires lisibles, choix 10:00, bon récapitulatif, puis connexion requise ; aucune réservation réelle créée. Aucune modification du module vidéo.

Test de régression reproductible : `tests/remote/independent-booking-availability.spec.ts` avec `REMOTE_APP_URL`, `REMOTE_INDEPENDENT_SERVICE_ID` et `REMOTE_INDEPENDENT_DATE`. Capture production : `work/employee-assignment/independent-booking-production.png`. Les contrôles publics généraux ne constituent pas une recette exhaustive de la lecture de toutes les vidéos.
