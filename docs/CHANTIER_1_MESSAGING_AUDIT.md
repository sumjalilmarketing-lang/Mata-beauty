# Chantier 1 — audit de la messagerie existante

Date : 11 octobre 2026. Phase 1, lecture seule du code et des métadonnées de production. Ce document ne contient aucune conversation, identité personnelle, clé ou URL signée. Aucune modification applicative, de schéma, de configuration ou de déploiement n'a été effectuée pour cet audit.

## Conclusion

La messagerie texte liée aux réservations est déjà opérationnelle dans le frontend. Un socle plus riche **existe également en production mais n'est pas utilisé par ce frontend** : pièces jointes images privées, types de messages, nonce d'envoi, liste enrichie des conversations, archivage, blocage et autorisations support temporaires. Il faut raccorder et renforcer ce socle, pas créer un deuxième système de conversations ou un deuxième bucket de médias privés.

Le schéma réel de production est plus complet que les migrations locales retrouvées. Une migration de convergence devra restaurer les contrats nécessaires en QA sans supprimer les données ni élargir les permissions de production.

## Sources et portée des preuves

- Spécification utilisateur : pièce jointe `f4930873-dac7-4b12-a5b6-a9a71e612b8e/Texte collé.txt`.
- Projet production inspecté : `qjdwxdbvrxedyfolnpol` ; requêtes limitées à `information_schema`, catalogues PostgreSQL, définitions de fonctions/policies/triggers et configuration des buckets.
- QA `kazlvtxkbsdhbfvtqqdp` : tentative de lecture des colonnes échouée avec `Connection terminated due to connection timeout`. **BLOCKED pour la comparaison live QA**, aucun changement de son état.
- `docs/MATA_BEAUTY_MESSAGING_ACCEPTANCE_2026-10-08.md` documente les anciens tests QA et les limites matérielles/production. Ces résultats historiques ne constituent pas une nouvelle exécution du chantier.
- Aucune recette navigateur ni mutation de données utilisateur pendant cet audit : scénarios nouveaux **NOT TESTED**.

## Frontend, routes et comportement actuel

| Élément | Contrat actuel | Réemploi / écart |
|---|---|---|
| `app/workspace-messaging.tsx` | Charge les 100 dernières réservations par `starts_at DESC`, affiche date/prestation/statut, ouvre `BookingMessages` | Remplacer la source de liste par le contrat de conversations enrichi existant ; avatar, dernier message, heure, non-lus actuellement absents |
| `app/booking-messages.tsx` | `ensure_booking_conversation`, SELECT messages, pagination 50, Realtime INSERT + polling 10 s/online/focus, accusé de lecture, texte 1–4000 caractères | Réutiliser le moteur de synchronisation ; introduire types de messages/cartes/pièces jointes et raccord RPC d'envoi |
| `app/message-bubble.tsx` | Bulle partagée, texte multiligne, expéditeur à droite, horodatage | Étendre le rendu pour média/carte sans recréer les couleurs et le positionnement |
| `app/readability.css:263` | Paires fond/texte explicites, bulles reçues neutres et envoyées rose `#85124f`, texte 15 px, horaires 12 px, hauteur dynamique, focus clavier, navigation mobile masquée pendant saisie | Conserver ce socle de lisibilité |
| `app/api/bookings/conversation-context/route.ts` | Bearer vérifié par `getUser`, lecture booking sous RLS, vérification explicite client/provider, lecture serveur du seul nom public ; réponse `{name, startsAt, status}`, `private,no-store` | Étendre à une conversation autorisée sans divulguer profil privé ; tenir compte de l'employé réellement participant |
| `app/workspace-module.tsx` | Messagerie partagée pour espaces Client, Pro, Salon | Un seul composant à raccorder ; l'espace Staff ne bénéficie pas explicitement du même composant personnalisé |
| `app/live-dashboard.tsx` | Agenda → ouvre la même `BookingMessages` | Préserver le lien réservation/conversation |
| `app/support-inbox.tsx` | `SupportThread` distinct lié à un ticket, `support_messages`, `manage_support_ticket`, notes internes protégées ; réemploi de `MessageBubble` | Ne pas fusionner les tickets support avec les échanges Client/Pro |
| `/app/messages?booking=UUID`, `/pro/messages?booking=UUID` | Liens de notification actuels | Conserver leur résolution ; ajouter la résolution `conversation=UUID` pour échanges avant réservation |

Limites constatées dans le code :

- Aucun parcours Message avant une réservation ; `booking_id` nullable dans le schéma ne suffit pas à autoriser une nouvelle relation Client/Pro.
- `MessageRow` ne charge que `id,sender_id,body,created_at`. Les pièces jointes et métadonnées sont ignorées.
- L'envoi fait un INSERT direct, sans `client_nonce`, au lieu d'utiliser le RPC serveur déjà présent.
- Le verrou `sendingRef` protège le double clic immédiat uniquement ; il ne garantit pas l'idempotence après réponse réseau ambiguë.
- Pagination ancienne fondée sur `created_at < oldest.created_at` : des messages ayant exactement le même horodatage à une frontière de page peuvent être omis. Préférer un curseur `(created_at,id)` stable.
- Realtime ne traite que INSERT ; une future suppression/modération de média ou message nécessite UPDATE/DELETE/réconciliation adaptée.
- Le nom public n'est visible qu'après ouverture, pas dans la liste.
- Fuseau/locale sont encore fixés à `Africa/Dakar`/`fr-SN` dans les messages et listes. La devise est absente du type `CatalogProvider` existant.

## Contrat réel des tables de production

RLS activée sur toutes les tables ci-dessous. Les grants de table généraux ne remplacent pas les politiques ; les politiques exactes sont listées ensuite.

| Table | Colonnes constatées |
|---|---|
| `conversations` | `id uuid PK`, `booking_id uuid nullable` FK bookings ON DELETE SET NULL, `created_at`, `updated_at` |
| `conversation_members` | `(conversation_id,profile_id) PK`, `last_read_at nullable`, `joined_at`, **`archived_at nullable`** |
| `messages` | `id uuid PK`, `conversation_id`, `sender_id`, `body text NOT NULL`, `created_at`, `edited_at nullable`, `deleted_at nullable`, **`message_type text NOT NULL DEFAULT 'text'`**, **`metadata jsonb NOT NULL DEFAULT '{}'`**, **`client_nonce uuid nullable`** |
| `message_attachments` | `id uuid PK`, `message_id`, `conversation_id`, `uploader_id`, `bucket_id DEFAULT 'message-attachments'`, `storage_path`, `mime_type`, `size_bytes int`, `width int nullable`, `height int nullable`, `created_at DEFAULT now()` |
| `conversation_support_access` | `id`, `conversation_id`, `support_agent_id`, `granted_by`, `reason`, `expires_at`, `revoked_at nullable`, `created_at` |
| `conversation_blocks` | Table existante, RLS active, unicité `(conversation_id,blocker_id,blocked_id)` ; les autres colonnes n'ont pas été inventoriées |
| `message_risk_events` | Table existante, RLS active ; utilisée par le RPC d'envoi pour les tentatives de contournement |

Contraintes et index constatés :

- `conversations_booking_unique_idx` UNIQUE `(booking_id) WHERE booking_id IS NOT NULL`.
- `messages_conversation_created_idx` `(conversation_id,created_at)`.
- `messages_sender_nonce_idx` UNIQUE `(sender_id,client_nonce) WHERE client_nonce IS NOT NULL`.
- Corps message : longueur comprise entre 1 et 4000, y compris pour les messages non texte.
- `message_type` limité à `text`, `image`, `location`, `system`. Pas encore de `video`, `service`, `catalog`, `quote`.
- Pièce jointe : bucket exactement `message-attachments`, `storage_path` UNIQUE, MIME JPEG/PNG/WebP, `size_bytes` entre 1 et 10 485 760, largeur/hauteur entre 1 et 12 000 si renseignées.
- Pièces jointes → message/conversation ON DELETE CASCADE ; expéditeur/uploader → profiles ON DELETE RESTRICT.
- Aucun contrat de devis trouvé dans les migrations locales ou les tables de production recherchées par nom contenant `quote`.

## Politiques réellement présentes en production

```sql
-- Lecture conversations / membres / messages :
has_conversation_access(id)                 -- conversations
has_conversation_access(conversation_id)    -- membres, messages

-- INSERT messages :
sender_id = auth.uid()
and is_conversation_member(conversation_id)

-- Lecture pièces jointes :
has_conversation_access(conversation_id)

-- INSERT pièces jointes :
uploader_id = auth.uid()
and is_conversation_member(conversation_id)
and exists (
  select 1 from messages m
  where m.id = message_attachments.message_id
    and m.conversation_id = message_attachments.conversation_id
    and m.sender_id = auth.uid()
)

-- Lecture des autorisations support :
is_conversation_member(conversation_id) or support_agent_id = auth.uid()
```

Les anciennes migrations locales autorisaient `support.manage` directement. Ce n'est **pas** la politique actuelle de production. La lecture support actuelle exige une autorisation explicite de la conversation, non révoquée, non expirée, plus le droit `support.manage` (lui-même soumis au RBAC/MFA existant).

La création/lecture des membres et messages passe actuellement par un test d'appartenance sans condition d'état de compte : voir source exacte ci-dessous. Les RPC `ensure_booking_conversation` et `mark_conversation_read` ne vérifient pas non plus `is_suspended`/`account_status`. C'est un écart de défense serveur à qualifier avec un JWT encore valide d'un compte suspendu ; **pas encore reproduit par mutation pendant cet audit**.

## Fonctions réutilisables et source utile

### Appartenance et lecture

Définitions constatées en production :

```sql
create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = target_conversation_id and profile_id = auth.uid()
  );
$$;

create or replace function public.has_conversation_access(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_conversation_member(target_conversation_id) or exists(
    select 1 from public.conversation_support_access access
    where access.conversation_id=target_conversation_id and access.support_agent_id=auth.uid()
      and access.revoked_at is null and access.expires_at>now()
      and public.has_admin_permission('support.manage')
  );
$$;
```

EXECUTE existe pour `anon`/`authenticated`/`service_role` sur ces deux helpers ; `auth.uid()` et les predicates déterminent le résultat. Ne pas confondre ce grant avec un accès public aux contenus.

### Liste enrichie déjà disponible

```sql
public.list_my_booking_conversations()
returns table (
  booking_id uuid, conversation_id uuid, starts_at timestamptz, status text,
  service_title text, appointment_address text,
  appointment_latitude double precision, appointment_longitude double precision,
  unread_count bigint, last_message_at timestamptz, last_message_body text,
  last_message_sender_id uuid, other_profile_id uuid,
  other_display_name text, other_avatar_url text, other_role user_role,
  archived_at timestamptz
)
```

Fonction SQL STABLE SECURITY DEFINER `search_path=''`, EXECUTE pour authenticated/service_role, pas anon. Requête utile exacte :

```sql
select b.id,c.id,b.starts_at,b.status,ps.title,b.appointment_address,
       b.appointment_latitude,b.appointment_longitude,
  (select count(*) from public.messages m
   where m.conversation_id=c.id and m.deleted_at is null
     and m.sender_id<>auth.uid() and m.created_at>coalesce(cm.last_read_at,'epoch')),
  latest.created_at,latest.body,latest.sender_id,other_profile.id,
  other_profile.display_name,other_profile.avatar_url,other_profile.role,cm.archived_at
from public.bookings b
join public.provider_services ps on ps.id=b.provider_service_id
join public.conversations c on c.booking_id=b.id
join public.conversation_members cm on cm.conversation_id=c.id and cm.profile_id=auth.uid()
join lateral(
  select p.id,p.display_name,p.avatar_url,p.role from public.profiles p
  where p.id=case when b.client_id=auth.uid() then b.provider_id else b.client_id end
) other_profile on true
left join lateral(
  select m.body,m.sender_id,m.created_at from public.messages m
  where m.conversation_id=c.id and m.deleted_at is null
  order by m.created_at desc limit 1
) latest on true
where auth.uid() is not null and (
  b.client_id=auth.uid() or b.provider_id=auth.uid() or exists(
    select 1 from public.collaborators col
    where col.id=b.collaborator_id and col.profile_id=auth.uid() and col.is_active
  )
)
order by coalesce(latest.created_at,b.starts_at) desc;
```

À adapter dans ce même contrat : nouvelle conversation sans booking, aperçu par type de message, nom commercial public prioritaire, pagination stable et état actif du compte. Ne jamais renvoyer coordonnées privées sans besoin ; la liste UI n'a besoin que des champs d'affichage.

### Envoi texte avec nonce

Signature existante :

```sql
public.send_conversation_message(
  target_conversation_id uuid,
  target_body text,
  target_client_nonce uuid default null
) returns jsonb
```

PL/pgSQL SECURITY DEFINER `search_path=''`, EXECUTE authenticated/service_role. Vérifie connexion, appartenance, corps non vide/4000 caractères. Utilise `classify_message_circumvention(text)` ; en cas de blocage, écrit une empreinte SHA-256 dans `message_risk_events`, peut escalader en signalement après répétition, renvoie `{ok:false,blocked:true,reason,severity}`. Sur succès :

```sql
perform set_config('app.message_screened', 'true', true);
insert into public.messages(conversation_id, sender_id, body, message_type, client_nonce)
values(target_conversation_id, auth.uid(), trim(target_body), 'text', target_client_nonce)
returning * into created_message;
return jsonb_build_object('ok', true, 'blocked', false, 'message', to_jsonb(created_message));
```

L'index nonce empêche une seconde ligne mais le RPC ne retourne pas encore la ligne existante sur conflit : le réessai doit devenir idempotent explicitement. Aucun limiteur de débit d'envoi n'est visible dans cette fonction. Le trigger anti-contournement est conservé pour les INSERT directs mais ignore les types non texte ; une extension média/carte ne doit pas permettre de contourner les validations de texte ou d'injecter une carte système.

### Réservation, lecture, archivage et support

| Signature | Contrat réel |
|---|---|
| `ensure_booking_conversation(target_booking_id uuid) returns uuid` | Deux participants booking client/provider, création atomique avec index booking unique, insertion membres ; ne permet pas au simple employé d'appeler ce RPC |
| `ensure_booking_conversation_on_insert() returns trigger` | Crée conversation et deux membres à l'insertion du booking, avec `last_read_at=NULL` |
| `mark_conversation_read(target_conversation_id uuid) returns timestamptz` | Met à jour uniquement membre `profile_id=auth.uid()`, erreur si absent |
| `set_conversation_archived(target_conversation_id uuid,target_archived boolean) returns void` | Archive/désarchive pour le membre connecté seulement |
| `grant_support_conversation_access(uuid,uuid,text,timestamptz) returns uuid` | Participant demandeur ; motif >=10 caractères ; expiration future <=30 jours ; agent actif habilité ; UPSERT et journal d'audit |
| `revoke_support_conversation_access(uuid,uuid) returns void` | Participant seulement ; marque révoquée et écrit un audit |
| `sync_booking_staff_conversation_member() returns trigger` | Retire l'ancien collaborateur de la conversation et ajoute l'employé assigné actif disposant d'un `profile_id` |

**Incohérence à prendre en compte :** le serveur connaît déjà des conversations à trois participants (client/pro/employé assigné), mais le RPC d'ouverture booking et l'API de contexte n'acceptent que client/provider. Le frontend n'affiche qu'un seul `otherMember` pour le reçu « Lu ». L'extension ne doit ni supprimer silencieusement l'accès d'un employé légitime, ni attribuer cet accès à toute l'équipe.

## Triggers et notifications

Triggers présents sur `messages` :

- `messages_prevent_blocked` BEFORE INSERT → `prevent_blocked_message()` : refuse si un blocage concerne l'expéditeur dans `conversation_blocks`.
- `messages_prevent_circumvention` BEFORE INSERT → `prevent_message_circumvention()` : garde texte contre contournement commercial/contact externe.
- `messages_notify_created` AFTER INSERT → `notify_new_message()`.
- `messages_touch_conversation` AFTER INSERT → `touch_conversation_on_message()` : `conversations.updated_at=new.created_at`.

Notification actuelle : une ligne par autre membre, type `message_created`, titre « Nouveau message », corps générique, données `{conversation_id,message_id}`. Aucune copie du contenu privé dans la notification. `prepare_notification_destination()` rattache actuellement cette notification à `/app/messages?booking=...` ou `/pro/messages?booking=...`.

`lib/domain/notifications.ts` autorise déjà les destinations internes comportant `?conversation=UUID`, mais `WorkspaceMessaging` ne lit que `booking`. L'extension doit raccordrer ces deux contrats et cibler le message/devis exact sans URL libre fournie par l'utilisateur.

`notifications.read_at`, `NotificationCenter` et `NotificationBadge` sont réutilisables. Le ledger `notification_deliveries` garantit une source notification unique et dispose du worker Resend existant. Le trigger transactionnel actuel ne met **pas** `message_created` en file email (malgré le champ de préférence `messages_email`) : son CASE traite booking/reminder/application/suspension seulement. Les notifications média/devis doivent être intégrées à ce système, sans créer de second ledger ni envoyer un email à chaque message sans règle d'usage.

## Stockage privé déjà disponible

Bucket **`message-attachments`**, `public=false`, limite **10 485 760 octets**, MIME autorisés **image/jpeg, image/png, image/webp**. Les vidéos ne sont pas encore autorisées.

Politiques Storage constatées :

```sql
-- INSERT : chemin conversation/uploader/objet
bucket_id='message-attachments'
and (storage.foldername(name))[2]=auth.uid()::text
and is_conversation_member(((storage.foldername(name))[1])::uuid)

-- SELECT :
bucket_id='message-attachments'
and has_conversation_access(((storage.foldername(name))[1])::uuid)

-- DELETE : propriétaire de l'objet dans son dossier
bucket_id='message-attachments' and owner_id=auth.uid()::text
and (storage.foldername(name))[2]=auth.uid()::text
```

Ce sont des briques d'autorisation, pas une validation du contenu binaire. Aucun endpoint local de préparation/finalisation, analyse du fichier, vérification de signature binaire, durée vidéo, quota cumulé ou purge des uploads orphelins n'a été retrouvé. La table vérifie la relation message/conversation/expéditeur, mais les policies lues ne vérifient pas encore que les métadonnées `storage_path`, MIME, taille correspondent réellement à un objet validé dans le dossier concerné.

L'accès signé doit rester temporaire et accordé après vérification de l'appartenance active. Ne pas stocker d'URL signée durable dans `messages.metadata`. Ne pas réutiliser `business-media`, `avatars` ou `portfolios` publics pour les messages privés. Ne pas réutiliser les règles du feed public pour les autorisations des conversations.

## Références de catalogue

Réutiliser `provider_services` et ses relations `provider_profiles`, `businesses`, `services/categories`, ainsi que les médias déjà liés à la prestation. `lib/supabase/catalog.ts` enrichit les images depuis la prestation ou ses publications exactes ; aucune copie de prestation n'est nécessaire.

Routes existantes : `/service/[id]` et `/?service=UUID` pour ouvrir la réservation réelle. La page `/service/[id]` fixe encore « FCFA » et le fallback « Dakar » et ne sélectionne pas `currency` ; ce contrat ne suffit pas à une carte internationale fidèle. Une carte de conversation doit charger la devise réelle et garder seulement une FK/version affichable validée côté serveur, pas un prix arbitraire de `metadata` écrit par le navigateur.

Aucune fonctionnalité locale de partage de catalogue, création de devis ou réservation issue d'un devis n'a été retrouvée. Les objets de devis devront représenter le montant contractuel figé sans modifier silencieusement le catalogue et sans confondre acceptation avec paiement.

## Extension minimale proposée

1. **Convergence non destructive** : inventorier ces fonctions/tables existantes dans une migration versionnée, vérifier les écarts QA, préserver les messages/images historiques, blocages et autorisations support. Ne jamais remplacer une policy live plus restrictive par l'ancienne policy locale.
2. **Conversation avant booking** : étendre `conversations` avec la relation Client/Pro explicite et une création serveur idempotente, en conservant les conversations historiques booking. Retourner leur ID aux entrées Message du profil. Réemployer membres, listes, notifications et Realtime.
3. **Envoi unique et contrôlé** : étendre `send_conversation_message` ou une opération serveur dédiée aux types autorisés, avec identité issue de la session, nonce obligatoire pour les retries, contrôle d'état actif, débit/quota et validation des références ; interdire aux clients de forger un message système ou un prix/devis.
4. **Pièces jointes** : étendre `message_attachments` et son bucket privé aux vidéos courtes avec limites explicites, validation serveur fichier réel, dimensions/durée, contrôle d'objet et finalisation atomique. Upload progressif et annulation côté UI ; nettoyage contrôlé des objets non finalisés, conservation des preuves nécessaires.
5. **Liste et lecteur partagés** : raccorder la liste enrichie, puis rendre le contenu discriminé dans le composant partagé ; préserver texte/brouillon/scroll/accusés et erreurs réseau existants. Cartes service/catalogue consultent les données réelles.
6. **Devis** : nouveau domaine métier relié aux conversations/messages existants, états et historique, permissions auteur/destinataire, prix/devise/durée immuables après envoi sauf renouvellement versionné, acceptation atomique/expiration et lien au moteur booking déjà sécurisé. Le paiement reste mock/non réel selon les règles actuelles ; aucune fausse preuve de paiement.
7. **Notifications** : conserver `notify_new_message`/ledger ; adapter aperçu/destination par type sans doublon, références exactes conversation/message/devis, lecture synchronisée.

## Vérifications requises après implémentation

Tous les éléments suivants sont **NOT TESTED pour ce nouveau chantier** :

- Texte bidirectionnel, liste/avatar/dernier message/non-lus, pagination >50 et égalités d'horodatage.
- Client/Pro avant réservation puis même conversation après création booking ; employé assigné si autorisé.
- Fichier valide, falsification MIME, trop lourd, vidéo trop longue, réseau interrompu, finalisation rejouée, média expiré/orphelin.
- Anonyme, autre client, autre pro, ancien employé, compte suspendu avec JWT encore valide : lecture/écriture/URL signée refusées.
- Partage service d'un autre pro, service inactif, tarif/devise falsifiés, devis expiré/double clic/acceptation par un tiers.
- Notification destinataire/destination/lecture/doublon, transitions devis et réservation, conservation des historiques.
- Clavier réel iPhone/Android, scroll tactile/desktop, fermeture et restauration position. Les anciens tests WebKit/viewport ne remplacent pas le matériel réel.

Tests existants à étendre : `tests/remote/messaging-remote-ui.spec.ts`, `scripts/verify-messaging-remote.mjs`, `tests/domain/conversation-context.test.ts`. Aucun test historique n'est requalifié automatiquement en PASS de ces nouvelles fonctionnalités.
