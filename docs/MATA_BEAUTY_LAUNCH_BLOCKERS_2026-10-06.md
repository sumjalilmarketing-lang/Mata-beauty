# MATA Beauty — levée des blocages du 6 octobre 2026

Ce document complète la recette Partie 3. Il distingue les contrôles exécutés, les défauts corrigés et les réserves encore ouvertes. Le domaine de référence est **https://mata-beauty.com**. Les comptes et prestations de recette sont isolés ; aucune adresse de test ni secret n’est publié ici.

## Anomalies reproduites et corrections

| ID | Problème et cause | Risque | Correction | Preuve actuelle |
|---|---|---|---|---|
| SEC-03 | `is_admin()` vérifiait seulement le rôle du profil, pas la validité de l’affectation administrative. Une session existante restait reconnue après révocation. | HAUT : accès RLS administratif conservé après révocation. | Exiger une affectation active, non révoquée et un rôle actif, en conservant le contrôle MFA. | FAIL avant correction ; PASS QA et production après correction. |
| SEC-04 | Deux RPC de gestion de prestation étaient exécutables par anon. La comparaison `provider_id <> auth.uid()` devenait NULL pour un visiteur et ne déclenchait pas le refus. | CRITIQUE : modification anonyme des prix et statuts de prestations. | Refus explicite sans identité et révocation de l’exécution anon/PUBLIC. | Prix de recette réellement passé à 13 999 et statut à paused avant correction ; accès refusé ensuite. Autre client refusé ; propriétaire autorisé. Aucun professionnel réel touché. |
| SEC-05 | Le chemin de suspension dans `manage_moderation_report` mettait directement à jour le profil, sans réutiliser la protection du compte Super Admin. | HAUT : un rôle possédant users.suspend et reports.manage pouvait contourner les restrictions de l’écran Utilisateurs. | Appeler `admin_set_user_suspension`, qui protège l’accès propre et les Super Admin. | Administrateur ordinaire doté des deux permissions : refus confirmé en QA et production ; cible non suspendue. |
| DATA-01 | Santé partageait un Promise.all avec des API commerciales absentes. Certaines erreurs étaient ignorées ; compteurs initialisés à zéro et état serveur faux. | HAUT opérationnel : fausse absence d’activité ou faux incident. | Mesures indépendantes, valeurs nullables, délai maximal, horodatage ; « Indisponible » pour une mesure absente. La sonde est correctement décrite comme base/serveur, sans prétendre tester Google Auth. | Navigateur Preview : état normal, deux sources coupées, autres mesures conservées, puis reprise PASS. |
| DATA-02 | Le chiffre d’affaires additionnait `simulated_paid`. Les commissions incluaient potentiellement les paiements de test. | MOYEN : pilotage financier trompeur. | Exclure `is_test` et le fournisseur mock des sommes financières ; inclure les signalements reviewing dans le compteur ouvert. | Insertion d’un paiement simulé de 15 000 : aucun changement du CA ni des commissions, QA et production. |
| BOOK-01 | Le refus d’un créneau occupé pouvait provenir de l’exclusion SQL (23P01) ou du contrôle de disponibilité (P0001). | MOYEN : même conflit mais message générique selon le moment de la requête. | Même code 23P01 dans les deux chemins. | Deux clients simultanés et double requête : une seule réservation persistée, autre requête refusée avec 23P01. |
| OPS-01 | Le support interne utilisait une liste générique de signalements ; les réponses n’étaient pas ouvertes côté client. | HAUT opérationnel : demande créée sans circuit de réponse exploitable. | Raccorder les tickets et échanges aux tables/RPC existantes, côté agent et client. | Preview : demande client → réponse agent → lecture client → réponse client → résolution et statut persisté PASS. |
| OPS-02 | L’onglet Signalements du Super Admin n’appelait pas l’API de traitement existante. | HAUT opérationnel : impossible de traiter un signalement dans cet onglet. | Raccorder la liste, le contexte, la justification et les décisions à `manage_moderation_report`. | PASS Preview : signalement, masquage, audit, clôture dans la file et restauration. Retest production requis. |

Les fichiers de preuve détaillés restent dans `work/final-audit/` : `security-before-revocation-fix.json`, `anonymous-service-before-fix.json`, `final-role-security.json`, `booking-concurrency.json`, `operations-preview-final`, `degraded-preview`, `video-operations-preview-final` (4 PASS, dont erreur 503 de réservation et reprise).

## Inventaire nominatif des modules précédemment non connectés

La navigation Super Admin à `/admin` change d’onglet côté client. Les routes `/admin/[module]` utilisent un autre composant générique : elles ne constituent pas automatiquement le même écran. « Interface OUI » signifie rubrique visible, pas gestion fonctionnelle. Le backend est contrôlé dans le schéma réel de production.

| Module / route | Rôle ou permission | Interface | Backend existant | API connectée | Données réelles dans cet écran | Problème / risque | Bloquant |
|---|---|---|---|---|---|---|---|
| Salons — `/admin`, onglet Salons | providers.read | OUI | OUI, businesses et tables associées | NON | NON | Rubrique descriptive ; gestion salon disponible côté propriétaire, pas de traitement administratif complet dans cet onglet. | OUI pour traitement administratif des salons |
| Avis — `/admin`, onglet Avis | reviews.moderate | OUI | OUI, reviews | NON | NON | Pas de file de modération connectée ici. | OUI pour ouverture publique avec avis |
| Signalements — `/admin`, onglet Signalements ; `/moderation/reports` | reports.manage | OUI | OUI, reports et RPC de décision | OUI, correctif | OUI, lecture réelle | Raccordement effectué ; recette de décision à terminer sur le domaine après déploiement. | OUI jusqu’au retest |
| Litiges — `/admin`, onglet Litiges | reports.manage | OUI | OUI, disputes | NON | NON | Pas de traitement des litiges dans cet écran. Les paiements restent mock. | OUI pour gestion publique des litiges |
| Promotions — `/admin`, onglet Promotions | content.manage | OUI | OUI, promotions | NON | NON | Pas de gestion de campagne connectée ; ne pas lancer de promotion depuis cet écran. | NON si aucune campagne lancée |
| Support — `/admin`, onglet Support ; `/support-agent/tickets`, `/unassigned`, `/mine`, `/priority` | support.manage | OUI | OUI, tickets/messages/événements et RPC | OUI, correctif | OUI, lecture réelle | Le circuit client/agent fonctionne en Preview ; retest production requis. | OUI jusqu’au retest |
| Administrateurs — `/admin`, onglet Administrateurs | roles.manage | OUI | OUI, admin_user_roles et RPC | NON | NON | Attribution/révocation non pilotable depuis cet onglet. | OUI pour gestion autonome des accès |
| Rôles — `/admin`, onglet Rôles et permissions | roles.manage | OUI | OUI, admin_roles/permissions | NON | NON | Matrice et gestion non connectées. Le contrôle serveur existe, ce qui ne remplace pas cet écran. | OUI pour gestion autonome des accès |
| Sécurité — `/admin`, onglet Sécurité | roles.manage | OUI | PARTIEL, MFA et sessions | NON | NON | MFA au login opérationnel ; gestion des sessions absente de cet onglet. | OUI pour révocation opérationnelle des sessions |
| Paramètres — `/admin`, onglet Paramètres | settings.read | OUI | PARTIEL, app_settings | NON pour les cartes descriptives | NON | Cartes explicitement en lecture seule/non connectées ; aucun faux réglage actif. | NON pour une configuration stable ; OUI si modification nécessaire |
| Lancement — `/admin`, onglet Lancement | users.read | OUI | NON pour get_launch_dashboard en production | NON fonctionnelle | NON, indisponible après correctif | Migration commerciale non appliquée ; valeurs artificielles supprimées. | NON pour réservation ; pilotage commercial indisponible |
| Cohorte — `/admin`, onglet Cohorte lancement | providers.read | OUI | NON pour launch_provider_cohort_overview en production | NON fonctionnelle | NON, indisponible après correctif | Données manquantes ; formulaire non présenté comme opérationnel en cas d’erreur. | NON hors programme fondateur |
| Alertes antifraude — Santé plateforme | settings.read | OUI | NON, fraud_alerts absente en production | NON fonctionnelle | NON, « Indisponible » | Pas de surveillance antifraude effective derrière ce compteur. | OUI si ce contrôle est requis pour ouverture publique |
| Reversements — `/admin`, onglet Reversements | payouts.manage | OUI | PARTIEL | NON pour exécution réelle | NON pour un paiement réel | Aucun fournisseur réel validé ; conserver mock. | NON pour paiement sur place ; OUI avant paiement en ligne réel |

Les sous-écrans génériques Support (base de connaissances, rapports, paramètres), Modération (appels, sanctions, règles, paramètres), Finance (wallets, rapprochement, etc.) ne sont pas validés par leur simple affichage. Leur inventaire détaillé et leur test restent **NOT TESTED** : ils ne sont pas inclus dans un PASS global « tous les menus ».

### Complément : raccordements génériques inspectés dans le code

Toutes les lignes suivantes ont une interface de navigation existante. « Lecture seule » décrit le raccordement trouvé dans `workspace-module.tsx`, pas un PASS navigateur. Le catalogue des tables de production a été interrogé ; aucun traitement métier n’a été supposé à partir d’une table seule. Les routes sans ressource configurée restent indisponibles.

| Module / route | Rôle / permission | Backend | API / données réelles | Problème, risque et blocage |
|---|---|---|---|---|
| Support — `/support-agent/escalations` | reports.manage | reports existe ; support_tickets aussi | Lecture générique reports | Aucune sélection des tickets escaladés : mauvais périmètre. OUI avant usage de cette file. |
| Support — `/support-agent/users` | users.read | profiles | Lecture seule réelle | Aucun circuit de ticket contextualisé ; NOT TESTED. NON pour répondre aux tickets déjà ouverts. |
| Support — `/support-agent/bookings` | bookings.read | bookings | Lecture seule réelle | Pas de filtre par demande support ; NOT TESTED. NON pour le circuit ticket simple. |
| Support — `/support-agent/knowledge` | espace Support | Aucun raccordement identifié | NON | Procédures non disponibles ; NON si procédures externes maintenues. |
| Support — `/support-agent/reports` | espace Support | Agrégation non connectée | NON | Volume/délais/satisfaction non calculés ; NON pour traitement manuel. |
| Support — `/support-agent/settings` | espace Support | Aucun raccordement identifié | NON | Préférences indisponibles ; NON pour traitement manuel. |
| Modération — `/moderation/videos` | reports.manage | posts | Lecture générique réelle | Aucun filtre « signalées ou masquées » dans cette vue ; OUI avant usage de cette file. |
| Modération — `/moderation/comments` | reviews.moderate | Aucun raccordement dans ce module | NON | Commentaires signalés non traitables ici ; OUI avant usage public des commentaires. |
| Modération — `/moderation/profiles` | providers.read | profiles | Lecture générique réelle | Pas de filtre des profils signalés ni antécédents ; OUI avant usage de cette file. |
| Modération — `/moderation/messages` | reports.manage | messages | Lecture générique réelle, limitée par RLS | Aucune sélection des messages signalés ; OUI avant usage de cette file. |
| Modération — `/moderation/appeals` | espace Modération | Aucun raccordement identifié | NON | Appels non traitables ici ; OUI pour circuit d’appel autonome. |
| Modération — `/moderation/sanctions` | espace Modération | moderation_actions existe | NON | Historique des sanctions non raccordé ; OUI pour suivi autonome. |
| Modération — `/moderation/history` | reports.manage | audit existant | Lecture générique admin_audit_logs | Filtrage métier et droits à tester ; NOT TESTED, OUI pour preuve complète des décisions. |
| Modération — `/moderation/rules` | espace Modération | Aucun raccordement identifié | NON | Référentiel indisponible ; NON si procédures externes maintenues. |
| Modération — `/moderation/settings` | espace Modération | Aucun raccordement identifié | NON | Préférences indisponibles ; NON pour décision simple. |
| Finance — `/finance/dashboard` | payments.read | bookings/payments existent | Lecture générique bookings | Ne calcule pas les indicateurs annoncés de finance ; OUI avant usage pour décisions financières. |
| Finance — `/finance/transactions` | payments.read | payments | Lecture seule réelle | Actions et détails non connectés ; NOT TESTED. Paiement mock conservé. |
| Finance — `/finance/pending` | payments.read | payments | Lecture générique réelle | Aucun filtre des paiements en attente ; OUI avant usage financier. |
| Finance — `/finance/failed` | payments.read | payments | Lecture générique réelle | Aucun filtre des échecs ; OUI avant usage financier. |
| Finance — `/finance/refunds` | payments.refund | refunds existe | Lecture de payments, pas refunds | Circuit de remboursement absent de cet écran ; OUI avant paiement réel. |
| Finance — `/finance/disputes` | payments.read | disputes existe | Lecture de reports, pas disputes | Mauvaise source métier ; OUI avant paiement réel. |
| Finance — `/finance/commissions` | commissions.manage | commission_rules/platform_commissions | Lecture générique payments | Gestion des règles absente ; OUI avant commission réelle. |
| Finance — `/finance/wallets` | payments.read | wallets/wallet_ledger | NON | Soldes non calculés dans cet écran ; OUI avant paiement réel. |
| Finance — `/finance/payouts` | payouts.manage | payouts/payout_batches | NON | Aucun versement réel ; OUI avant paiement réel. |
| Finance — `/finance/reconciliation` | espace Finance | payments/wallet_ledger | NON | Aucun rapprochement ; OUI avant paiement réel. |
| Finance — `/finance/reports` | audit.read | audit existant | Lecture générique audit | Aucun rapport financier exportable ; OUI avant pilotage financier. |
| Finance — `/finance/anomalies` | espace Finance | Agrégation non identifiée | NON | Aucun contrôle des écarts ; OUI avant paiement réel. |
| Finance — `/finance/audit` | audit.read | financial_audit_log existe | Lecture admin_audit_logs | Journal financier spécifique non raccordé ; OUI avant paiement réel. |
| Finance — `/finance/settings` | settings.read | app_settings existe | NON | Réglages non raccordés ; NON tant que configuration stable/mock. |
| Onboarding — `/onboarding/assignments` | documents.review | Affectations non raccordées ici | NON | Répartition des dossiers absente de cet écran ; OUI pour répartition autonome. |
| Onboarding — `/onboarding/history` | documents.review | audit existant | Lecture générique audit | Périmètre et permissions à tester ; NOT TESTED. |
| Onboarding — `/onboarding/settings` | settings.read | app_settings existe | NON | Préférences non raccordées ; NON pour traitement simple d’un dossier. |

Ce relevé expose aussi des raccordements incorrects, et ne les classe pas comme fonctionnalités validées. Les rubriques Opérations et les routes alternatives `/admin/[module]` demandent encore leur qualification complète ; aucune validation globale de tous les menus n’est prononcée.

## Données de démonstration et valeurs artificielles

- **A — intentionnelles et identifiées :** paiement mock/is_test et libellés de simulation ; fichiers et comptes QA à suppression après recette ; icônes et exemples des champs de formulaire, qui ne sont pas des données métier.
- **B — temporaires de développement :** fixtures et scripts de tests, preuves sous work ; ils ne prouvent pas l’existence de données en production. Les comptes de recette sont supprimés après les scénarios ; les runs interrompus nécessitent une vérification séparée.
- **C — trompeuses corrigées :** zéros et état serveur de Santé après erreurs de dépendances ; mesures commerciales initialisées à zéro ; montants simulés inclus dans le CA/commissions. Les premiers sont devenus indisponibles, les montants financiers sont filtrés côté SQL.
- **C — audit restant :** plusieurs anciens écrans utilisent encore `data ?? []` ou `count ?? 0` sans distinguer une erreur de chargement d’un résultat vide. Ils ne doivent pas être déclarés validés en réseau dégradé sans test spécifique. Le fichier `work/final-audit/demo-data-inventory.txt` conserve le relevé de recherche, qui doit être interprété ligne par ligne (un attribut HTML placeholder n’est pas une fausse donnée).

## Sécurité : réserves restantes sans dissimulation

La fermeture des RPC anonymes ne constitue pas une certification complète de sécurité. Les fonctions de trigger et les deux helpers internes de commission n’ont pas besoin d’être exposés aux clients : leurs grants ont été retirés. Les RPC administratives nominatives gardent leurs contrôles de permission et perdent le grant anon inutile. Les helpers RLS et les lectures publiques nécessaires ne sont pas révoqués aveuglément.

Après durcissement, le catalogue réel compte **17 fonctions SECURITY DEFINER exécutables par anon et 87 par authenticated**, contre 40 et 100 auparavant. Ce sont des comptes de surface exposée, pas des nombres de failles. Les fonctions anonymes restantes servent notamment aux disponibilités/devis publics, à la proximité, aux contrôles RLS et aux événements de consultation. Leur exposition doit être qualifiée individuellement. Les avertissements Supabase sur les grants, deux extensions publiques et la protection des mots de passe compromis ne sont pas déclarés résolus.

| Réserve | Surface et scénario | Impact / probabilité / gravité | Correction ou contrôle requis | Statut |
|---|---|---|---|---|
| SEC-R01 | Autres RPC SECURITY DEFINER, variantes NULL, IDs étrangers, états et appels répétés | Impact potentiellement élevé ; probabilité non quantifiée ; classification fonction par fonction incomplète | Achever l’inventaire de sécurité existant avec tests d’accès/refus et conditions métier, sans classer automatiquement chaque grant comme faille | NOT TESTED partiel, bloquant public |
| SEC-R02 | Certaines anciennes politiques et fonctions utilisent `is_admin()` plutôt qu’une permission métier | Risque de droits trop larges entre rôles internes ; exploitation non reproduite dans cette passe | Matrice inter-rôles sur données privées et écritures, remplacement ciblé par permissions adaptées | NOT TESTED, bloquant public |
| SEC-R03 | Deux extensions dans public : btree_gist, pg_net | Avertissement d’exposition ; exploitation non démontrée | Qualifier ACL et usages, déplacer uniquement après vérification des dépendances | NOT TESTED |
| SEC-R04 | Protection des mots de passe compromis désactivée | Réutilisation de mots de passe connus ; probabilité dépend des utilisateurs ; gravité moyenne | Activer la protection si disponible dans le plan, puis tester l’inscription/rejet sans exposer le mot de passe | NOT TESTED / configuration non activée |
| SEC-R05 | Écart réel entre QA et production : RPC de support manquante en QA, colonnes avancées de provider_services absentes | QA incapable de représenter tous les chemins de production ; risque de migration/reconstruction | Aligner le schéma versionné et vérifier une reconstruction reproductible ; ne pas prendre un PASS QA comme preuve automatique de parité | FAIL de parité, bloquant public |

Références techniques : [contrôles RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [fonctions SECURITY DEFINER exposées](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Contrôles humains

Le nouveau compte Google et sa boîte sont disponibles selon l’utilisateur. Le clic effectué depuis MATA a toutefois repris automatiquement le compte déjà connecté chez Google : **ce n’est pas une première inscription**. Le choix du nouveau compte et son consentement ont été confiés à l’utilisateur ; la première inscription et la lecture de ses e-mails restent BLOCKED tant que ce passage n’est pas confirmé.

- GPS réel : **NOT TESTED — PHYSICAL DEVICE REQUIRED**. Cinq états simulés dans le navigateur passent (autorisé, refusé, indisponible, délai dépassé, imprécis), avec saisie manuelle Dakar dans chaque cas.
- Trackpad physique : **NOT TESTED — PHYSICAL TRACKPAD REQUIRED**. La molette automatisée n’est pas une preuve de trackpad physique.
- Boîte humaine : réception/lecture/liens/mobile des e-mails bienvenue, réservation, candidature, complément et approbation non constatés dans cette passe. Les anciens reçus Resend prouvent l’acceptation par le transport, pas la lecture humaine.

