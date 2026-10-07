import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const baseline=JSON.parse(await readFile('work/permission-audit/modules-baseline-491db45.json','utf8'));
const failures=baseline.results.filter(row=>row.status==='FAIL');
assert.equal(failures.length,48);
const obsolete=new Map([
 ['/support-agent/knowledge','Ancienne entrée de navigation seule : aucun écran, appel applicatif, table ou workflow de base de connaissances. Retirée du catalogue.'],
 ['/moderation/appeals','Ancienne entrée de navigation seule : aucun parcours de contestation exposé ni workflow de traitement. Retirée du catalogue.'],
 ['/moderation/rules','Ancienne entrée de navigation seule : aucun référentiel géré par le produit. Retirée du catalogue.'],
 ['/onboarding/assignments','Entrée séparée sans workflow distinct ; prise en charge déjà intégrée à la file des dossiers.'],
 ['/onboarding/settings','Ancien écran vide de préférences agent ; sécurité et MFA déjà gérés par Équipe & Accès.'],
 ['/support-agent/reports','Ancien écran de reporting sans source métier distincte ; suivi conservé dans les files de tickets.'],
 ['/support-agent/settings','Ancien écran vide de préférences agent ; sécurité et MFA conservés.'],
 ['/moderation/messages','Aucun workflow de signalement des conversations privées dans le produit. Retrait ; ne pas exposer les conversations à la modération par défaut.'],
 ['/moderation/sanctions','Ancienne entrée dupliquant les décisions de modération et leur historique existant.'],
 ['/moderation/settings','Ancien écran vide de préférences de modération.'],
 ['/finance/reports','Ancien écran sans rapport distinct ; transactions et journal financier conservés.'],
 ['/finance/settings','Ancien écran de préférences Finance sans réglage propre ; aucun fournisseur réel activé.'],
 ['/operations/areas','Aucun référentiel de zones administrées ; localisation conservée dans les profils professionnels.'],
 ['/operations/reports','Ancien écran de reporting sans workflow distinct.'],
 ['/admin/availability','Ancienne entrée globale inutilisée ; disponibilités gérées dans chaque espace professionnel.'],
 ['/admin/areas','Aucun référentiel global de zones administrées utilisé par la recherche.'],
 ['/admin/integrations','Ancien écran inutilisé ; intégrations et secrets restent configurés côté serveur et fournisseur.'],
]);
const causes=new Map([
 ['/onboarding/history','Source incorrecte admin_audit_logs ; raccordement à onboarding_events sous RLS documents.review.'],
 ['/moderation/history','Source incorrecte admin_audit_logs ; raccordement à moderation_actions sous RLS reports.manage.'],
 ['/moderation/videos','Le sélecteur de composants considérait vidéos comme un composant personnalisé même sans composant pour ce rôle.'],
 ['/moderation/messages','Le module annoncé concerne des messages signalés ; une liste de conversations privées ne constitue pas une correction acceptable. Workflow spécifique à qualifier.'],
 ['/finance/wallets','Vue wallet_balances existante mais sans connecteur UI ; lecture RLS payments.read.'],
 ['/finance/payouts','Registre payouts existant sans connecteur UI ; aucun fournisseur de versement réel autorisé.'],
 ['/finance/reconciliation','Registre reconciliation_runs existant sans connecteur UI ; lecture seule, pas de rapprochement fournisseur réel.'],
 ['/finance/anomalies','Registre financial_security_events existant sans connecteur UI.'],
 ['/finance/audit','Source incorrecte admin_audit_logs ; raccordement au journal financier append-only financial_audit_log.'],
 ['/operations/audit','Source incorrecte admin_audit_logs ; table réelle audit_logs sous RLS audit.read.'],
 ['/admin/health','Écran plateforme existant dans le menu principal mais route secondaire non raccordée.'],
 ['/admin/roles','Matrice Équipe & Accès existante mais route secondaire non raccordée.'],
 ['/admin/permissions','Matrice Équipe & Accès existante mais route secondaire non raccordée.'],
 ['/admin/videos','Gestion de contenu existante dans le menu principal mais route secondaire non raccordée.'],
 ['/admin/commissions','Écran des règles et écritures existant mais route secondaire non raccordée.'],
 ['/admin/kyc','Examen réel des dossiers/documents existant mais route secondaire non raccordée.'],
 ['/admin/audit','Journal existant dans le menu principal mais route secondaire non raccordée.'],
 ['/admin/activity','Activité journalisée existante dans audit_logs mais route secondaire incorrecte.'],
 ['/admin/deletion-requests','Les clients peuvent demander la suppression ; le traitement interne reste nécessaire et ne peut pas être retiré comme obsolète.'],
]);
const rows=failures.map(row=>({path:row.path,category:obsolete.has(row.path)?'C':'A',reason:obsolete.get(row.path)??causes.get(row.path)??'Rubrique annoncée sans écran métier raccordé. Conservée comme défaut à qualifier/corriger ; aucun refus de permission ne justifie le résultat Super Admin.'}));
const report=`# Classification des 48 routes internes — 7 octobre 2026

## Méthode et limites

Base : les 48 échecs du parcours Super Admin AAL2 sur la version 491db45. **${rows.filter(row=>row.category==='A').length} A, 0 B, ${rows.filter(row=>row.category==='C').length} C**. Les A restent dans le périmètre à corriger ; leur classement ne signifie pas que la correction est validée.

A : nécessaire ou annoncée et cassée/incomplète. B : refus attendu pour le rôle testé. C : ancienne entrée inutilisée retirée. Les refus Finance/Support/Onboarding/Modération sont testés séparément ; ils ne reclassent pas rétroactivement un écran cassé pour Super Admin en PASS.

Les corrections de code listées ci-dessous ne sont **pas** des PASS de recette. Une source de données raccordée ou une liste vide ne valide pas ses opérations métier. Les retraits C doivent aussi être vérifiés par URL directe après déploiement (404 pour un rôle habilité, refus d'accès conservé pour un rôle non habilité).

| Route | Classe | Cause / traitement |
|---|---|---|
${rows.map(row=>`| ${row.path} | ${row.category} | ${row.reason} |`).join('\n')}

## Vérifications déjà exécutées pendant cette reprise

- 34 contrôles API Équipe & Accès : PASS sur QA, puis production ; invitation, MFA, changement de rôle, suspension, réactivation, révocation, audit et restriction des agrégats.
- 17 contrôles navigateur Équipe & Accès : PASS sur production ; invitation Finance par formulaire et e-mail Resend de test, activation, MFA, changements vers Onboarding/Modération/Finance/Support, refus des cinq autres espaces et de l'API de gestion d'équipe, suspension, réactivation, révocation.
- Invitations initiales distinctes Support, Onboarding et Modération : 18 contrôles navigateur PASS pour chaque rôle, en production, avec activation, MFA, restrictions, changement de rôle, suspension, réactivation et révocation. Ces suites se recouvrent et ne représentent pas 54 fonctions différentes.
- 22 contrôles API d’intégrité sociale, accès aux documents privés et alertes anti-abus : PASS sur QA et production après migrations ciblées.
- PHYSICAL TRACKPAD : NOT TESTED — PHYSICAL TRACKPAD REQUIRED.

## Sécurité

Fuite reproduite : Support AAL2 pouvait recevoir les agrégats administratifs financiers via get_admin_dashboard. Migration 20261007144455 appliquée et retestée sur QA et production. Le tableau de bord général exige désormais les permissions des domaines agrégés ; les métriques sociales financières sont nulles sans payments.read. Aucun droit supplémentaire accordé.

La matrice CRUD exhaustive et les actions des modules secondaires restent en cours. Les chiffres ci-dessus ne sont pas une certification de l'ensemble de l'application.
`;
await writeFile('docs/MATA_BEAUTY_INTERNAL_ROUTE_CLASSIFICATION_2026-10-07.md',report);
console.log(JSON.stringify({A:rows.filter(row=>row.category==='A').length,B:0,C:rows.filter(row=>row.category==='C').length,total:rows.length}));
