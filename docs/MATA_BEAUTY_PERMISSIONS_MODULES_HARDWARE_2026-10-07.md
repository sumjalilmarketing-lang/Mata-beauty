# MATA Beauty — permissions, modules internes et matériel réel

Date : 7 octobre 2026. Domaine : https://mata-beauty.com.

## Reprise de finalisation — en cours

La classification individuelle des 48 routes est conservée dans [MATA_BEAUTY_INTERNAL_ROUTE_CLASSIFICATION_2026-10-07.md](MATA_BEAUTY_INTERNAL_ROUTE_CLASSIFICATION_2026-10-07.md). Le bilan initial ci-dessous reste historique ; une correction de code n'est pas comptée comme un PASS navigateur.

- Fuite d'agrégats financiers reproduite avec Support AAL2, corrigée par `20261007144455_scope_internal_dashboard_aggregates.sql` sur QA et production.
- Suite Équipe & Accès/API élargie : **34 PASS QA et 34 PASS production**, sans les additionner comme 68 contrôles distincts.
- Suite navigateur élargie : **17 PASS production**, dont attribution des quatre rôles demandés, cinq autres espaces refusés pour chacun, API d'équipe refusée, suspension et révocation. L'invitation initiale de ce passage était Finance ; les invitations initiales des autres rôles restent à rejouer séparément.
- Routes secondaires Admin raccordées aux écrans existants après contrôle serveur Super Admin ; historiques Onboarding, Modération et Finance raccordés à leurs sources respectives ; filtres Finance et source des remboursements corrigés. Recette distante de ces corrections d'interface en cours.
- Aucun lecteur vidéo, GPS ou design modifié. Aucun paiement réel activé.

La revue automatique a refusé de monter le tableau de bord administratif complet depuis Finance/Opérations, pour risque d'exposition d'actions hors périmètre. Cette approche n'a pas été appliquée : les corrections de ces espaces utilisent leurs propres sources sous RLS.

## Conclusion de recette

**C — NON PRÊT pour une ouverture publique sans réserves.** Le GPS est confirmé fonctionnel par l’utilisateur sur iPhone 15 Pro Max / Chrome après autorisation. Les modules internes secondaires restent partiellement non opérationnels ; les contrôles physiques de trackpad et la qualification adverse de toutes les opérations métier ne sont pas terminés.

Cette recette distingue inventaire, examen du code, exécution d’une requête, navigation et validation complète d’une fonctionnalité. Un écran rendu n’est pas un PASS fonctionnel. Les résultats précédents ne sont pas additionnés aux nouveaux tests pour annoncer une couverture exhaustive.

## Périmètre et preuves

- Inventaire SQL réel de production : 101 tables publiques, toutes avec RLS ; 9 vues avec `security_invoker=true` ; 8 buckets dont les documents professionnels et pièces jointes de messagerie sont privés.
- Avant correction : 92 fonctions SECURITY DEFINER exécutables par authenticated, dont 17 par anon. Ce sont des surfaces à qualifier, pas 92 vulnérabilités démontrées.
- Comparaison des déclencheurs QA / production : protections des documents et avis absentes en production malgré la présence de migrations historiques locales. Les tests QA ne prouvaient pas leur présence en production.
- 105 routes/modules internes ouverts dans Chromium sur le domaine réel avec un Super Admin temporaire et MFA réel : 48 écrans indisponibles, 57 écrans rendus dont les actions métier ne sont pas toutes exécutées. Les liens visibles sont cliqués ; les routes secondaires masquées sont ouvertes directement. Le tableau détaillé ci-dessous distingue ces cas.
- 24 contrôles d’auto-attribution de rôle, métadonnées, révocation et MFA rejoués en production : PASS.
- 44 contrôles ciblés après correction sur QA puis production : PASS sur les deux environnements. Ils incluent les refus et les usages légitimes, via Auth, REST et Storage réels. Ce résultat ne vaut pas validation de l’ensemble des 92 RPC.
- Scripts conservés : `scripts/verify-permission-audit.mjs`, `scripts/verify-internal-modules.mjs`, `scripts/verify-production-role-security.mjs`.
- Éléments de travail locaux : `work/permission-audit/` (inventaire SQL, reproduction initiale, JSON de vérification et navigation). Aucun secret n’est inclus dans ce rapport.

## Anomalies de sécurité et corrections ciblées

| ID | Problème et reproduction | Risque | Correction | Bloquant avant lancement | État |
|---|---|---|---|---|---|
| SEC-01 | Un rôle Finance AAL2 appelle directement `write_admin_audit` avec un événement fabriqué ; insertion réussie sur QA | Falsification du journal des opérations | EXECUTE retiré aux rôles API ; les opérations autorisées continuent à écrire leur audit en interne | OUI | PASS QA et production (contrôles ciblés) |
| SEC-02 | Un client appelle `compute_provider_launch_completeness` pour un brouillon étranger ; score renvoyé sur QA | Lecture d’informations d’un profil non public | Calcul interne uniquement ; wrapper propriétaire/agent conservé et retesté | OUI | PASS QA et production (contrôles ciblés) |
| SEC-03 | Un client rattache son paiement à `wave` avec `is_test=false` et une référence arbitraire ; valeurs persistées sur QA | Intégrité des données de paiement ; cela ne prouve aucun débit réel | Ancienne RPC révoquée ; nouvelle entrée réservée au serveur, propriétaire vérifié, test obligatoire, rattachement unique | OUI | PASS QA et production (contrôles ciblés) |
| SEC-04 | Le demandeur d’un ticket lit une note `is_internal=true` dans une transaction QA annulée | Divulgation de notes internes au client | RLS distingue réponses publiques et notes internes ; lecture/écriture internes réservées au support | OUI | PASS QA et production (contrôles ciblés) |
| SEC-05 | Aucun déclencheur de protection sur `provider_documents` dans le catalogue SQL de production | Champs de revue et chemins de documents insuffisamment protégés | Rattachement de la fonction de contrôle existante ; upload réel exigé ; auto-approbation refusée | OUI | PASS QA et production (contrôles ciblés) |
| SEC-06 | Protection des modifications d’avis absente de production ; politique d’insertion compare `b.provider_id` à lui-même | Avis attribué au mauvais professionnel ; note ou réponse falsifiée | Comparaison au professionnel de l’avis ; champs client, réponse pro et visibilité contrôlés séparément | OUI | PASS QA et production (contrôles ciblés) |
| SEC-07 | Anciennes entrées d’approbation et de remboursement encore exposées et sans appel applicatif actuel | Contrôles métier divergents, idempotence et dossier incomplet | Retrait des entrées héritées ; parcours actuel de candidature et remboursement v2 conservés | OUI | PASS QA et production (contrôles ciblés) |

Les fichiers modifiés sont la route serveur de création de paiement, trois migrations versionnées et les scripts de recette. Aucun code de lecture vidéo ou de GPS n’a été modifié. Aucun paiement réel ni nouveau fournisseur n’a été activé.

Le test initial a laissé quatre comptes synthétiques sur QA car le journal financier append-only empêche leur suppression. Ils sont bannis, leurs sessions supprimées et leurs rôles internes révoqués. Le journal n’a pas été affaibli pour les supprimer. Les fixtures des tests suivants sont nettoyées.

## Réserves métier et sécurité restantes

| Problème | Risque / fonction | Bloquant avant lancement | Correction ou contrôle nécessaire | Statut |
|---|---|---|---|---|
| Le connecteur générique d’audit cible `admin_audit_logs`, absent ; HTTP 404 observés | Historiques Onboarding, Modération, Finance, Opérations et routes secondaires Admin | OUI pour leur exploitation autonome | Raccorder chaque historique à sa vraie source et son périmètre métier ; le journal financier n’est pas le journal administratif | FAIL |
| Finance : attente/échec sans filtre, remboursements/commissions sur liste de paiements, litiges sur signalements | Données affichées sous une mauvaise signification | OUI avant exploitation financière ; paiement en ligne réel reste interdit | Sources, filtres, transitions et contrôles de montants propres à chaque opération | FAIL, examen de code et navigation |
| Finance : wallets, versements, rapprochement, anomalies, paramètres sans vue complète | Pilotage financier inutilisable | OUI avant finance réelle ; NON si paiement sur place uniquement et périmètre retiré de l’offre | Raccorder l’existant puis tester de bout en bout avant activation | FAIL |
| Support : escalades sur signalements ; base de connaissances et rapports non raccordés | Mauvaise file ou absence de suivi | OUI avant utilisation autonome de ces modules | File support issue des tickets/événements ; ne pas présenter un écran générique comme opérationnel | FAIL |
| Modération : vidéos et messages sans composant opérationnel ; commentaires, appels, sanctions, règles absents | Traitement incomplet des incidents | OUI si ces parcours sont offerts ; modération principale des publications distincte | Définir et tester les actions réellement prises en charge, sans exposer de conversation privée | FAIL |
| Onboarding : affectations globales et historique secondaire non raccordés | Répartition et suivi incomplets | OUI pour une équipe opérant uniquement par ces écrans | Conserver le dossier principal qualifié ; raccorder les vues secondaires et leurs permissions | FAIL |
| Routes `/admin/*` génériques distinctes du tableau de bord `/admin` et d’Équipe & accès | Une route secondaire peut échouer alors que l’action existe dans le tableau de bord principal | OUI pour la cohérence de navigation annoncée | Unifier les destinations avec les écrans existants et retester chaque rôle | FAIL sur les routes indiquées ; ne remet pas automatiquement en cause le parcours Équipe déjà testé |
| Modules Lancement/Cohorte/antifraude et rappels : différences QA/production observées | Fonctions de surveillance ou rappels supposés disponibles | OUI si intégrés aux procédures de lancement | Comparer dépendances, migrations et données ; ne pas appliquer en bloc une migration historique | BLOCKED |
| Agrégats de `get_admin_dashboard` / `get_social_admin_dashboard` et périmètres de lecture par rôle | Indicateurs financiers accessibles à un rôle non financier selon les permissions de tableau de bord | OUI jusqu’à qualification du besoin et test adverse | Tester explicitement Support, Modération et Contenu ; réduire chaque agrégat au besoin du rôle | NOT TESTED dynamiquement |
| États suspendus, RLS des commentaires, données publiques des profils approuvés, anti-abus analytique, concurrence remboursement v2 | Chemins résiduels à qualifier au-delà des tests d’escalade de rôle | OUI pour affirmer un audit de sécurité exhaustif terminé | Tests ciblés, périmètres de colonnes et contrôles serveur ; maintenir finance mock | NOT TESTED exhaustivement |
| Protection des mots de passe compromis désactivée, extensions `btree_gist` et `pg_net` dans public | Durcissement fournisseur / surface d’extensions | À qualifier ; aucune exploitation démontrée par cet avis | Examiner disponibilité du réglage et dépendances avant modification | BLOCKED / avertissements fournisseur |

Les avertissements SECURITY DEFINER ne sont pas effacés artificiellement : plusieurs fonctions publiques sont intentionnelles (créneaux, recherche proche, compteurs publics). Chaque autorisation dépend aussi du contrôle interne, des triggers et des politiques RLS. Les quatre tables à RLS sans politique restent fermées par défaut ; aucune politique permissive n’a été ajoutée pour faire disparaître l’avertissement.

Références techniques : [sécurité des fonctions Supabase](https://supabase.com/docs/guides/database/functions), [avis SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protection des mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Matériel réel

| Appareil / contrôle | Preuve | Statut |
|---|---|---|
| iPhone 15 Pro Max, Chrome, Utiliser ma position | L’utilisateur signale d’abord « Localisation refusée », puis « c’est bon » après les instructions d’autorisation | PASS déclaré par l’utilisateur ; non observé à distance |
| Boutons connexion et déconnexion sur ce téléphone | Les anciens tests de viewport ne prouvent pas les gestes physiques ; pas de retour utilisateur explicite sur ces deux boutons dans cet échange | NOT TESTED sur matériel réel |
| Trackpad physique, défilement long, feed et modales | Aucun accès au trackpad de l’utilisateur ; les événements synthétiques ne sont pas une preuve matérielle | NOT TESTED |
| Autres iPhone, Safari, Android et réseaux mobiles | Aucun appareil ni résultat humain fourni | NOT TESTED |

## Contrôles avant commit et publication des corrections

`pnpm lint`, `pnpm typecheck`, `pnpm test` (90 tests) et `pnpm build` passent. Les validations unitaires et de build ne remplacent pas les preuves REST/Storage, navigateur et matérielles ci-dessus.

Publication : commit `491db452a93c0b260807c577eb974a30c3c60af5`, déploiement `dpl_6N3jGwPuxGV4av74U3Eyf3jvSMFN`, URL immuable `https://mata-beauty-1wzcg0281-africrm.vercel.app`. À 12:12 CEST, les 15 chemins de ressources JavaScript du domaine public sont identiques à ceux du déploiement immuable authentifié, zéro différence. Les trois migrations sont appliquées en production ; les déclencheurs documents/avis sont actifs. Les 44 contrôles ciblés passent également sur la base de production, fixtures nettoyées. Après retrait de sept anciennes entrées, 85 fonctions SECURITY DEFINER restent exécutables par authenticated, dont 17 par anon.

Après déploiement, sept scénarios navigateur passent directement sur mata-beauty.com : dossier complet avec quatre documents/examen/approbation, MFA, catégories vers prestations/créneaux, CRUD salon puis réservation/message/avis/statistiques, profil client, interactions publiques et responsive de l’authentification. Le contrôle du scroll desktop inclus dans la recette MFA utilise la molette simulée aux tailles 1366×768, 1440×900 et 1920×1080 ; ce n’est pas un test physique de trackpad.

Quatre autres scénarios navigateur après déploiement passent : publication MP4 réelle, publication photo/avant-après, interactions feed vers profil/réservation, signalement puis examen/masquage/audit/restauration avec les rôles attendus. Le démarrage vidéo mesuré pendant ce scénario est de 992 ms ; ce n’est pas une garantie pour tous les appareils/réseaux. Le module vidéo n’a pas été modifié. Zéro compte synthétique `qa-team-*` restant en production après les tests de permissions et de navigation.

## Inventaire des routes internes réellement ouvertes

La colonne Action distingue un clic de navigation d’un accès direct à une route déclarée. « Écran rendu » signifie seulement que le chargement a abouti ; les opérations métier restent NOT TESTED dans cet inventaire. Les données personnelles visibles ne sont pas recopiées.

| Espace | Route | Action | Observation | Statut fonctionnel |
|---|---|---|---|---|
| onboarding | `/onboarding` | URL directe | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/new` | Clic | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/in-progress` | Clic | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/requests` | Clic | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/approved` | Clic | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/rejected` | Clic | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/documents` | URL directe | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/assignments` | URL directe | Indisponible | FAIL |
| onboarding | `/onboarding/history` | Clic | Indisponible | FAIL |
| onboarding | `/onboarding/notifications` | Clic | Écran rendu | NOT TESTED |
| onboarding | `/onboarding/settings` | URL directe | Indisponible | FAIL |
| support | `/support-agent` | URL directe | Écran rendu | NOT TESTED |
| support | `/support-agent/tickets` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/unassigned` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/mine` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/priority` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/escalations` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/users` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/bookings` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/knowledge` | URL directe | Indisponible | FAIL |
| support | `/support-agent/reports` | URL directe | Indisponible | FAIL |
| support | `/support-agent/notifications` | Clic | Écran rendu | NOT TESTED |
| support | `/support-agent/settings` | URL directe | Indisponible | FAIL |
| moderation | `/moderation` | URL directe | Écran rendu | NOT TESTED |
| moderation | `/moderation/reports` | Clic | Écran rendu | NOT TESTED |
| moderation | `/moderation/videos` | Clic | Indisponible | FAIL |
| moderation | `/moderation/comments` | URL directe | Indisponible | FAIL |
| moderation | `/moderation/profiles` | Clic | Écran rendu | NOT TESTED |
| moderation | `/moderation/messages` | Clic | Indisponible | FAIL |
| moderation | `/moderation/appeals` | URL directe | Indisponible | FAIL |
| moderation | `/moderation/sanctions` | URL directe | Indisponible | FAIL |
| moderation | `/moderation/history` | Clic | Indisponible | FAIL |
| moderation | `/moderation/rules` | URL directe | Indisponible | FAIL |
| moderation | `/moderation/notifications` | Clic | Écran rendu | NOT TESTED |
| moderation | `/moderation/settings` | URL directe | Indisponible | FAIL |
| finance | `/finance` | URL directe | Écran rendu | NOT TESTED |
| finance | `/finance/transactions` | Clic | Écran rendu | NOT TESTED |
| finance | `/finance/pending` | Clic | Écran rendu | NOT TESTED |
| finance | `/finance/failed` | Clic | Écran rendu | NOT TESTED |
| finance | `/finance/refunds` | Clic | Écran rendu | NOT TESTED |
| finance | `/finance/disputes` | Clic | Écran rendu | NOT TESTED |
| finance | `/finance/commissions` | Clic | Écran rendu | NOT TESTED |
| finance | `/finance/wallets` | URL directe | Indisponible | FAIL |
| finance | `/finance/payouts` | URL directe | Indisponible | FAIL |
| finance | `/finance/reconciliation` | URL directe | Indisponible | FAIL |
| finance | `/finance/reports` | Clic | Indisponible | FAIL |
| finance | `/finance/anomalies` | URL directe | Indisponible | FAIL |
| finance | `/finance/audit` | Clic | Indisponible | FAIL |
| finance | `/finance/settings` | URL directe | Indisponible | FAIL |
| operations | `/operations` | URL directe | Écran rendu | NOT TESTED |
| operations | `/operations/users` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/providers` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/salons` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/bookings` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/categories` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/areas` | URL directe | Indisponible | FAIL |
| operations | `/operations/promotions` | URL directe | Indisponible | FAIL |
| operations | `/operations/support` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/onboarding` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/moderation` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/content` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/notifications` | Clic | Écran rendu | NOT TESTED |
| operations | `/operations/reports` | URL directe | Indisponible | FAIL |
| operations | `/operations/audit` | Clic | Indisponible | FAIL |
| operations | `/operations/settings` | URL directe | Indisponible | FAIL |
| admin | `/admin` | URL directe | Écran rendu | NOT TESTED |
| admin | `/admin/alerts` | URL directe | Indisponible | FAIL |
| admin | `/admin/activity` | Clic | Indisponible | FAIL |
| admin | `/admin/health` | URL directe | Indisponible | FAIL |
| admin | `/admin/clients` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/providers` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/salons` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/staff` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/agents` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/roles` | URL directe | Indisponible | FAIL |
| admin | `/admin/permissions` | URL directe | Indisponible | FAIL |
| admin | `/admin/sessions` | URL directe | Indisponible | FAIL |
| admin | `/admin/suspended` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/services` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/categories` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/bookings` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/availability` | URL directe | Indisponible | FAIL |
| admin | `/admin/areas` | URL directe | Indisponible | FAIL |
| admin | `/admin/promotions` | URL directe | Indisponible | FAIL |
| admin | `/admin/videos` | Clic | Indisponible | FAIL |
| admin | `/admin/comments` | URL directe | Indisponible | FAIL |
| admin | `/admin/social-reports` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/tickets` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/escalations` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/disputes` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/transactions` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/commissions` | URL directe | Indisponible | FAIL |
| admin | `/admin/refunds` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/payouts` | URL directe | Indisponible | FAIL |
| admin | `/admin/financial-reports` | Clic | Indisponible | FAIL |
| admin | `/admin/kyc` | URL directe | Indisponible | FAIL |
| admin | `/admin/validations` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/notifications` | Clic | Écran rendu | NOT TESTED |
| admin | `/admin/campaigns` | URL directe | Indisponible | FAIL |
| admin | `/admin/platform-settings` | URL directe | Indisponible | FAIL |
| admin | `/admin/integrations` | URL directe | Indisponible | FAIL |
| admin | `/admin/system-logs` | Clic | Indisponible | FAIL |
| admin | `/admin/audit` | Clic | Indisponible | FAIL |
| admin | `/admin/security` | Clic | Indisponible | FAIL |
| admin | `/admin/deletion-requests` | URL directe | Indisponible | FAIL |


## Annexe : inventaire des RPC privilégiées

Inventaire des 92 fonctions exposées avant correction. « PASS — refus direct » ne valide que la fermeture de l’entrée héritée. Les autres RPC restent indiquées NOT TESTED pour leur qualification exhaustive, même lorsqu’un parcours fonctionnel précédent en a exercé une partie. Les contrôles internes et les dépendances de trigger doivent être testés avec des données appartenant à plusieurs comptes.

| Fonction | Accès API après correction | Qualification exhaustive / contrôle ciblé |
|---|---|---|
| `admin_assign_role` | authenticated | NOT TESTED exhaustivement |
| `admin_bind_invitation` | authenticated | NOT TESTED exhaustivement |
| `admin_change_internal_access` | authenticated | NOT TESTED exhaustivement |
| `admin_feature_social_post` | authenticated | NOT TESTED exhaustivement |
| `admin_global_search` | authenticated | NOT TESTED exhaustivement |
| `admin_list_team` | authenticated | NOT TESTED exhaustivement |
| `admin_list_users` | authenticated | NOT TESTED exhaustivement |
| `admin_manage_category` | authenticated | NOT TESTED exhaustivement |
| `admin_mfa_required` | authenticated | NOT TESTED exhaustivement |
| `admin_moderate_social_post` | authenticated | NOT TESTED exhaustivement |
| `admin_prepare_invitation` | authenticated | NOT TESTED exhaustivement |
| `admin_resend_invitation` | authenticated | NOT TESTED exhaustivement |
| `admin_set_provider_status` | authenticated | NOT TESTED exhaustivement |
| `admin_set_user_suspension` | authenticated | NOT TESTED exhaustivement |
| `admin_update_booking_status` | authenticated | NOT TESTED exhaustivement |
| `admin_update_setting` | authenticated | NOT TESTED exhaustivement |
| `archive_owned_business` | authenticated | NOT TESTED exhaustivement |
| `attach_payment_provider` | Entrée API révoquée | PASS — refus direct après correction |
| `calculate_service_quote` | anon, authenticated | NOT TESTED exhaustivement |
| `close_admin_session` | authenticated | NOT TESTED exhaustivement |
| `complete_provider_onboarding_information` | Entrée API révoquée | PASS — refus direct après correction |
| `compute_provider_launch_completeness` | Entrée API révoquée | PASS — refus direct après correction |
| `confirm_service_and_release` | authenticated | NOT TESTED exhaustivement |
| `create_provider_video_post` | authenticated | NOT TESTED exhaustivement |
| `create_social_media_post` | authenticated | NOT TESTED exhaustivement |
| `create_video_post` | authenticated | NOT TESTED exhaustivement |
| `ensure_authenticated_profile` | authenticated | NOT TESTED exhaustivement |
| `ensure_booking_conversation` | authenticated | NOT TESTED exhaustivement |
| `fail_payment_initialization` | authenticated | NOT TESTED exhaustivement |
| `get_admin_context` | anon, authenticated | NOT TESTED exhaustivement |
| `get_admin_dashboard` | authenticated | NOT TESTED exhaustivement |
| `get_available_slots` | anon, authenticated | NOT TESTED exhaustivement |
| `get_provider_follower_counts` | anon, authenticated | NOT TESTED exhaustivement |
| `get_provider_launch_checklist` | authenticated | PASS sur les contrôles ciblés ; NOT TESTED exhaustivement |
| `get_social_admin_dashboard` | authenticated | NOT TESTED exhaustivement |
| `grant_support_conversation_access` | authenticated | NOT TESTED exhaustivement |
| `has_admin_permission` | anon, authenticated | NOT TESTED exhaustivement |
| `has_business_commercial_permission` | anon, authenticated | NOT TESTED exhaustivement |
| `has_conversation_access` | anon, authenticated | NOT TESTED exhaustivement |
| `initialize_client_control_center` | authenticated | NOT TESTED exhaustivement |
| `initialize_payment` | Entrée API révoquée | PASS — refus direct après correction |
| `initialize_payment_v2` | authenticated | NOT TESTED exhaustivement |
| `is_admin` | anon, authenticated | NOT TESTED exhaustivement |
| `is_conversation_member` | anon, authenticated | NOT TESTED exhaustivement |
| `is_super_admin` | anon, authenticated | NOT TESTED exhaustivement |
| `list_my_booking_conversations` | authenticated | NOT TESTED exhaustivement |
| `manage_moderation_report` | authenticated | NOT TESTED exhaustivement |
| `manage_own_social_post` | authenticated | NOT TESTED exhaustivement |
| `manage_provider_onboarding` | Entrée API révoquée | PASS — refus direct après correction |
| `manage_refund_request` | authenticated | NOT TESTED exhaustivement |
| `manage_support_ticket` | authenticated | PASS sur les contrôles ciblés ; NOT TESTED exhaustivement |
| `mark_conversation_read` | authenticated | NOT TESTED exhaustivement |
| `nearby_providers` | anon, authenticated | NOT TESTED exhaustivement |
| `notification_delivery_health` | authenticated | NOT TESTED exhaustivement |
| `owns_business` | authenticated | NOT TESTED exhaustivement |
| `professional_application_detail` | authenticated | NOT TESTED exhaustivement |
| `professional_application_history` | authenticated | NOT TESTED exhaustivement |
| `provider_creator_statistics` | authenticated | NOT TESTED exhaustivement |
| `provider_social_conversion_summary` | authenticated | NOT TESTED exhaustivement |
| `record_admin_session` | authenticated | NOT TESTED exhaustivement |
| `record_post_booking_click` | anon, authenticated | NOT TESTED exhaustivement |
| `record_post_share` | anon, authenticated | NOT TESTED exhaustivement |
| `record_product_event` | anon, authenticated | NOT TESTED exhaustivement |
| `record_social_profile_visit` | anon, authenticated | NOT TESTED exhaustivement |
| `record_video_view` | anon, authenticated | NOT TESTED exhaustivement |
| `report_post_comment` | authenticated | NOT TESTED exhaustivement |
| `report_social_post` | authenticated | NOT TESTED exhaustivement |
| `request_account_deletion` | authenticated | NOT TESTED exhaustivement |
| `request_payment_refund` | Entrée API révoquée | PASS — refus direct après correction |
| `request_payment_refund_v2` | authenticated | NOT TESTED exhaustivement |
| `request_professional_document_update` | authenticated | NOT TESTED exhaustivement |
| `request_professional_profile` | authenticated | NOT TESTED exhaustivement |
| `request_provider_onboarding` | authenticated | NOT TESTED exhaustivement |
| `review_professional_application` | authenticated | NOT TESTED exhaustivement |
| `revoke_support_conversation_access` | authenticated | NOT TESTED exhaustivement |
| `save_client_location` | authenticated | NOT TESTED exhaustivement |
| `save_client_profile` | authenticated | NOT TESTED exhaustivement |
| `save_professional_onboarding` | authenticated | NOT TESTED exhaustivement |
| `save_provider_location` | authenticated | NOT TESTED exhaustivement |
| `send_conversation_message` | authenticated | NOT TESTED exhaustivement |
| `set_conversation_archived` | authenticated | NOT TESTED exhaustivement |
| `set_owned_service_status` | authenticated | NOT TESTED exhaustivement |
| `social_post_not_strongly_reported` | anon, authenticated | NOT TESTED exhaustivement |
| `submit_provider_for_review` | authenticated | NOT TESTED exhaustivement |
| `synchronize_account_status` | authenticated | NOT TESTED exhaustivement |
| `toggle_follow_provider` | authenticated | NOT TESTED exhaustivement |
| `toggle_follow_provider_from_post` | authenticated | NOT TESTED exhaustivement |
| `toggle_post_like` | authenticated | NOT TESTED exhaustivement |
| `toggle_post_save` | authenticated | NOT TESTED exhaustivement |
| `update_client_identity` | authenticated | NOT TESTED exhaustivement |
| `update_owned_service_pricing` | authenticated | NOT TESTED exhaustivement |
| `write_admin_audit` | Entrée API révoquée | PASS — refus direct après correction |
| `attach_payment_provider_server` (nouvelle entrée technique) | service_role uniquement | PASS : client refusé, propriétaire vérifié, mode test, rattachement unique |
