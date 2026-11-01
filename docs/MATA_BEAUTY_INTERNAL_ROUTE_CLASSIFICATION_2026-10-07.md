# Classification des 48 routes internes — 7 octobre 2026

## Méthode et limites

Base : les 48 échecs du parcours Super Admin AAL2 sur la version 491db45. **31 A, 0 B, 17 C**. Les A restent dans le périmètre du produit ; leur classement décrit le défaut initial.

A : nécessaire ou annoncée et cassée/incomplète. B : refus attendu pour le rôle testé. C : ancienne entrée inutilisée retirée. Les refus Finance/Support/Onboarding/Modération sont testés séparément ; ils ne reclassent pas rétroactivement un écran cassé pour Super Admin en PASS.

Les corrections de code listées ci-dessous ne sont **pas** des PASS de recette. Une source de données raccordée ou une liste vide ne valide pas ses opérations métier. Les retraits C doivent aussi être vérifiés par URL directe après déploiement (404 pour un rôle habilité, refus d'accès conservé pour un rôle non habilité).

| Route | Classe | Cause / traitement |
|---|---|---|
| /onboarding/assignments | C | Entrée séparée sans workflow distinct ; prise en charge déjà intégrée à la file des dossiers. |
| /onboarding/history | A | Source incorrecte admin_audit_logs ; raccordement à onboarding_events sous RLS documents.review. |
| /onboarding/settings | C | Ancien écran vide de préférences agent ; sécurité et MFA déjà gérés par Équipe & Accès. |
| /support-agent/knowledge | C | Ancienne entrée de navigation seule : aucun écran, appel applicatif, table ou workflow de base de connaissances. Retirée du catalogue. |
| /support-agent/reports | C | Ancien écran de reporting sans source métier distincte ; suivi conservé dans les files de tickets. |
| /support-agent/settings | C | Ancien écran vide de préférences agent ; sécurité et MFA conservés. |
| /moderation/videos | A | Le sélecteur de composants considérait vidéos comme un composant personnalisé même sans composant pour ce rôle. |
| /moderation/comments | A | Composant CommentModeration raccordé ; masquage/restauration sous RLS et audit, testés avec Modération et Super Admin. |
| /moderation/messages | C | Aucun workflow de signalement des conversations privées dans le produit. Retrait ; ne pas exposer les conversations à la modération par défaut. |
| /moderation/appeals | C | Ancienne entrée de navigation seule : aucun parcours de contestation exposé ni workflow de traitement. Retirée du catalogue. |
| /moderation/sanctions | C | Ancienne entrée dupliquant les décisions de modération et leur historique existant. |
| /moderation/history | A | Source incorrecte admin_audit_logs ; raccordement à moderation_actions sous RLS reports.manage. |
| /moderation/rules | C | Ancienne entrée de navigation seule : aucun référentiel géré par le produit. Retirée du catalogue. |
| /moderation/settings | C | Ancien écran vide de préférences de modération. |
| /finance/wallets | A | Vue wallet_balances existante mais sans connecteur UI ; lecture RLS payments.read. |
| /finance/payouts | A | Registre payouts existant sans connecteur UI ; aucun fournisseur de versement réel autorisé. |
| /finance/reconciliation | A | Registre reconciliation_runs existant sans connecteur UI ; lecture seule, pas de rapprochement fournisseur réel. |
| /finance/reports | C | Ancien écran sans rapport distinct ; transactions et journal financier conservés. |
| /finance/anomalies | A | Registre financial_security_events existant sans connecteur UI. |
| /finance/audit | A | Source incorrecte admin_audit_logs ; raccordement au journal financier append-only financial_audit_log. |
| /finance/settings | C | Ancien écran de préférences Finance sans réglage propre ; aucun fournisseur réel activé. |
| /operations/areas | C | Aucun référentiel de zones administrées ; localisation conservée dans les profils professionnels. |
| /operations/promotions | A | Registre promotions raccordé, lecture seule ; aucun moteur de campagne ajouté. |
| /operations/reports | C | Ancien écran de reporting sans workflow distinct. |
| /operations/audit | A | Source incorrecte admin_audit_logs ; table réelle audit_logs sous RLS audit.read. |
| /operations/settings | A | Lecture des réglages non sensibles sous settings.read ; les valeurs sensibles restent exclues. |
| /admin/alerts | A | Registre fraud_alerts restauré avec RLS reports.manage ; contrôle des doublons et agrégats santé. |
| /admin/activity | A | Activité journalisée existante dans audit_logs mais route secondaire incorrecte. |
| /admin/health | A | Écran plateforme existant dans le menu principal mais route secondaire non raccordée. |
| /admin/roles | A | Matrice Équipe & Accès existante mais route secondaire non raccordée. |
| /admin/permissions | A | Matrice Équipe & Accès existante mais route secondaire non raccordée. |
| /admin/sessions | A | Registre admin_sessions raccordé sous audit.read ; ne remplace pas les sessions Auth réelles testées par Équipe & Accès. |
| /admin/availability | C | Ancienne entrée globale inutilisée ; disponibilités gérées dans chaque espace professionnel. |
| /admin/areas | C | Aucun référentiel global de zones administrées utilisé par la recherche. |
| /admin/promotions | A | Registre promotions raccordé ; brouillons et cohorte restent dans Lancement. |
| /admin/videos | A | Gestion de contenu existante dans le menu principal mais route secondaire non raccordée. |
| /admin/comments | A | Composant de modération des commentaires partagé ; auteur et texte protégés, visibilité auditée. |
| /admin/commissions | A | Écran des règles et écritures existant mais route secondaire non raccordée. |
| /admin/payouts | A | Registre payouts partagé avec les sources Finance, en lecture seule ; aucun transfert réel activé. |
| /admin/financial-reports | A | Lecture du journal financial_audit_log append-only ; aucun rapport fournisseur fictif. |
| /admin/kyc | A | Examen réel des dossiers/documents existant mais route secondaire non raccordée. |
| /admin/campaigns | A | Registre notification_campaigns raccordé en lecture seule ; aucune campagne envoyée pendant la recette. |
| /admin/platform-settings | A | Réglages non sensibles chargés réellement ; maintenance traitée séparément, avec test QA activation/désactivation. |
| /admin/integrations | C | Ancien écran inutilisé ; intégrations et secrets restent configurés côté serveur et fournisseur. |
| /admin/system-logs | A | Journal audit_logs raccordé ; ne constitue pas un agrégateur de tous les logs fournisseurs. |
| /admin/audit | A | Journal existant dans le menu principal mais route secondaire non raccordée. |
| /admin/security | A | Registre des sessions administratives raccordé ; gestion effective des accès via Équipe & Accès. |
| /admin/deletion-requests | A | File raccordée à admin_begin_account_deletion : désactivation, révocation des sessions, audit et revue manuelle, sans fausse suppression. 13 API + 4 UI PASS production. |

## Preuves et limites actuelles

Les 31 routes A ont été raccordées ou corrigées. Leur ouverture et leurs requêtes sont inventoriées dans la matrice ; les opérations métier sont qualifiées par des suites distinctes. Les 17 routes C ont été ouvertes directement avec Super Admin : 404 attendue, PASS. Les refus des autres rôles ne sont jamais convertis en anomalies.

Voir [rapport actuel](MATA_BEAUTY_PERMISSIONS_MODULES_HARDWARE_2026-10-07.md) et [matrice détaillée](MATA_BEAUTY_ROLE_MATRIX_2026-10-07.csv). Ces documents distinguent les preuves de lecture, les mutations réellement exécutées et les limites des registres en lecture seule. Le classement A décrit le défaut initial, pas un FAIL actuel.

Équipe & Accès : 34 contrôles API production ; invitations initiales distinctes Finance, Support, Onboarding, Modération et cycle activation/MFA/changement/suspension/réactivation/révocation. Les suites se recouvrent, elles ne sont pas additionnées comme autant de fonctionnalités.

Trackpad : NOT TESTED — PHYSICAL TRACKPAD REQUIRED.