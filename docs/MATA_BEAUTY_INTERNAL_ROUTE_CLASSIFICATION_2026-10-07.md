# Classification des 48 routes internes — 7 octobre 2026

## Méthode et limites

Base : les 48 échecs du parcours Super Admin AAL2 sur la version 491db45. **31 A, 0 B, 17 C**. Les A restent dans le périmètre à corriger ; leur classement ne signifie pas que la correction est validée.

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
| /moderation/comments | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
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
| /operations/promotions | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /operations/reports | C | Ancien écran de reporting sans workflow distinct. |
| /operations/audit | A | Source incorrecte admin_audit_logs ; table réelle audit_logs sous RLS audit.read. |
| /operations/settings | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/alerts | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/activity | A | Activité journalisée existante dans audit_logs mais route secondaire incorrecte. |
| /admin/health | A | Écran plateforme existant dans le menu principal mais route secondaire non raccordée. |
| /admin/roles | A | Matrice Équipe & Accès existante mais route secondaire non raccordée. |
| /admin/permissions | A | Matrice Équipe & Accès existante mais route secondaire non raccordée. |
| /admin/sessions | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/availability | C | Ancienne entrée globale inutilisée ; disponibilités gérées dans chaque espace professionnel. |
| /admin/areas | C | Aucun référentiel global de zones administrées utilisé par la recherche. |
| /admin/promotions | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/videos | A | Gestion de contenu existante dans le menu principal mais route secondaire non raccordée. |
| /admin/comments | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/commissions | A | Écran des règles et écritures existant mais route secondaire non raccordée. |
| /admin/payouts | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/financial-reports | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/kyc | A | Examen réel des dossiers/documents existant mais route secondaire non raccordée. |
| /admin/campaigns | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/platform-settings | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/integrations | C | Ancien écran inutilisé ; intégrations et secrets restent configurés côté serveur et fournisseur. |
| /admin/system-logs | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/audit | A | Journal existant dans le menu principal mais route secondaire non raccordée. |
| /admin/security | A | Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin. |
| /admin/deletion-requests | A | Les clients peuvent demander la suppression ; le traitement interne reste nécessaire et ne peut pas être retiré comme obsolète. |

## Vérifications déjà exécutées pendant cette reprise

- 34 contrôles API Équipe & Accès : PASS sur QA, puis production ; invitation, MFA, changement de rôle, suspension, réactivation, révocation, audit et restriction des agrégats.
- 17 contrôles navigateur Équipe & Accès : PASS sur production ; invitation Finance par formulaire et e-mail Resend de test, activation, MFA, changements vers Onboarding/Modération/Finance/Support, refus des cinq autres espaces et de l'API de gestion d'équipe, suspension, réactivation, révocation.
- Invitations initiales distinctes Support, Onboarding et Modération : 18 contrôles navigateur PASS pour chaque rôle, en production, avec activation, MFA, restrictions, changement de rôle, suspension, réactivation et révocation. Ces suites se recouvrent et ne représentent pas 54 fonctions différentes.
- 22 contrôles API d’intégrité sociale, accès aux documents privés et alertes anti-abus : PASS sur QA et production après migrations ciblées.
- PHYSICAL TRACKPAD : NOT TESTED — PHYSICAL TRACKPAD REQUIRED.

## Sécurité

Fuite reproduite : Support AAL2 pouvait recevoir les agrégats administratifs financiers via get_admin_dashboard. Migration 20261007144455 appliquée et retestée sur QA et production. Le tableau de bord général exige désormais les permissions des domaines agrégés ; les métriques sociales financières sont nulles sans payments.read. Aucun droit supplémentaire accordé.

La matrice CRUD exhaustive et les actions des modules secondaires restent en cours. Les chiffres ci-dessus ne sont pas une certification de l'ensemble de l'application.
