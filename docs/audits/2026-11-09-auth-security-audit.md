# Mata Beauty — schémas, authentification et sécurité des requêtes

Date : 9 novembre 2026. Cette passe prolonge la PR nº56 sur la base `6fc271c8`. Stack constatée : Next.js App Router 16.4.1, React 19, TypeScript strict, Supabase Auth/PostgreSQL, Zod et Tailwind. Le fichier `db/schema.ts` est un vestige vide du starter ; les migrations PostgreSQL décrivent la base réelle.

## 1. Vulnérabilités et défauts

Les lignes renvoient aux fichiers corrigés. Une correction de code ou un test isolé ne signifie pas que la protection est active en production.

| Fichier & Ligne | Élément ciblé | Type | Criticité | État |
| :--- | :--- | :--- | :--- | :--- |
| `supabase/migrations/20261109143532_enforce_active_internal_authorization.sql:3` | `is_admin`, `is_super_admin`, `has_admin_permission` | Cybersécurité / révocation | Bloquant | Appliquée en production, définition vérifiée |
| `proxy.ts:54` | Renouvellement des cookies sur pages publiques/API | Cybersécurité / cache | Majeur | En-têtes anti-cache et cookies propagés |
| `proxy.ts:76` | Réponse de maintenance après renouvellement | Résilience / session | Majeur | Cookies renouvelés conservés sur la réponse 503 |
| `lib/auth/workspace-server.ts:28` | Accès aux pages internes si le RPC MFA échoue | Cybersécurité / contrôle d'accès | Majeur | Refus si erreur ou résultat non booléen |
| `app/auth/workspace/route.ts:23` | Résolution du département si MFA indéterminé | Cybersécurité / contrôle d'accès | Majeur | Refus avant lecture du contexte privilégié |
| `app/auth/callback/route.ts:34` | Session Google et statut après échange du code | Cybersécurité / logique | Majeur | Utilisateur vérifié, statut exactement actif, fermeture locale sur refus |
| `app/auth/confirm/route.ts:30` | Confirmation email, invitation et récupération | Cybersécurité / logique | Majeur | Même contrôle du statut avant poursuite et accès privilégié |
| `supabase/migrations/20261109143450_private_availability_exceptions.sql:11` | Motifs d'absence du professionnel | Cybersécurité / confidentialité | Bloquant | Politique publique supprimée en production ; politique propriétaire conservée |

## 2. Diagnostic technique, fichier par fichier

### Autorisation SQL et statut de compte

La lecture des définitions installées en production confirme que les trois fonctions d'autorisation contrôlent le rôle, la suspension booléenne, l'adhésion, sa révocation, l'activité du rôle et le MFA, mais omettent `profiles.account_status`. Un compte `disabled` ou `deleted` dont `is_suspended=false` conserve donc des droits internes lorsque son jeton est encore valide et AAL2. L'écran d'entrée qui refuse ce compte ne protège pas les appels directs aux RPC et tables dont les politiques utilisent ces helpers.

La migration impose aussi `p.account_status='active'` dans chaque fonction. Aucun utilisateur ni rôle réel n'est modifié. `CREATE OR REPLACE FUNCTION` conserve les signatures et ACL existantes ; les contrôles d'adhésion et MFA sont conservés. Le test reproduit les droits accordés par l'ancienne définition à un compte désactivé, puis vérifie le refus après migration. Il couvre aussi une politique RLS consommant le helper, les autres statuts, le statut nul, la révocation, les rôles délégués et un autre utilisateur. Le helper MFA est simulé dans cette fixture ; la vraie exemption commerciale possède sa suite séparée.

### Proxy, cache et cookies

La version installée de `@supabase/ssr` transmet les en-têtes anti-cache comme second argument de `setAll`. L'ancien proxy les ignorait et ne fixait `private, no-store` que pour certains documents HTML avec nonce. Les réponses publiques ou API pouvaient écrire des cookies sans porter ce signal. Il s'agit d'un risque de mise en cache de session ; aucun partage effectif de session entre deux clients n'a été provoqué en production.

Le proxy conserve maintenant les cookies par requête et par nom, applique les en-têtes de renouvellement et interdit explicitement le cache navigateur/CDN lors d'une écriture de cookie. Il préserve les lots de cookies fractionnés et leur injection dans la requête transmise à Next. La réponse de maintenance conserve également les cookies renouvelés. Un visiteur sans renouvellement conserve le comportement de cache antérieur. Les valeurs de session ne sont pas placées dans le HTML ou les journaux.

### Pages internes et résolution de l'espace

`requireWorkspace` n'examinait que `mfaResult.data === true`. Une erreur ou une valeur nulle n'était pas une décision MFA fiable. Le résolveur `/auth/workspace` traitait l'erreur mais acceptait une réponse non booléenne. Les deux chemins exigent maintenant une réponse booléenne sans erreur. La valeur `true` impose l'étape MFA, `false` permet de poursuivre les contrôles du rôle et des permissions. Les contrôles SQL offrent une seconde défense ; cette faiblesse d'écran n'est pas présentée comme un contournement MFA complet démontré.

### Retours OAuth et email

`synchronize_account_status()` retourne un texte représentant le statut final. Les retours de connexion n'en lisaient que l'erreur et vérifiaient un indicateur de suspension issu du profil antérieur. Un compte désactivé pouvait donc recevoir un retour annoncé comme réussi. OAuth exige désormais aussi un résultat `getUser()` sans erreur avant l'accès au profil.

Les deux routes exigent le statut synchronisé exactement égal à `active`. Les refus ferment la session locale et empêchent le message de bienvenue et la poursuite de l'invitation. Les invitations et récupérations de comptes actifs conservent leur écran de mot de passe. Les tests distinguent les réponses des RPC par nom ; ils n'utilisent plus un même objet de profil à la place du texte de statut.

### Schéma et permissions observés

La lecture des métadonnées de production compte **131 tables publiques, toutes avec RLS activé**. Cela ne prouve pas que chaque politique est correcte. Les politiques des profils et rôles ont été lues ; leurs grants ne sont pas interprétés seuls comme une autorisation, car les politiques et triggers s'appliquent aussi. Les champs privés des profils disposent de restrictions de colonnes, et les changements de privilèges ont des triggers dédiés.

Les advisors signalent 17 fonctions SECURITY DEFINER exécutables anonymement et 213 par les utilisateurs authentifiés. Ces nombres sont des surfaces à examiner, pas 230 failles confirmées : des RPC publics de calcul de disponibilité et des RPC authentifiés contrôlant le propriétaire sont intentionnels. Les alertes ne justifient pas une révocation globale qui casserait les réservations. Le résumé sans données personnelles figure dans `2026-11-09-auth-advisors.json`.

Les pistes de performance incluent 138 clés étrangères sans index couvrant, 128 politiques nécessitant une revue des appels Auth et 209 cas de politiques permissives multiples. Ces compteurs ne sont pas une mesure du temps de réponse. Aucun lot d'index n'est appliqué sans analyse des requêtes et du coût d'écriture.

## 3. Code source intégral corrigé

Les fichiers suivants sont complets dans cette branche ; aucun extrait abrégé ne remplace leur implémentation :

- `proxy.ts`
- `lib/auth/workspace-server.ts`
- `app/auth/workspace/route.ts`
- `app/auth/callback/route.ts`
- `app/auth/confirm/route.ts`
- `supabase/migrations/20261109143532_enforce_active_internal_authorization.sql`

Les tests sont également complets : `content-security-policy.test.ts`, `workspace-server-mfa.test.ts`, `workspace-entry-route.test.ts`, `oauth-callback-route.test.ts`, `auth-confirm-route.test.ts` et `internal-account-authorization.test.ts` dans `tests/domain`.

## 4. Exigences non encore satisfaites et vérification

L'architecture actuelle utilise un client Supabase dans le navigateur avec accès direct à des tables/RPC et Realtime. Ses jetons sont accessibles au JavaScript. Elle ne satisfait donc pas l'exigence stricte de cookies de session tous HttpOnly. Forcer ce drapeau seul casserait le renouvellement et l'authentification navigateur. Une architecture de session exclusivement serveur avec passerelle API est nécessaire pour respecter cette exigence ; elle n'est pas déclarée livrée ici. SameSite=Lax est conservé pour les retours externes OAuth/email ; SameSite=Strict n'est pas déclaré installé. Secure est actif sur HTTPS.

Les routes de retour Auth disposent de validations explicites de codes/tokens et d'une destination interne normalisée, mais toutes les entrées du dépôt ne sont pas encore validées par Zod strict. Une certification « 100 % Zod », une revue de chaque header arbitraire ou une recette de chaque état visuel ne sont pas revendiquées.

La suite complète de qualité a réussi : 147 fichiers et 986 tests, lint sans erreur (8 avertissements préexistants), TypeScript strict et build de production réussis. Deux revues indépendantes ont examiné le proxy, la migration et les gates MFA ; les retours Auth ont aussi été relus lors de l'intégration. Les résultats et la révision exacte sont consignés dans la PR. Les tests de route Auth utilisent des clients isolés simulés. Aucun compte de test ni notification réelle n'a été créé en production.

La migration de confidentialité `20261109143450` et la migration d'autorisation interne `20261109143532` ont été appliquées en production. La lecture après application confirme la seule politique propriétaire sur les absences et le contrôle `account_status='active'` dans les trois helpers. Leurs fichiers sont alignés sur les versions effectivement enregistrées. Les trois migrations report client, multi-soins et recherche de la deuxième livraison ne sont pas encore appliquées. Le code applicatif de cette passe n'est pas encore déployé.

Références de revue : [sessions Supabase](https://supabase.com/docs/guides/auth/sessions), [guide SSR avancé](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [indexation des clés étrangères](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
