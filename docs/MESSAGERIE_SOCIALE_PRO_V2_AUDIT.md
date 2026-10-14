# MATA Beauty — audit initial de la messagerie sociale et professionnelle V2

Date de l'audit : 2026-10-13. Branche de travail : `codex/social-messaging-v2`.

## Architecture existante

Le produit dispose déjà d'un système de conversations unique, utilisé pour les messages directs et ceux associés aux réservations. `public.conversations`, `public.conversation_members` et `public.messages` en sont le socle. Les migrations `20261011101004_conversation_multimedia_foundation.sql` et `20261011102928_conversation_history_pagination.sql` ajoutent les identifiants des parties, l'historique paginé, les non-lus, la confirmation de lecture, les notifications et le rattrapage après interruption Realtime. L'ouverture directe d'une conversation professionnelle passe par `ensure_provider_conversation`; les réservations obtiennent une conversation par `ensure_booking_conversation` et le trigger d'insertion.

Les médias conversationnels sont déjà séparés des médias publics du feed. `message_attachments` référence un stockage privé; l'API `/api/messages/media` réserve un envoi idempotent, signe un upload, valide le fichier côté serveur, publie un chemin canonique distinct et délivre des URLs de lecture temporaires aux participants. La politique de format/volume existante accepte les images JPEG/PNG/WebP jusqu'à 10 Mo et les vidéos MP4 jusqu'à 20 Mo et 60 secondes.

Les prestations et catalogues peuvent déjà être partagés dans le fil. Le modèle `conversation_quotes` et ses RPC couvrent brouillon, envoi, acceptation/refus et conversion vers le parcours de réservation. Le paiement est indépendant du devis et reste soumis aux règles du produit (mode mock tant qu'un fournisseur n'est pas validé).

Le modèle salon demeure dans l'espace Professionnel. La migration de collaborateurs présente dans l'arbre de travail lie les permissions au salon et synchronise la participation aux conversations à partir des réservations assignées. Les invitations passent par des routes serveur dédiées. Le composant partagé `ConversationMessages` reçoit actuellement une option d'interface `canReply`; les contrôles de base d'accès aux messages et médias doivent rester côté SQL/API, cette option n'étant qu'un reflet de permission.

## Fonctionnalités V2 absentes ou incomplètes

- Aucune table ni RPC `Stories` n'existe. `posts.post_type` autorise vidéo, photo, avant/après, promotion et disponibilité, sans type éphémère. Aucun échéancier n'expire actuellement les médias Stories.
- Il n'existe pas de modèle de demande de premier message avec états en attente, accepté, refusé ou bloqué; la conversation directe est créée par une RPC existante avec limitation de fréquence.
- Les conversations liées aux réservations sont attribuées au collaborateur via l'affectation de réservation et les droits de lecture/réponse. Un journal métier complet des réattributions et révocations doit être vérifié/complété avant de revendiquer un historique d'administration.
- L'interface actuelle est répartie entre le module Messages du compte Client, l'espace Professionnel et l'entrée Agenda. Elle n'a pas encore de centre social unifié réunissant Stories, activités, demandes et recherche globale.
- Le partage du catalogue/prestation, les devis et le lien vers la réservation existent déjà : ils doivent être conservés, pas réimplémentés.

## Architecture retenue pour la suite

Conserver `conversations/messages` comme unique système. Ajouter les demandes de message à ce modèle (état et transitions validées côté serveur) plutôt que créer une seconde messagerie. Étendre l'affectation salon avec un historique append-only des changements d'accès et invalider immédiatement membership, Realtime et accès média à la révocation.

Implémenter Stories dans des tables dédiées référençant le professionnel, les médias privés, la prestation éventuelle, l'instant d'expiration et le statut de modération. N'exposer que les Stories publiées et non expirées par une RPC limitée; contrôler expiration et droit d'accès côté serveur. Séparer ces objets du feed permanent. Prévoir un nettoyage serveur idempotent des objets expirés, sans suppression d'objets encore référencés. La création utilisera le même principe de validation média côté serveur que les pièces jointes.

La couche UI réutilisera les composants de conversation, devis et médias existants. Les nouvelles chaînes devront respecter le système de locale et toutes les dates seront stockées en UTC puis rendues selon le fuseau/localité de l'utilisateur. Les permissions d'une équipe salon resteront explicites et privées; aucune permission interne ne sera replacée dans une projection publique de `collaborators`.

## Phases d'implémentation et validation

1. Stabiliser la branche et le test PostgreSQL/Supabase local isolé; ne pas écrire sur les projets distants.
2. Ajouter les demandes de message, états et transitions atomiques, politiques RLS/RPC et tests d'isolation client/professionnel.
3. Ajouter Stories, expiration serveur, modération, médias privés, réponse par conversation et tests de rétention/nettoyage.
4. Ajouter l'historique des affectations salon et le centre social responsive en réutilisant les modules existants.
5. Exécuter lint, typecheck, unitaires, SQL/RLS local, E2E par rôles et tests mobile/desktop; puis créer une Preview QA séparée et la valider avant toute publication.

## État vérifié lors de l'audit

- Unitaires : 146 PASS (30 fichiers).
- Smoke : 23 PASS.
- TypeScript : PASS.
- Lint : PASS, avec deux avertissements `<img>` dans `app/conversation-media.tsx`.
- Build Next.js : PASS.
- E2E local simulé de réservation : 8 PASS dans `tests/e2e/booking-audit.spec.ts`; ces tests interceptent les services et ne prouvent pas un échange réel entre deux comptes Supabase.
- PostgreSQL local/Supabase CLI/Docker dans cet environnement : non disponibles au contrôle initial (`psql`, `postgres`, `pg_ctl`, `supabase`, `docker` absents). Les tests SQL d'une nouvelle migration ne peuvent donc pas être déclarés PASS avant disponibilité d'un moteur isolé.
- Aucune migration distante, écriture de données, publication Production ou déploiement Vercel n'a été effectué dans cette phase d'audit.

## Implémentation préparée sur `codex/social-messaging-v2`

Cette branche ajoute une première tranche V2 au modèle existant, sans dupliquer `conversations/messages` :

- L'inbox mobile propose les filtres « Tout », « Non lus » et « Demandes », une recherche conservée, un compteur non lu et une barre Stories horizontale.
- Les demandes directes restent des lignes de `conversations`. Les nouvelles conversations directes commencent en attente; une RPC réservée au professionnel accepte ou refuse la demande. Le serveur n'autorise qu'un message initial avant acceptation et aucune réponse après refus. Les fils de réservation existants restent acceptés.
- Les Stories professionnelles sont indépendantes des publications permanentes. Le média est envoyé par URL signée vers un bucket privé, puis téléchargé et validé côté serveur avec les validateurs médias existants. Les images utilisent les limites existantes; les vidéos sont limitées à 15 secondes. Le flux public ne signe que les Stories actives de profils approuvés; la prestation associée mène à la page de service existante et la réponse ouvre une conversation existante.
- La publication de Stories est accessible dans les espaces Pro approuvés et Salon. Pour l'instant elle est réservée au compte professionnel responsable; l'attribution d'accès Story aux collaborateurs reste à ajouter au modèle de permissions.
- L'espace Messages Pro/Salon reçoit un contrôle d'attribution pour les conversations associées à un rendez-vous du salon. La RPC vérifie la propriété du salon, l'accès au compte Pro, le droit `messages.read` et la disponibilité du collaborateur, puis réutilise `reassign_booking_collaborator` pour conserver le journal existant, les contrôles de calendrier, les notifications et la synchronisation d'accès.
- Le nettoyage des Stories expirées et téléversements abandonnés est ajouté au worker cron existant. La lecture les exclut dès expiration, même avant le prochain nettoyage.

Fichiers V2 ajoutés ou modifiés : `app/api/stories/route.ts`, `app/conversation-assignment.tsx`, `app/workspace-messaging.tsx`, `app/workspace-module.tsx`, `app/conversation-messages.css`, `app/api/cron/notifications/route.ts`, `lib/messaging/cleanup.ts`, les trois migrations `20261013190000`, `20261013191000`, `20261013192000`, et les tests `tests/domain/social-messaging-v2-security.test.ts`, `supabase/tests/social_messaging_v2_security.sql`.

Les migrations sont seulement préparées. Aucun PostgreSQL/Docker/Supabase CLI isolé n'est disponible ici; le test SQL et les parcours réels API/RLS sont donc **BLOCKED**, et aucune migration n'a été appliquée à QA ou Production. Les tests vitest incluent des assertions de contrats de sécurité statiques, qui ne remplacent pas le test SQL/RLS.

## Finalisation de la prévisualisation visuelle — 13 octobre 2026

La route `/messaging-v2-demo` présente une démonstration clairement marquée avec profils Client, Professionnel indépendant, Responsable de salon et Collaborateur. Stories, demandes, réponses, envoi et attribution sont des scénarios locaux fictifs. La route importe uniquement son composant et son style de démonstration; `proxy.ts` la laisse passer avant toute initialisation Supabase. Le test E2E observe le trafic et exige zéro requête vers `*.supabase.co`.

La Preview de la branche `codex/social-messaging-v2` active `MESSAGING_V2_DEMO_ONLY=true` par variable Vercel ciblée sur cette seule branche. Le proxy redirige toutes les pages hors démo vers `/messaging-v2-demo` et renvoie 404 aux API avant l'initialisation du client Supabase. Les pages et API fonctionnelles V2 restent donc inaccessibles dans cette Preview fictive; les tests réels nécessitent un environnement local/QA isolé après application contrôlée des migrations.

La Preview Vercel `africrm/mata-beauty` existe et son environnement Preview a été vérifié en lecture seule : `NEXT_PUBLIC_SUPABASE_URL` cible le projet QA `kazlvtxkbsdhbfvtqqdp`; la Production Vercel cible `qjdwxdbvrxedyfolnpol`. La page de démonstration ne contacte aucun des deux. Les variables d'environnement du projet n'ont pas été modifiées. Une démo visuelle réussie ne valide ni API, ni compte réel, ni RLS, ni Realtime.

### Dépendances statiques des migrations

| Migration V2 | Dépendances observées dans les migrations locales | Vérification requise avant application isolée |
|---|---|---|
| `20261013190000_social_stories_v2.sql` | `profiles` (`first_name`, `last_name`, `avatar_url`, `account_status`, `is_suspended`), `provider_profiles` (`profile_id`, `business_name`, `status`), `provider_services` (`id`, `provider_id`, `title`, `is_active`), schémas `auth`, `storage`, rôle `service_role` | Confirmer ces colonnes/fonctions; bucket privé; RLS activé; `storage_path` non lisible par anon/authenticated; RPC de listing exécutable uniquement par service_role. |
| `20261013191000_conversation_message_requests.sql` | `conversations`, `conversation_members`, `messages`, `notifications`, `profiles`; fonctions `messaging_private.active_account` et `messaging_private.conversation_summaries`; schéma `booking_private.collaborator_access` de `20261013130000_salon_collaborator_access.sql` | Appliquer après les migrations de conversation (`20261011101004`, `20261011102928`) et le socle salon; tester message unique en attente, refus, participant opposé, spam, curseur/pagination, permissions des RPC et contraintes sur les anciennes lignes. |
| `20261013192000_conversation_assignment_audit.sql` | `businesses`, `bookings`, `collaborators`, `booking_private.collaborator_access`, `booking_private.can_assign`, `public.reassign_booking_collaborator(uuid,uuid,text)` et `booking_assignments` issus de `20261008170112_employee_booking_assignment.sql` | Appliquer après la migration du socle d'équipe `20261013130000` et l'affectation de rendez-vous; tester propriétaire d'un autre salon, collaborateur sans `messages.read`, conflit d'agenda et historique/notifications existants. |

Cette analyse statique confirme l'ordre des dépendances dans le dépôt, pas l'équivalence du schéma QA, qui n'a pas été interrogé ni modifié. La migration salon `20261013130000` doit elle-même avoir été validée et appliquée dans la base **isolée** avant les deux migrations qui lisent `booking_private`; ne pas déduire sa disponibilité de son seul fichier local.

### Plan de recette réelle Supabase / RLS / Realtime préparé

1. Démarrer un projet Supabase local jetable dont la configuration ne contient aucune référence QA, Production ou YOBALELMA; appliquer les migrations versionnées dans l'ordre et vérifier l'identité locale avant chaque commande.
2. Créer quatre utilisateurs et deux salons distincts (client, propriétaire du salon A, collaborateur du salon A, propriétaire du salon B) avec profils/horaires/réservations déterministes. Conserver les IDs de test uniquement dans l'environnement isolé.
3. En session anon, vérifier aucune Story privée, aucun jeton/chemin média et aucun RPC interne; en session Client, créer une demande et son unique premier message; vérifier le statut `pending`, refus d'un deuxième message avant décision, puis test acceptation/refus et idempotence.
4. En session propriétaire A, accepter une demande, attribuer seulement à un collaborateur A autorisé et disponible, vérifier l'événement `booking_assignments` et les notifications. Répéter avec collaborateur sans `messages.read`, propriétaire B et horaire conflictuel : chaque appel doit échouer sans modifier la réservation.
5. En Realtime, ouvrir un canal avec compte A et vérifier réception d'un changement autorisé; répéter avec compte B et non authentifié et exiger absence d'accès aux événements de A. Vérifier le rattrapage HTTP après reconnexion. Cette vérification WebSocket/RLS reste à exécuter sur Supabase local, car aucun moteur PostgreSQL/CLI/Docker n'était disponible.
6. Exécuter `supabase/tests/social_messaging_v2_security.sql` ainsi que `pnpm test`, `pnpm test:smoke`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, puis les tests navigateur authentifiés avec des comptes jetables avant de considérer une Preview connectée à cette base.

Les critères RLS/Realtime suivent la documentation officielle Supabase : [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization), [private Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
