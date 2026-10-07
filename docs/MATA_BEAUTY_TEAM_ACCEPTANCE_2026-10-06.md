# Équipe & accès — qualification en cours

Dernière Preview qualifiée : `qsxraezfg`, `dpl_DHr7f9WxZnB7ynJPoeRQ2YYK6kj9`. **28 scénarios RPC PASS et 13 contrôles navigateur PASS**, dont renvoi d’une invitation expirée (horloge de fixture), délai anti-abus, révocation UI, audit MFA et route directe `/admin/administrators`. L’expiration simulée concerne uniquement une invitation de test. Aucun collaborateur réel n’a reçu ces invitations.

Production de départ : `2823b0d`, déploiement `dpl_FYEEh5sb8AztkP4DVBvH5AZG6Cgn`, domaine `https://mata-beauty.com`.
Les changements de cette mission sont d’abord testés avec Supabase QA. Ce document ne constitue pas une validation de lancement.

## Audit de l’existant avant modification

- Next.js 16, React 19, TypeScript strict, Supabase Auth et base Postgres/RLS.
- RBAC existant : `admin_roles`, `admin_permissions`, `admin_role_permissions`, `admin_user_roles` ; profil applicatif `profiles.role`.
- Contrôles centraux : `has_admin_permission`, `is_super_admin`, `admin_mfa_required`, `get_admin_context`.
- MFA Supabase TOTP, condition AAL2 dans les contrôles serveur. Pas de remplacement du mécanisme.
- Sept rôles internes réels : `super_admin`, `admin`, `finance`, `support`, `verification_agent`, `moderator`, `content_manager`.
- Les invitations de salons (`business_invitations`) ne constituent pas des invitations internes et ne sont pas réutilisées comme système d’autorisation.
- Transport existant : Resend ; Supabase Auth utilise également le SMTP Resend. Liens publics canoniques sur mata-beauty.com.
- Les rubriques Administrateurs/Rôles étaient descriptives, sans gestion connectée.
- L’ancienne fonction `admin_assign_role` cumulait les appartenances. Elle ne réalisait pas un remplacement Finance → Support.
- Des branches RLS `is_admin()` donnaient un accès transversal sur plusieurs tables. La restriction conserve les prédicats propriétaire/public et remplace seulement la branche administrative par une permission métier.

## Matrice réelle de référence

| Rôle technique | Affichage | Espace | Permissions métier existantes | Équipe/RBAC |
|---|---|---|---|---|
| super_admin | Super Administrateur | /admin | Ensemble des permissions serveur | Oui, AAL2 requis |
| admin | Administrateur | /operations, /support-agent, /moderation | Utilisateurs, professionnels, réservations, lecture paiements, catalogue, contenu, support, audit, documents | Non |
| finance | Finance | /finance | bookings.read, payments.read, payments.refund, commissions.manage, payouts.manage, audit.read | Non |
| support | Support | /support-agent | users.read, bookings.read, bookings.update, reports.manage, support.manage | Non |
| verification_agent | Onboarding / Agent de vérification | /onboarding | users.read, providers.read, providers.verify, documents.review | Non |
| moderator | Modération | /moderation | users.read, providers.read, bookings.read, reviews.moderate, reports.manage | Non |
| content_manager | Responsable contenu | /operations | providers.read, categories.manage, content.manage, notifications.send, settings.read | Non |

Cette matrice décrit les permissions constatées ; elle ne transforme pas les modules non connectés en fonctionnalités validées. Les nouveaux membres ont `requires_mfa=true`. Les politiques historiques des comptes existants ne sont pas relâchées.

## Changements préparés

- Équipe & accès, invitations en attente, membres actifs/suspendus/révoqués, audit et matrice de permissions en lecture seule.
- Invitation réservée au Super Admin AAL2 ; nom, prénom, e-mail et rôle valide contrôlés côté serveur.
- Table de suivi des invitations avec RLS, sans nouvelle source de permissions.
- Aucun rôle accordé au compte en attente. Activation serveur à partir du seul utilisateur de session vérifié, puis MFA avant tout accès sensible.
- Pas de mot de passe choisi par le Super Admin. Lien Supabase à usage unique et échéance applicative de 24 h ; un lien expiré demande un renvoi.
- Remplacement atomique de rôle, interdiction des changements de son propre accès, protection du dernier Super Admin.
- Suspension/révocation : contrôle DB immédiat, interdiction Auth de nouvelles connexions, sessions Auth supprimées. Réactivation explicite ; un rôle révoqué doit être réattribué avant réactivation.
- Audit des invitations, activations, rôles, statuts et activation MFA sans secret.

## Preuves exécutées

| Environnement | Parcours | Statut | Preuve |
|---|---|---|---|
| QA | 14 scénarios RPC : AAL1 refusé, AAL2 autorisé, Client refusé, doublon d’invitation, activation unique, MFA, changement de rôle, suspension, reconnexion refusée, réactivation, révocation, auto-modification/NULL, audit conservé | PASS | work/team-audit/rpc-results.json |
| Preview pgj588n8i | Super Admin → MFA → Équipe → invitation via formulaire → e-mail Resend de simulation → activation via formulaire mot de passe → MFA membre → Finance | PASS | work/team-audit/ui-results.json |
| Même Preview | API équipe refusée à Finance ; changement de rôle par l’UI et même session : Finance refusé, Support autorisé ; suspension et réactivation via confirmation | PASS | Même fichier |
| Même Preview | Écran Équipe aux dimensions 375×812, 390×844, 430×932, 768×1024, 1366×768, 1440×900, 1920×1080 | PASS | work/team-audit/team-*.png |
| Production | Nouvelle fonctionnalité Équipe & accès | NOT TESTED | Non déployée à ce stade |
| Boîte humaine | Réception d’une invitation par un collaborateur réel | NOT TESTED | Destinataire Resend de simulation utilisé |
| Matériel | Trackpad physique | NOT TESTED | PHYSICAL DEVICE REQUIRED |

## Réserves à fermer avant publication

Tests de permissions étendus à tous les rôles, renvoi/lien expiré, parcours après dernière retouche UI, régressions vidéo/réservation/dossier, migration contrôlée puis recette directe sur production. La matrice globale de recette reste distincte de cette qualification ciblée.

### Mise à jour de qualification

26 scénarios RPC PASS après correction et nettoyage confirmé : six rôles non Super Admin testés, refus de gestion d’équipe et d’auto-promotion, et refus d’archivage d’un salon étranger. Quatre parcours navigateur vidéo/publication/réservation/modération PASS ; deux parcours dossier/MFA PASS sur la Preview `pgj588n8i`.

**BUG-TEAM-01 — Changement de rôle cumulatif.** L’ancienne fonction ajoutait Support sans retirer Finance. Correction : désactivation des anciennes appartenances dans la même transaction. Test : la même session perd `payments.read` et conserve `support.manage`.

**BUG-TEAM-02 — Archivage hors périmètre.** Reproduction sur salon fictif QA : un compte Finance pouvait archiver le salon d’un autre utilisateur via `archive_owned_business`. Cause : branche `is_admin()` trop large dans la RPC, indépendamment des politiques RLS. Correction : propriétaire ou Super Admin ; six rôles non Super Admin refusés sur ce cas. Production non corrigée tant que la migration n’y est pas appliquée.

**BUG-TEAM-03 — Compatibilité de la suspension.** Durant la qualification, un timestamp `infinity` PostgreSQL bloquait la lecture/suppression du compte par Auth. Correction : date finie à 100 ans et maintien du verrou `profiles.is_suspended`. Les données concernées étaient exclusivement les comptes QA de cette mission ; nettoyées après correction.

**TEST-01 — Sélecteurs devenus obsolètes.** Les anciens scénarios cherchaient « Profil » pour ouvrir la connexion visiteur. Le bouton « Se connecter à MATA Beauty », déjà déployé dans `2823b0d`, est désormais reconnu. Les quatre scénarios vidéo et les deux dossier/MFA ont été réexécutés avec succès ; leur premier échec n’est pas présenté comme un défaut vidéo.

Les advisories Supabase comprennent des RPC SECURITY DEFINER exécutables : il faut vérifier leurs contrôles internes individuellement, et non considérer automatiquement tout grant comme une faille. [Documentation du contrôle](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
