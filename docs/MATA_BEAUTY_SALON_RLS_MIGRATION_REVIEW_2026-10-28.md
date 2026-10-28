# MATA Beauty — revue préalable Salon / RLS — 2026-10-28

> **État : préparé, non appliqué.** Aucune commande DDL/DML de ce lot n’a été exécutée sur Supabase Production.

## SQL exact soumis à autorisation

L’autorisation finale porterait exclusivement sur ces deux fichiers, dans cet ordre :

1. [`20261015001940_salon_collaborator_access.sql`](../supabase/migrations/20261015001940_salon_collaborator_access.sql) — 456 lignes — SHA-256 `F9866404E6427C8E5F9C81ADB28CE180947042CB111AB9B6B251C6D3E8F485E0`.
2. [`20261028083825_production_health_security.sql`](../supabase/migrations/20261028083825_production_health_security.sql) — 23 lignes — SHA-256 `090CB29B1B5465B308F519304B298BE42ED623718CE25C814B95799D8C937CCD`.

Les fichiers sont le SQL exact : pas de SQL généré dynamiquement ni de migration globale. Toute modification, même d’un espace, invalide les empreintes et impose une nouvelle revue.

## État Production constaté en lecture seule

- Projet `qjdwxdbvrxedyfolnpol`, région `eu-central-1`, statut `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Plan Pro. Dernière sauvegarde physique exploitable affichée : **27 octobre 2026 à 23:09:03 UTC** ; six sauvegardes quotidiennes antérieures sont également proposées à la restauration.
- PITR : **non activé**. La récupération prévue pour ce lot est donc la restauration physique quotidienne, complétée par le rollback SQL transactionnel tant que la transaction n’est pas validée.
- Les objets Storage ne sont pas inclus dans la sauvegarde de base. Cette migration ne modifie aucun objet Storage.
- `booking_private` existe et n’accorde actuellement aucun accès à `anon` ou `authenticated`.
- RLS est activée sur `bookings`, `business_invitations`, `collaborators`, `conversations`, `conversation_members` et `messages`.
- Volumes avant migration : 1 salon, 0 collaborateur, 0 invitation, 10 réservations, 0 réservation affectée, 78 conversations, 20 membres de conversation, 16 messages.
- Les fonctions `get_admin_context`, `has_business_commercial_permission` et `has_conversation_access` sont actuellement exécutables par `anon`; le second script retire uniquement cet accès anonyme.

## Différence attendue

### Salon

- Ajout de trois tables privées avec RLS dans `booking_private` : accès collaborateur, secrets d’invitation et journal d’événements.
- Ajout de l’état d’envoi, des permissions, de l’accepteur et du collaborateur à `business_invitations`.
- Suppression de l’accès direct public/anon/authenticated à `business_invitations`; les opérations passent par des RPC vérifiant le propriétaire.
- Réduction des colonnes publiquement lisibles de `collaborators`; les données d’accès restent privées.
- Ajout des RPC propriétaire/collaborateur et de l’audit d’invitation.
- Extension contrôlée des réservations et conversations au collaborateur affecté disposant des permissions privées actives.
- Remplacement de la policy d’insertion des messages par une policy autorisant les participants ou le collaborateur affecté avec `messages.reply`.

### Sécurité complémentaire

- Les futures fonctions ne reçoivent plus implicitement `EXECUTE` pour `PUBLIC`, `anon` et `authenticated`.
- Trois helpers privilégiés deviennent authenticated/service-role uniquement.
- Ajout d’index idempotents pour les lectures RLS et la boîte de réception.

## Compatibilité des flux légitimes

- **Invitations** : création/révocation/listing réservés au propriétaire ; acceptation réservée à l’utilisateur authentifié dont l’email correspond au hash d’invitation. Le token brut n’est jamais stocké.
- **Collaborateurs** : les droits sont séparés de la fiche publique et révocables ; `bookings.manage` implique `bookings.read`, `messages.reply` implique `messages.read`.
- **Réservations** : cliente et prestataire gardent leurs accès actuels. Le salon propriétaire garde ses policies. Le collaborateur n’obtient que la réservation qui lui est affectée et ne peut pas la réaffecter.
- **Messagerie** : cliente et prestataire restent membres. Le collaborateur affecté n’est admis qu’avec `messages.read`; l’envoi exige en plus `messages.reply`. La révocation retire l’accès et archive son membership.
- **Données existantes** : aucune ligne collaborateur, invitation ou réservation affectée ne doit être migrée aujourd’hui. Les 10 réservations, 78 conversations et 16 messages existants ne sont ni supprimés ni réécrits.
- **Fonctions existantes** : la migration remplace explicitement `validate_booking_update`, `is_conversation_member` et `ensure_booking_conversation`; les signatures consommées par l’application restent identiques.

## Dépendances vérifiées

- Schéma `booking_private`, tables `profiles`, `businesses`, `business_invitations`, `collaborators`, `bookings`, `conversations`, `conversation_members`, `messages`, `notifications`.
- Colonnes `bookings.business_id`, `bookings.collaborator_id`, `collaborators.profile_id`, `collaborators.internal_role` présentes.
- Trigger de validation des réservations et trigger de synchronisation des conversations déjà présents.
- Contrainte unique `conversations(booking_id)` déjà présente.
- Les tests structurels contrôlent les RPC sensibles, les révocations, les policies et l’absence d’accès aux tables privées.

## Procédure d’application ciblée

1. Reconfirmer que la sauvegarde physique du 27 octobre reste disponible et noter une nouvelle sauvegarde si elle existe.
2. Recalculer les deux SHA-256 et interrompre si l’une diffère.
3. Refaire les compteurs et l’inventaire ACL/RLS en lecture seule.
4. Appliquer uniquement le script Salon via l’API de migration Supabase.
5. Exécuter immédiatement les contrôles post-migration ci-dessous.
6. Appliquer ensuite uniquement le script de sécurité complémentaire.
7. Rejouer les contrôles, advisors, tests d’accès autorisé/refusé et smoke tests Preview/Production.
8. N’activer `NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED` en Production qu’après réussite complète.

## Contrôles post-migration obligatoires

- Les deux versions apparaissent une seule fois dans l’historique distant.
- Les trois tables privées existent, RLS est active et seul `service_role` a des droits de table directs.
- `anon` ne peut ni lire les invitations/secrets/audits ni exécuter les RPC privilégiés.
- Un propriétaire peut inviter/lister/révoquer ; un non-propriétaire reçoit `42501`.
- Une invitation valide peut être acceptée une seule fois par le bon email ; expiration, révocation et mauvais email sont refusés.
- Un collaborateur affecté et autorisé voit sa réservation et sa conversation ; un autre collaborateur ne les voit pas.
- Révocation : plus de lecture/réponse et membership archivé.
- Cliente/prestataire/propriétaire conservent réservation, messages et notifications.
- Advisors Supabase, logs Postgres/Auth/Realtime et tests applicatifs ne montrent aucune erreur critique.

## Conditions d’arrêt

Arrêt immédiat, sans activation du feature flag, si : empreinte différente, sauvegarde indisponible, objet/dépendance absent, échec transactionnel, compteur inattendu, nouvelle erreur advisor critique, accès anonyme résiduel, accès légitime cassé, ou fuite inter-salon/inter-conversation. En cas d’échec avant `commit`, la transaction est annulée. Après `commit`, restauration vers la sauvegarde physique validée ou migration corrective minimale et revue séparément ; aucune correction improvisée en Production.

