# Mata Beauty — audit transversal du 6 novembre 2026

## Conclusion

Les espaces client, professionnel, salon et collaborateur ont été inspectés sur la production avec le compte autorisé connecté. Le rendu serveur de 109 routes, réparties sur les 12 espaces, a aussi été vérifié avec des profils synthétiques isolés. Aucun échec de rendu n'a été observé dans cette matrice.

Cela ne constitue pas un GO sans réserve pour toutes les actions, tous les comptes et tous les appareils. La recette interactive multi-session des services internes et les essais sur téléphones physiques restent à compléter. Le paiement en ligne est désactivé en production.

## Corrections de cet audit

1. **Feed et sécurité** : la vue `social_feed` ne conservait plus `security_invoker=true`. Rétablissement des politiques RLS du demandeur et restriction des privilèges de la projection publique à la lecture. Migration `restore_feed_rls` appliquée en production. Huit publications restent visibles en lecture anonyme et authentifiée ; aucun service non publié ou archivé exposé dans le contrôle. Le diagnostic Supabase ne signale plus de vue SECURITY DEFINER en erreur.
2. **Session collaborateur** : arrêt des appels à la RPC privée sans session et suppression de l'état d'accès précédent lors d'un échec de vérification. Aucun droit anonyme supplémentaire accordé.
3. **Agenda collaborateur** : prise en compte des vrais statuts `cancelled_by_client` et `cancelled_by_provider`. Les annulations quittent le planning quotidien et hebdomadaire, restent dans l'historique et sont retrouvées par le filtre Annulé. Ajout des filtres Absence et Litige et traduction du libellé Annulé.
4. **Réservations professionnelles** : ajout d'un indicateur pendant le chargement pour éviter une liste temporairement vide sans explication.

## Couverture par espace

| Espace | Vérifications et résultat | Limites |
|---|---|---|
| Client | Profil et édition ouverts, photo existante chargée, indicatifs pays présents ; réservations groupées ; trois conversations chargées ; prestation terminée proposée pour avis | Pas de changement de photo/identité ni de message envoyé en production pendant cet audit |
| Professionnel | Tableau de bord et réservations ouverts ; réservation terminée visible avec avis reçu 5/5 et action d'évaluation client ; rubrique Avis accessible | Acceptation/refus d'une nouvelle réservation non exercés sur une réservation réelle |
| Salon | Accueil King coiff, trois collaborateurs, états d'invitation/accès visibles ; catalogue et saisie libre accessibles | Salon de test ; invitations et changements d'accès non envoyés pendant cet audit |
| Collaborateur | Redirection `/staff`, profil et photo, formulaires de paramètres, prestations sélectionnées, tâches, disponibilités et messagerie ouverts | Aucune tâche assignée et aucune conversation autorisée pour cet accès ; transfert et réception de nouvelles affectations non rejoués en production |
| Commercial | Dix routes rendues côté serveur avec responsable synthétique ; permissions/navigation revues | Pas de session réelle commerciale utilisée, pas de pointage GPS effectué |
| Finance | Quatorze routes rendues avec rôle synthétique ; API wallet anonyme refusée | Aucune opération financière réelle ; paiement en ligne désactivé |
| Service client | Dix routes rendues avec rôle synthétique | Traitement de ticket réel non effectué |
| RH | Dix routes rendues avec responsable synthétique | Pas de session réelle RH utilisée ; aucune donnée RH modifiée |
| Validation/onboarding | Neuf routes rendues avec agent synthétique | Pas de décision sur un dossier réel |
| Modération | Sept routes rendues avec modérateur synthétique | Aucun contenu réel modéré |
| Opérations | Huit routes rendues avec gestionnaire synthétique | Aucune publication/suppression réelle |
| Super Admin | Route équipe rendue avec rôle synthétique ; contrôles de permission et refus anonymes vérifiés | Le tableau de bord client Super Admin et son MFA ne sont pas validés de bout en bout par cette recette SSR |

Les comptes client et Super Admin ont respectivement une seule route dans l'inventaire SSR : leurs menus chargés côté navigateur ne sont pas inclus dans ce décompte. Les contrôles client en production complètent cette limite ; les actions Super Admin restent partielles.

## Sécurité et API

- Toutes les tables publiques inspectées ont RLS activé.
- En contexte anonyme : `is_admin=false`, `is_super_admin=false`, permission de remboursement refusée ; feed public toujours lisible.
- API sans session : wallet professionnel 401, équipe salon 401, équipe administrative 403, équipes départementales 403.
- `/api/health/server` répond 200 avec `ok=true`.
- La contrainte atomique `bookings_no_active_resource_overlap` existe et couvre les rendez-vous pending, confirmed et in_progress par intervenant. Présence vérifiée ; test de concurrence réel non rejoué.
- Après correction, les avertissements Supabase restants portent sur une extension publique, les RPC SECURITY DEFINER et douze tables sans politique directe, dont des tables privées ou pilotées par RPC. Ce ne sont pas des erreurs automatiquement exploitables ; leur revue exhaustive fonction par fonction reste ouverte.

## Validation technique

- ESLint : zéro erreur, huit avertissements préexistants.
- TypeScript strict : réussi.
- Vitest : **620 tests / 106 fichiers réussis**.
- Build Next.js : réussi.
- Recette serveur locale : **109 routes / 12 espaces**, profils synthétiques, aucune erreur de rendu. Les données sont fictives ; cela ne valide ni Auth réel, ni RLS distant, ni hydratation/interactions navigateur.
- Recette SQL en transaction annulée : RLS du feed, absence de droits d'écriture sur la vue, RPC collaborateur privée et visibilité publique vérifiés.
- La suite Playwright interactive locale n'a pas pu lancer Chromium : `socket() failed: Operation not permitted`. Il s'agit d'une limite de l'environnement de test, pas d'une preuve de dysfonctionnement de la plateforme. Ces tests ne sont pas comptés comme réussis.
- Logs Vercel sur les vingt minutes consultables : aucun événement error/fatal retourné. La fenêtre d'une heure a été refusée par la rétention de l'offre ; aucune conclusion au-delà de la fenêtre consultable.

## Points à terminer avant un GO complet

1. Recette réelle avec sessions séparées propriétaire, collaborateur, client et chaque département : invitation acceptée, réservation, affectation, acceptation/refus, transfert, message, accusé de lecture et avis réciproques.
2. Tests physiques iPhone/iPad, Android et ordinateur : navigation fixe, mises à jour PWA, badges et notifications hors application, avec permission et son du système.
3. Paiement : `/api/payments/capabilities` annonce `onlineCheckoutEnabled=false`, fournisseur `none`. Ne pas présenter le paiement en ligne comme opérationnel.
4. Revue complète des RPC privilégiées et des droits d'accès aux documents privés ; les contrôles de cet audit ne prouvent pas l'absence de toute vulnérabilité.

Aucune donnée client, réservation, identité ou droit utilisateur n'a été modifié par les vérifications. Seule la configuration de sécurité de la vue a été corrigée côté base. Les correctifs d'interface et les preuves sont versionnés avec ce rapport.
