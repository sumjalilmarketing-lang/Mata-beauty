# Mata Beauty — audit du calendrier, des prestations et des API

Date : 9 novembre 2026. Base de travail : `fbf73882c38d17eaba683319b878ffa643da4686`, branche `stabilization/production-readiness`.

## Conclusion et périmètre

Cette livraison corrige des défauts vérifiés du calendrier, du report professionnel et de la résilience des API. Elle **ne constitue pas une certification exhaustive « zéro défaut »**. Le panier multi-prestations, le report client et l'encaissement réel des acomptes restent absents. Les tests navigateur ont été tentés mais Chromium ne peut pas démarrer dans cet environnement (`socket() failed: Operation not permitted`). Aucun parcours visuel ou multi-compte de production n'est déclaré validé.

Le fichier `2026-11-09-static-inventory.csv` recense tous les modules TypeScript/TSX de `app/`, pages et endpoints compris. Les nombres d'éléments JSX sont des occurrences statiques : ils ne mesurent ni les instances produites par une boucle, ni les états visuels. Ce registre ne remplace pas une recette de chaque bouton.

## 1. Tableau des anomalies

| Fichier / Page | Composant / Bouton ciblé | Type de faille | Criticité | Résultat |
| :--- | :--- | :--- | :--- | :--- |
| `app/mata-beauty-app.tsx` | Réponse RPC de disponibilité | Résilience : données converties par assertion TypeScript sans validation ; date invalide susceptible de faire échouer le rendu | Majeur | Validation Zod discriminée, erreur récupérable, nettoyage du chargement et rejet des réponses périmées après démontage |
| Même fichier | Grille « Mis à jour en direct » | UI : aucune actualisation après le chargement initial | Majeur | Rafraîchissement chaque minute lorsque la page est visible et au retour dans la fenêtre ; libellé corrigé |
| Même fichier | Tuiles date / créneau, chargement | Accessibilité : sélection uniquement visuelle, chargement sans annonce explicite | Mineur | `aria-pressed`, `role=status`, annonce polie |
| `lib/domain/availability.ts` | Génération des créneaux | Logique : règles d'ouverture dupliquées produisant les mêmes créneaux | Mineur | Déduplication par instant UTC |
| Même fichier | Buffer, préavis, indisponibilités | Logique : valeurs négatives/non finies et plages invalides non rejetées ; durée non validée les jours fermés | Majeur | Validation systématique avant génération |
| `supabase/migrations/20261104171000_owner_booking_reschedule.sql` | Déplacer un RDV indépendant | Calendrier : la réservation cible se considère elle-même en conflit | Majeur | Nouvelle migration avec exclusion du seul RDV déplacé |
| Même fichier | Report après modification de durée du soin | Calendrier : validation sur durée actuelle du service au lieu de durée contractuelle conservée | Majeur | Contrôle de tout l'intervalle historique et du buffer, fermetures et autres RDV inclus |
| `app/api/professionals/wallet/route.ts` | Solde professionnel | Résilience : erreur de base masquée en solde nul ; forme JSON différente pour un compte vide | Majeur | Erreur dédiée et forme stable |
| `app/api/payments/{create,refund,confirm-service}/route.ts` | Lecture du corps JSON | Résilience : lecture intégrale sans plafond applicatif, contrairement aux endpoints déjà bornés | Majeur | Lecture bornée et schémas stricts dans cette livraison |
| `app/error.tsx` | Écran d'erreur global | UI : affirmation injustifiée que les données n'ont pas changé après une erreur | Mineur | Invite à vérifier le résultat d'une action avant relance |
| `app/mata-beauty-app.tsx`, contrat SQL de réservation | Choisir plusieurs soins | Fonctionnalité : un seul `provider_service_id`, pas de panier transactionnel de 75 minutes | Majeur | Non implémenté dans cette livraison |
| `app/booking-reschedule.tsx`, RPC de report | Report par le client | Fonctionnalité : RPC réservé au professionnel/propriétaire | Majeur | Non implémenté dans cette livraison |
| `app/api/payments/create/route.ts` | Acompte réel / revenue sharing | Fonctionnalité : encaissement d'acompte explicitement désactivé ; paiement mock/sandbox | Bloquant pour lancement avec encaissement | Fournisseur réel et recette financière à terminer |

## 2. Audit écran par écran

### Fiche et sélection des prestations

Le bouton d'une prestation ouvre une réservation pour ce seul service. Le récapitulatif reprend son titre, son prix, sa durée et sa devise. Le contrat de base recalcule prix et durée : le montant fourni par le navigateur n'est pas une autorité financière.

Le scénario « soin visage 45 minutes + manucure 30 minutes » n'existe pas dans ce parcours. Ajouter des durées dans le navigateur ne suffirait pas : il faut un contrat multi-services en base, une qualification du collaborateur pour tous les soins, une réservation atomique, des lignes de prix historiques et la reprise des politiques d'annulation/paiement.

Les états hover, focus-visible, contraste et navigation clavier de toutes les fiches restent à vérifier en navigateur. Les galeries et images utilisent déjà des composants image, mais aucune mesure de Core Web Vitals n'a été exécutée.

### Modal — étape créneau

| Élément interactif | Comportement observé dans le code / correction | Validation restante |
| :--- | :--- | :--- |
| Fermer / clic sur arrière-plan | Ferme le modal | Focus initial, piégeage et restitution du focus à recetter |
| Tuiles de date | Effacent heure et instant choisis ; sélection annoncée | États hover/focus et dates à minuit en appareil réel |
| Autre date | Champ natif avec minimum au jour local du salon | Saisie invalide et navigateur mobile à recetter |
| Sans préférence | Filtre désactivé, attribution côté base | Concurrence réelle entre deux clients à tester |
| Collaborateur nommé | Filtre strict sur la personne ; ne bascule pas vers un collègue | Photo et longue liste à recetter |
| Créneau horaire | Instant UTC conservé, libellé local avec fuseau, passage au récapitulatif | Rendu DST et clavier en navigateur |
| Réessayer | Nouvelle requête après erreur, réponse validée | Test E2E ajouté, lancement navigateur bloqué |
| Actualiser | Recharge le jour courant | Même limite navigateur |
| Prochaines disponibilités | Recherche sur 14 jours, conserve le collaborateur | Longue latence et changement de sélection à recetter |

La disponibilité chargée est publique et ne contient pas le détail privé des rendez-vous. Le rafraîchissement périodique ne constitue pas un verrou ; la contrainte SQL demeure l'autorité lors de l'enregistrement. La validation Zod empêche un `slot_start` invalide ou un collaborateur incomplet de provoquer un rendu incohérent.

### Modal — confirmation et paiement

Le bouton Confirmer possède un verrou synchrone via ref et un état disabled pendant l'envoi. Un conflit SQL `23P01` renvoie à la sélection et recharge les créneaux. L'adresse à domicile est requise dans l'interface. Le récapitulatif distingue acompte prévu et argent effectivement encaissé. L'encaissement d'acompte est refusé par le serveur ; les méthodes disponibles sont des démonstrations sandbox.

Le système de paiement possède une clé d'idempotence, une empreinte et un verrou sur la réservation. Il ne faut pas assimiler la génération d'un nouvel identifiant de tentative à la preuve d'un double débit. Une recette PSP complète reste nécessaire avant activation réelle.

Les boutons Modifier, Confirmer, méthodes de paiement, adresse et note restent à recetter visuellement avec toutes leurs variantes et une session expirée. Le chemin notification SMS/email n'a pas été exercé sur des destinataires réels.

### Confirmation enregistrée

Le parcours fournit Message, Itinéraire, Ajouter au calendrier, retour d'expérience et Terminer. L'état affiché est une demande en attente de confirmation professionnelle. Ces liens ne sont pas tous parcourus pendant cette exécution ; aucune réussite universelle n'est revendiquée.

### Agenda professionnel et report

La durée, le prix et le collaborateur sont conservés lors du report. Deux contre-exemples ont été reproduits dans une base PostgreSQL embarquée isolée : déplacement partiellement sur son ancien horaire et prestation raccourcie après réservation. La nouvelle fonction privée vérifie l'intervalle occupé réel, ignore seulement la réservation cible et conserve les contrôles de publication, fuseau, grille, préavis, fermetures et chevauchements.

La nouvelle migration ne donne aucun droit public sur le nouvel auxiliaire privilégié. Elle n'a pas été appliquée en production pendant cette livraison. Une base embarquée ne démontre pas une course entre deux connexions PostgreSQL distantes.

### Agenda collaborateur

Inventaire lu : sélection du salon, sélection du jour, début/fin, ajout/suppression des horaires, type d'absence, début/fin de blocage, motif, ajout/suppression d'indisponibilité et réessai. Un verrou synchrone et un état busy existent pour les mutations. La conversion des champs horaires utilise le fuseau du salon. La cohérence des absences avec des RDV déjà acceptés et les états CSS restent à recetter en interface.

### Espace client

Annulation et historique existent ; le report client n'est pas fourni par le RPC professionnel inspecté. La politique publiée est fixée à 48 heures. Cela n'établit pas que chaque remboursement, litige ou cas de retard est correct : les transitions doivent être testées avec les rôles concernés sur une base isolée.

### Portefeuille et écrans d'erreur

Une panne du portefeuille ne doit plus apparaître comme une absence de revenus. La réponse vide conserve les clés normales de solde. L'écran d'erreur global ne promet plus qu'aucune écriture n'a eu lieu lorsqu'une réponse est perdue.

## 3. Architecture, sécurité et couverture A–H

| Phase | Preuves obtenues | Limite |
| :--- | :--- | :--- |
| A — Données | Migrations de services, collaborateurs, disponibilité, réservations, avis et paiement inspectées sur le parcours calendrier | Pas de revue exhaustive de chaque colonne/ORM ni de contrat multi-services |
| B — Auth / RBAC | RLS activé en production sur les sept tables contrôlées ; contrôles d'identité/propriété lus sur report et API financières | RLS activé ne prouve pas à lui seul l'étanchéité de toutes les politiques |
| C — Recherche | Filtres locaux, géolocalisation et catalogue identifiés | Pagination, URL, volumétrie et chaque catégorie non recettées |
| D — Fiche / soins | Sélection mono-service, prix/durée côté base | Variantes et panier multi-services à achever |
| E — Créneaux | Validation, fuseaux/DST, préavis, buffer, report corrigés ; exclusion GiST présente en production | Pas de test distant simultané ni de recette navigateur réussie |
| F — Paiement | Idempotence et verrou du paiement inspectés, lectures bornées ajoutées | Sandbox uniquement ; acomptes réels, SMS/email et partage de revenus non validés |
| G — Pro | Report et calendrier collaborateur inspectés | Recette jour/semaine, encaissement et rôles multiples non exhaustive |
| H — Client | Politique 48 h et parcours existants identifiés | Report client absent et recette complète des annulations/remboursements restante |

Contrôle de métadonnées en production, en lecture seule : RLS actif sur `bookings`, `payments`, `provider_services`, `collaborators`, `availability_rules`, `availability_exceptions`, `reviews`. La contrainte `bookings_no_active_resource_overlap` utilise GiST sur professionnel, ressource et intervalle `[)` pour les statuts pending/confirmed/in_progress. Les déclencheurs de verrou, contrat, préavis et validation sont installés. Le défaut du report indépendant a également été confirmé dans la définition installée.

Les advisors de sécurité signalent notamment 14 tables RLS sans politique, 17 fonctions SECURITY DEFINER accessibles à anon, 213 accessibles aux comptes authentifiés, et pg_net dans public. Ces chiffres sont des points de revue, pas 245 vulnérabilités prouvées : certaines tables sont volontairement fermées et certaines fonctions publiques servent la découverte. Ne pas désactiver RLS ni révoquer en masse les RPC sans analyse de leur corps et de leurs appelants. Références : [fonctions accessibles anonymement](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## 4. Sources complètes et validation

Tous les fichiers modifiés sont livrés intégralement dans cette branche ; aucun remplacement par du pseudo-code ou commentaire « reste inchangé ». Voir le diff pour les changements, et la vue complète de chaque fichier pour le code intégral. Les tests et la migration accompagnent le code applicatif.

Premier passage complet : lint sans erreur (8 avertissements préexistants), TypeScript réussi, 131 fichiers / 816 tests Vitest réussis, build Next.js réussi. Après intégration des nouveaux tests SQL/API : **134 fichiers / 837 tests réussis**, TypeScript strict et build de production réussis, lint sans erreur et 8 avertissements préexistants. Le garde-fou qualité complet s’est terminé avec le code 0. Une seconde vérification TypeScript couvre le dernier ajustement de gestion d’erreur du calendrier.

Tests navigateur ciblés tentés : trois échecs de lancement Chromium avant exécution des scénarios, erreur d'environnement `socket() failed: Operation not permitted`. Les tests ne sont ni supprimés ni marqués réussis. Aucun déploiement ni migration de production effectué.

La livraison reste à valider dans un environnement disposant d'un navigateur fonctionnel, puis sur un projet de recette isolé avec deux sessions simultanées. Les fonctionnalités manquantes listées dans le tableau restent nécessaires pour satisfaire l'intégralité de la mission initiale.
