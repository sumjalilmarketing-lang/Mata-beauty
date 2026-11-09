# Audit API, contrôle d'accès et découverte — 9 novembre 2026

Périmètre : lecture des 34 fichiers `app/api/**/route.ts`, de leurs principaux contrôles partagés, du parcours recherche et des migrations RBAC pertinentes. Révision de travail : branche locale d'audit, basée sur `fbf73882c38d17eaba683319b878ffa643da4686`. Les modifications parallèles doivent être prises en compte dans le rapport intégré.

Les constats suivants proviennent du code et de tests isolés. Aucun appel mutatif en production, aucun paiement réel, aucun test multicomptes réel n'a été réalisé par cette revue. La présence d'un garde-fou SQL dans une migration ne prouve pas à elle seule son application sur la base distante. Aucun IDOR exploitable n'a été confirmé dans les routes examinées ; ce résultat ne certifie pas toutes les politiques SQL.

## Anomalies et points à qualifier

| Identifiant | Fichier / élément | Type | Criticité | Preuve / effet | État |
|---|---|---|---|---|---|
| API-01 | `app/api/professionals/wallet/route.ts`, lecture wallet | Résilience / finance | Majeur | Le code initial ignorait `error` et annonçait `ok:true` avec solde nul lors d'une panne. | Corrigé : erreur 503 distincte de l'absence confirmée de portefeuille. |
| API-02 | Même fichier, solde absent | Contrat API | Majeur | Les clés initiales `pending/available/earned/paidOut` différaient des clés normales `pending_balance/available_balance/total_earned/total_paid_out`. | Corrigé : même structure. |
| API-03 | `payments/create`, `payments/refund`, `payments/confirm-service` POST | Résilience / validation | Majeur | `request.json()` bufferisait tout le corps avant validation. | Corrigé : 16 Kio réels maximum, 413 en dépassement, Zod strict. |
| API-04 | `maps/distance` POST | Résilience / validation | Majeur | Endpoint public lisant tout le corps avant le limiteur et l'appel Maps. | Corrigé : lecture bornée 2 Kio avant calcul/appel, coordonnées et enveloppe strictes. |
| API-05 | `salon/invitations/accept` POST | Résilience / validation | Majeur | Corps non borné, validation manuelle du token et clés supplémentaires ignorées. | Corrigé : 2 Kio, Zod strict, token borné. |
| API-06 | `admin/accounts`, `admin/team`, `department-teams` POST | Résilience / validation | Majeur | Corps JSON non borné après contrôle du gestionnaire. | Corrigé : 16 Kio ; entrées strictes, y compris objets comptes imbriqués. |
| C-01 | `app/social-feed.tsx:204` et `:745` | Robustesse URL | Majeur | `country` arbitraire est affecté à l'état puis passé à `Intl.DisplayNames.of`. `?country=INVALID` provoque `RangeError`. Reproduit dans le moteur Node Intl. | Signalé à l'intégrateur. |
| C-02 | `app/social-feed.tsx:198–224` | Navigation / filtres | À qualifier | Les filtres sont hydratés une seule fois et le composant ne réagit pas à `popstate`. Le parent restaure son propre état, pas les filtres internes du feed. | À vérifier/corriger via scénario navigateur Retour après URL de recherche différente. Preuve statique ; scénario navigateur non exécuté. |
| C-03 | `lib/supabase/catalog.ts:85–111` | Performance | Majeur à grande échelle | La pagination par lots de 100 boucle jusqu'à charger tous les professionnels avant retour ; ce n'est pas une pagination de résultats utilisateur. Enrichissements supplémentaires par lots sur toutes les prestations. | Architecture à faire évoluer vers recherche/pagination serveur. |
| D-01 | `app/mata-beauty-app.tsx`, sélection et insert booking | Fonctionnalité | Majeur | Un seul `provider_service_id`, aucune liste de variantes/option_ids dans le parcours. Le panier multi-soins est absent. | Nécessite évolution transactionnelle distincte. |
| A-01 | `db/schema.ts` | Architecture | Mineur | Fichier ORM vide (`export {}`) ; le schéma réel réside dans les migrations Supabase et peut inclure des objets de production non décrits ici. | Ne pas annoncer un modèle ORM complet. |

Le défaut C-02 peut être annulé par une remonte complète de composant dans certains parcours. La divergence est présente dans le code conservant le composant monté et doit être prouvée dans la recette navigateur avant de la classer comme échec de parcours livré.

## Inventaire exhaustif des 34 routes API

« Auth session » signifie appel `getUser` vérifiant la session, puis client limité par RLS. « RPC propriétaire » signifie contrôle SQL requis en plus du garde d'API. La validation manuelle est explicitement indiquée ; elle n'est pas présentée comme Zod.

| # | Route | Méthodes | Auth / autorisation | Validation / taille | Idempotence / protection / limite |
|---|---|---|---|---|---|
| 1 | `/api/admin/accounts` | GET, POST | Session cookies ; `admin_list_team` (Super Admin/MFA SQL) | Recherche ≤200 ; POST Zod strict, ≤20 comptes, 16 Kio | `operationId` par compte, raison et confirmation suppression ; RPC contrôle l'état |
| 2 | `/api/admin/team/activate` | POST | Session vérifiée, cible dérivée de l'utilisateur | Aucun payload nécessaire ; origine exacte | Activation par RPC service pour l'utilisateur vérifié |
| 3 | `/api/admin/team` | GET, POST | Session ; `admin_list_team` | Union Zod stricte, email/UUID, 16 Kio POST | Permissions SQL ; reçu email, version et clé d'idempotence d'envoi |
| 4 | `/api/analytics/product-event` | POST | Session facultative vérifiée ; sinon clé anonyme serveur | Zod strict, 16 Kio stream, propriétés ≤8 Kio | Limitation/déduplication RPC par session/IP |
| 5 | `/api/analytics/social-metric` | POST | Session facultative ; branche anonyme serveur | Zod strict, 2 Kio, UUID et hash | RPC utilisateur/anonyme ; acceptation limitée |
| 6 | `/api/app-version` | GET | Public | Pas d'entrée | Lecture seule, no-store |
| 7 | `/api/auth/providers` | GET | Public | Pas d'entrée ; lecture settings avec timeout 5 s | Lecture seule ; aucune clé secrète retournée |
| 8 | `/api/auth/welcome` | POST | Bearer getUser ; origine | Aucun payload utilisé | Livraison dédupliquée via service email |
| 9 | `/api/auth/whatsapp-hook` | POST | Signature hook avec secret | Stream ≤64 Kio ; validation manuelle téléphone/OTP | Signature/fraîcheur helper ; aucun OTP loggé ; pas de test provider réel |
| 10 | `/api/bookings/conversation-context` | GET | Session, RLS puis participants ; accès staff RPC si activé | UUID manuel, 1–100 IDs dédupliqués | Service lit seulement profils dérivés des réservations autorisées ; private no-store |
| 11 | `/api/bookings/reviews` | GET, POST | Session ; règles d'avis SQL | GET UUID Zod ; POST Zod strict ≤16 Kio | RPC autorise RDV terminé/participants et unicité ; private no-store |
| 12 | `/api/cron/notifications` | GET | HMAC dispatch frais (90 s) | Headers signature/temps stricts | Workers email et push indépendants ; reprise SQL ; aucun test de livraison physique |
| 13 | `/api/department-teams` | GET, POST | Session, `department_context` | Union Zod stricte ; 16 Kio POST | RPC contrôle rôles, équipe et versions ; liens/envois avec règles de renvoi |
| 14 | `/api/health/server` | GET | Public | Pas d'entrée | Lecture service bornée à count categories ; réponse booléenne |
| 15 | `/api/maps/autocomplete` | GET | Public | Zod input/token/pays/langue | Limiteur IP/global ; timeout 6 s ; clé serveur jamais retournée |
| 16 | `/api/maps/capabilities` | GET | Public | Pas d'entrée | Retourne uniquement disponibilité booléenne |
| 17 | `/api/maps/distance` | POST | Public | Zod strict coordonnées/enveloppe ; 2 Kio | Limiteur Maps si configuré ; timeout 6,5 s ; fallback Haversine explicite |
| 18 | `/api/maps/place` | GET | Public | Zod placeId/token/langue | Limiteur IP/global ; timeout 6 s ; masque champs Places |
| 19 | `/api/media/images` | POST | Bearer actif ; owner salon ou propre avatar/pro | FormData whitelist ; Zod champs ; upload borné ; image décodée normalisée | Quotas utilisateur/global ; UUID objet ; publication sous RLS |
| 20 | `/api/payments/capabilities` | GET | Public | Pas d'entrée | Mock/sandbox uniquement ; aucune donnée secrète |
| 21 | `/api/payments/confirm-service` | POST | Bearer getUser ; origine | UUID Zod strict ; 16 Kio | Limiteur ; `confirm_service_and_release` contrôle contrat SQL |
| 22 | `/api/payments/create` | POST | Bearer ; booking client_id=session | Zod strict ; 16 Kio ; devise/statut/prestation | FOR UPDATE booking, tentative/empreinte, interdit paiement actif concurrent ; sandbox |
| 23 | `/api/payments/refund` | POST | Bearer ; permissions SQL sur paiement | Zod strict montant positif/raison/tentative ; 16 Kio | Limiteur ; RPC réserve sommes et clé idempotente |
| 24 | `/api/payments/status` | GET | Bearer ; lecture RLS | UUID Zod | Lecture seule ; no-store ; test tiers réel non effectué |
| 25 | `/api/payments/webhook` | POST | Signature fournisseur puis confirmation provider | Stream ≤128 Ko, Zod payload | Événement unique SQL, montant/devise/référence contrôlés ; limiter, anti-rejeu mock |
| 26 | `/api/professionals/logo` | POST | Handler image actif, pro propre compte | FormData borné et normalisation image | Même pipeline que #19, kind forcé |
| 27 | `/api/professionals/wallet` | GET | Bearer ; rôle provider ; wallet professional_id=session | Pas d'entrée | Lecture RLS, no-store ; erreurs distinctes du solde zéro |
| 28 | `/api/public/provider-locations` | GET | Public ; service filtre approved | UUID manuel, 1–100 IDs | Seulement identifiant et pays ; pas coordonnées privées ; cache public 300 s |
| 29 | `/api/public/social-posts/[id]/media` | GET | Public anon ; vue feed publique et storage RLS | UUID manuel ; URL fallback HTTPS | Signature seulement pour média visible ; no-store ; pas service-role |
| 30 | `/api/push` | GET, POST, DELETE | Bearer ; propriétaire abonnement ; origine mutative exacte | POST Zod ; DELETE endpoint manuel ; 5 Ko | RPC register, suppression profile_id=session ; cascades annulent pending |
| 31 | `/api/salon/invitations/accept` | POST | Bearer, origine, feature flag | Zod strict token 40–60 chars ; 2 Kio | Hash token, consommation/vérification compte SQL ; aucun rôle depuis payload |
| 32 | `/api/salon/team` | GET, POST | Bearer, feature flag, propriétaire via RPC | GET UUID manuel ; POST parseAction manuel, permissions whitelist ; 16 Ko | Tokens aléatoires hashés, suppression email contrôlée après owner ; clé envoi ; audit |
| 33 | `/api/studio/prepare-video` | POST | Bearer actif ; profil pro | Zod strict préparation UUID ; 1 Ko ; snapshot taille | Quotas, préfixe owner, origine storage exacte, conversion, upsert=false |
| 34 | `/api/studio/validate-video` | POST | Bearer actif ; profil pro | Zod strict ; 2 Ko ; chemins owner/post ; bornes média | Quotas ; snapshot/attestation d'objet, pas de redirection download |

## Schéma et RBAC

- Le client API est construit avec la clé publique et le bearer de l'appelant ; `getUser` vérifie le jeton. Le service-role est réservé aux modules serveur. Aucun usage service-role dans le navigateur n'a été trouvé dans les fichiers parcourus.
- La garde workspace exige session, profil actif et approbation prestataire pour les espaces pro/salon. Les accès internes sont séparés par rôles et permissions. L'accès visuel n'est pas une frontière de sécurité : les RPC/RLS restent obligatoires.
- `is_admin` a été renforcé dans `20261006015600_enforce_active_admin_membership.sql` pour exiger adhésion active non révoquée. `has_admin_permission` et `is_super_admin` contrôlent les adhésions et la MFA via le helper central. Aucun privilège administratif ne provient du `user_metadata` dans ces helpers.
- Les tables modèles existent dans les migrations : provider_profiles/businesses, collaborators/collaborator_services, provider_services, availability_rules/exceptions, bookings, reviews/booking_reviews, payments/wallet_ledger. `db/schema.ts` n'en est pas une représentation typée.
- Les variantes facultatives ne sont pas intégrées dans l'UI de réservation. Un helper SQL conditionnel `default_service_duration` mentionne les options obligatoires si une table `service_options` existe. Cela ne remplace ni une migration complète de variantes, ni un sélecteur de variante, ni un panier de prestations.
- Une lecture exhaustive de toutes les définitions effectives de RPC et de toutes les politiques de la base distante reste nécessaire pour certifier RBAC ; cet inventaire de routes ne l'affirme pas réalisée.

## Découverte C et fiche D

La recherche textuelle, ville/zone, pays, catégorie, professionnel et rayon sont implémentés dans le feed avec paramètres URL. Les publications utilisent une pagination keyset `published_at/id` ; les filtres sont appliqués côté client sur les pages chargées, avec chargement additionnel lorsque peu de résultats restent. Le catalogue professionnel hydrate tous les profils par lots avant de retourner le résultat. Le champ pays URL non validé provoque un crash possible (C-01).

La fiche appelle `onBook(service)` et le tunnel crée une prestation par réservation. Variantes facultatives, panier multi-soins, calcul transactionnel cumulé et affectation d'un praticien habilité pour toutes les prestations sont donc des fonctionnalités à compléter, pas des fonctions testées comme existantes.

## Vérifications de cette passe

- Premier lot API : 10 tests isolés réussis (wallet et paiements).
- Deuxième lot API : 15 tests isolés réussis dans `api-followup-body-limits.test.ts` pour corps réellement surdimensionné malgré Content-Length falsifié, clés inattendues et JSON invalide sur cinq routes. Les deux lots réunis : 25 tests réussis dans trois fichiers.
- Le résultat exact du quality gate est communiqué par l'intégrateur avec son journal final. Cette revue n'annonce pas de recette navigateur ni de test de paiement réel.
