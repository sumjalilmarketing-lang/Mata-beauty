# Mata Beauty — audit fonctionnel du 7 novembre 2026

Les résultats navigateur actualisés et les limites de couverture figurent dans la description de la PR https://github.com/sumjalilmarketing-lang/Mata-beauty/pull/41 et ses artefacts CI. Ce README conserve le point de départ local pour rendre la démarche reproductible.

Version publiée auditée : `86d5d0190faa809f9467e5ef058479116e336e91`.
La copie locale initiale `2a25e188` possède exactement le même arbre Git `014e2075485e7ca08eb57e021ec5e9a155ae18f6`.
Aucune modification de production. Aucun compte, ticket, fermeture, image ou paiement réel créé pendant cet audit.

## Exécution

Depuis la racine du dépôt, avec Node 24 et pnpm 11.25.0 :

```bash
pnpm install --frozen-lockfile
node scripts/audit-functional-inventory.mjs
node scripts/quality-gate.mjs
MATA_E2E_COLLABORATOR_ACCESS_ENABLED=true pnpm test:e2e --project=desktop tests/e2e/server-routing-audit.spec.ts
MATA_E2E_COLLABORATOR_ACCESS_ENABLED=true MATA_PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/google-chrome pnpm test:e2e --project=desktop --project=mobile-390 tests/e2e/functional-audit-negative.spec.ts tests/e2e/internal-links-audit.spec.ts tests/e2e/reviews-resilience-audit.spec.ts tests/e2e/server-routing-audit.spec.ts tests/e2e/booking-audit.spec.ts tests/e2e/public-flows.spec.ts
```

`test-e2e.mjs` démarre Next.js et une fixture HTTP isolée, avec des identifiants fictifs, puis arrête les serveurs. Il ne valide pas les signatures Auth réelles, RLS, la délivrabilité email/WhatsApp, Google OAuth réel, les paiements réels, ni les notifications sur téléphone physique.

## Résultats initiaux locaux avant la recette GitHub

- Inventaire AST : 291 sources app/lib, 32 pages et 45 handlers route, 707 interactions, 70 formulaires, 380 champs, 295 expressions de navigation, 571 accès fetch/from/rpc. Un appel `from` n'est pas forcément une requête envoyée.
- 52 candidats automatiques « bouton sans type/onClick » doivent être interprétés avec leur formulaire parent : ce ne sont pas 52 anomalies.
- 172 cas Playwright découverts sur les projets desktop et mobile-390, répartis sur six fichiers de la commande d'audit. « Découvert » ne signifie pas « exécuté ».
- HTTP E2E local sur la version auditée : 18 exécutés, 13 échecs, 5 réussites. Les 13 échecs reproduisent deux anomalies : 12 chemins malformés acceptés et mauvais message sur panne profil.
- Même recette HTTP après application du patch dans une copie temporaire : 18/18 réussis.
- Correctifs proposés : patch applicable, TypeScript et compilation Next.js de la copie corrigée réussis, lint sans erreur avec huit avertissements préexistants.
- Navigateur local : Chromium ne démarre pas (`process_singleton_posix.cc`, création de socket refusée). Les nouveaux tests de clics n'ont pas été exécutés. Leur envoi GitHub a été refusé par le contrôle automatique, l'autorisation précédente étant limitée aux quatre fichiers du correctif des avis. Aucun contournement effectué.

## Livrables

- `inventory.json` et CSV : inventaire complet des éléments détectés, emplacement et attributs. Tous les éléments ne sont pas individuellement validés au runtime.
- `workspace-modules.json` : modules déclarés par espace, y compris ceux qui peuvent être masqués selon les rôles, permissions et fonctionnalités.
- `proposed-fixes.patch` : huit groupes de corrections sur 19 fichiers ; non appliqué au dépôt principal ni à la production.
- `server-routing-audit.spec.ts` : routage réel Next → fixture HTTP, sans navigateur.
- `functional-audit-negative.spec.ts` : critères d'acceptation volontairement rouges tant que les défauts demeurent. Aucun `skip`, `test.fail()` ou remplacement de l'attendu pour masquer un échec.
- `internal-links-audit.spec.ts` : exploration par rôle, GET de chaque destination unique et clic sur ses liens visibles, détection 404/page blanche/crash/identifiants invalides, preuve jointe. Les liens masqués, instances répétées et actions à jeton sont explicitement distingués. Ne prétend pas cliquer toutes les occurrences de tous les liens.
- `reviews-resilience-audit.spec.ts` : 400/401/403/500, absence de faux succès, conservation du commentaire, reprise et blocage durant l'envoi, échéance.
- `booking-audit.spec.ts` : parcours inscription simulée → notice de confirmation email → connexion → catalogue/feed → réservation → confirmation → fermeture du dialogue → route réservations ; tests micro-feedback et clics concurrents sociaux ajoutés aux scénarios existants.

## Appliquer les propositions dans une branche isolée

```bash
git apply --check docs/qa/2026-11-07/proposed-fixes.patch
git apply docs/qa/2026-11-07/proposed-fixes.patch
node scripts/quality-gate.mjs
```

Exécuter ensuite la recette navigateur complète avant toute livraison. Sur délai dépassé d'une mutation, recharger l'état serveur avant une nouvelle tentative : un abort HTTP ne garantit pas que le serveur n'a rien enregistré. Les corrections UI évitent les doubles clics simultanés ; elles ne remplacent pas une clé d'idempotence serveur contre deux onglets/requêtes.

Conclusion : pas de GO exhaustif. Aucun défaut bloquant démontré ; deux groupes majeurs et six mineurs identifiés. Deux groupes reproduits au runtime et corrigés dans la copie isolée ; les autres restent confirmés par lecture de code, avec validation navigateur à terminer.
