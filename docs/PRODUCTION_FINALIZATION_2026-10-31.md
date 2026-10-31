# Mata Beauty — publication de production et état de finalisation

Date : 31 octobre 2026. Domaine canonique : **https://mata-beauty.com**. Projet Vercel `prj_dKh0QiVpaXnzzy9C921NAJyT2toZ`, équipe Africrm. Base de la publication : branche nationale `codex/national-auth-20261031`, code de production précédent `73ec38c04e6dc98cdc189cd9fae5cac80e33d5ef`.

## Correctif prêt pour publication

L’administration peut préparer une attribution de rôle pour un compte existant, par recherche de son adresse exacte. Le compte courant, les comptes suspendus et les résultats ambigus sont refusés. Seuls les champs nécessaires à la confirmation sont renvoyés. Aucun rôle n’est présélectionné.

Le serveur exige un Super Admin avec MFA AAL2 avant la recherche. L’attribution reste sur la procédure existante `admin_assign_role` : contrôles de rôle et MFA indépendants, MFA obligatoire pour le bénéficiaire et journal d’audit. La recherche ne modifie aucun droit, n’envoie aucun e-mail et ne nécessite aucune clé d’administration. La publication du code n’attribue elle-même aucun rôle en production.

Les procédures `admin_list_team`, `require_team_manager` et `admin_assign_role` ont la même définition dans les deux environnements. `admin_list_users` possède la même interface et le même corps fonctionnel, avec des retours de ligne différents. Aucune migration n’est nécessaire pour ce correctif.

## Vérifications avant publication

- 202 tests dans 41 fichiers PASS, dont les 10 nouveaux cas de contrôle des comptes existants.
- 26 contrôles structurels PASS.
- TypeScript PASS ; lint zéro erreur, huit avertissements de navigation préexistants.
- Build propre PASS. Le cache généré local était illisible ; il a été déplacé puis le build a été reconstruit avec succès.
- Parcours de recherche puis préparation de l’attribution vérifié dans Chrome, sur le projet de test, avec le Super Admin et sa MFA.
- Domaine public de production accessible. L’administration de production affiche le contrôle MFA attendu ; cette étape ne constitue pas une validation de tous les parcours internes.
- Inventaire Production en lecture seule : aucune table publique ordinaire sans RLS et aucune vue publique sans `security_invoker`.

## État international et limites

Les champs pays, fuseau et devise des professionnels et salons sont absents du schéma Production au moment du contrôle. Les migrations internationales et leurs correctifs restent dans `mata-beauty-global-test`. Aucun schéma ni donnée de Supabase Production n’a été modifié pendant cette publication.

Dans le test, les parcours serveur Paris/EUR et New York/USD passent : contrats imposés, refus des créneaux invalides, confirmation, notifications locales, annulation/libération, affectation et révocation des collaborateurs. Les quatre défauts de réservation, calendrier, notifications et résultat SQL documentés dans le rapport international sont corrigés dans ce test. Ils ne sont pas annoncés comme corrigés dans la base Production.

Le dossier fictif Studio Test Paris reste en brouillon avec 0/4 documents : son approbation normale n’est pas exécutée. Les parcours navigateur complets Client/Professionnel/Salon/Collaborateur et la concurrence entre transactions distinctes restent à terminer dans le test. Le paiement international en ligne, la délivrabilité SMTP et les traductions complètes ne sont pas certifiés.

**Décision : publication du correctif compatible de gestion des accès ; aucun GO international public complet à ce stade.** La publication du site ne remplace pas la migration et la recette internationales. Aucun paiement réel, notification vers des clients réels ou changement sur YOBALELMA n’est effectué.

## Contrôle après publication

Code publié : `2790d5887218a94342d82943c27c885c73768684`. Déploiement `dpl_G8jPY5FCX1whwUd7e17zBeBqXFDD` READY, cible production, domaine mata-beauty.com attribué sans erreur. Build distant : environ 22 secondes.

Accueil et feed chargés dans Chrome. Recherche publique vérifiée : Vaulx en Velin apparaît sans pays erroné. Le contrôle administratif de production affiche la vérification MFA obligatoire. Les parcours administratifs après cette étape ne sont pas annoncés comme recettés en production. Aucun log error/fatal retourné dans la fenêtre initiale de 15 minutes examinée.

Retour arrière disponible vers le déploiement précédent `dpl_AqAzfBc3F2aiyBBCYW4WWZ9C7Pb2`, code `73ec38c04e6dc98cdc189cd9fae5cac80e33d5ef`, si une régression du correctif apparaît. Aucun rollback n’a été nécessaire au moment du contrôle.

## Recette administrative après MFA en Production

Session Super Admin après MFA observée sur mata-beauty.com/admin. Après rechargement du nouveau build, Équipe & accès affiche le parcours d’ajout d’un compte existant. Une recherche d’adresse fictive inexistante est refusée et n’ouvre aucun dialogue d’attribution. La matrice des permissions serveur se charge, avec sept rôles et aucun message d’erreur. Aucun rôle, compte ou dossier Production n’a été modifié par ces essais. La limite précédemment signalée sur la session MFA de production est donc levée pour ces contrôles.

La bascule internationale reste une opération distincte, décrite dans INTERNATIONAL_PRODUCTION_CUTOVER_2026-10-31.md : onze migrations identifiées par leur SHA-256 et une publication de code coordonnée, avec des conditions de recette encore ouvertes. La mission initiale interdisait les modifications de Supabase Production ; aucune exception n’est présumée à partir de la seule validation MFA.

Correction visuelle relevée pendant ce contrôle : la première colonne de la matrice pouvait couper les noms de rôles au milieu des mots. Une largeur minimale et une règle de retour à la ligne limitée à cette colonne sont ajoutées, sans modifier les permissions ou les autres tableaux.

Publication du correctif visuel : code 0681317b28e9ee18884c4abec2c7a3c61cc9a61a, déploiement dpl_5hpQ1PqT4DpARWqW3pTsDvo9JQGE READY, mata-beauty.com assigné sans erreur. Après rechargement dans Chrome, colonne Rôle mesurée à 192 px et retour à la ligne normal ; les libellés sont visuellement entiers. 202 tests, TypeScript, lint et build repassent avant publication. Aucun log error/fatal sur la fenêtre initiale de 15 minutes examinée. Aucun changement de Supabase Production.
