# Workflow de fiabilité Mata Beauty

## Installation locale

Exécuter `node scripts/install-quality-hooks.mjs` dans chaque clone. L'installation est locale au dépôt et refuse d'écraser une autre configuration de hooks. Les hooks peuvent être contournés par Git : ils ne remplacent pas les contrôles distants.

## Changement

1. Décrire le comportement attendu et reproduire le problème ; relever branche et version réellement publiée.
2. Définir le périmètre ; lire les instructions et guides de compétences ; sélectionner les profils de revue nécessaires.
3. Implémenter une correction minimale, avec test de régression si le risque le justifie. Ne pas modifier des données réelles pour fabriquer une preuve.
4. Exécuter `node scripts/quality-gate.mjs` : hygiène, tests du garde-fou, lint, TypeScript, tests et build. Le premier échec arrête la commande.
5. Pour une modification d'interface/parcours, exécuter la recette navigateur isolée et pertinente. Une indisponibilité de navigateur reste une limite explicite, pas une réussite.
6. Examiner les retours de revue ; documenter changement, tests et risques dans la PR.
7. Livrer uniquement dans le périmètre autorisé ; vérifier commit, état READY et version publique. Ne pas confondre CI réussie et déploiement en production.

## Contrôles installés

- Pre-commit : espaces/conflits Git et inspection des fichiers **indexés**, pas uniquement du disque.
- Pre-push : arbre propre et version HEAD uniquement, puis commande complète de qualité. Les nouveaux fichiers doivent être indexés/committés pour être couverts par le scan global.
- GitHub `Mata quality` : jobs `quality` et `browser-regressions`, lecture seule, sans secret de production ; déclenchés sur PR et branches de livraison.
- Le garde-fou de secrets est volontairement limité (fichiers .env privés, clés privées, jetons GitHub et clés AWS reconnaissables). Il ne remplace pas un scanner exhaustif.

## Protection des branches

Les workflows ne bloquent pas à eux seuls une fusion et ne retardent pas automatiquement le déploiement Vercel lié à un push. Les règles de branche doivent exiger `quality` et `browser-regressions` et imposer une PR pour garantir ce blocage. Leur activation nécessite les droits d'administration du dépôt. Ne pas affirmer cette protection active sans preuve.

## Tests avec données

Utiliser les fixtures locales ou un projet explicitement isolé. Ne pas automatiser les scripts de provisioning, de suppression, de messagerie ou de QA distante contre la production. Ne jamais ajouter de jeton service-role de production au workflow. Pour une migration, utiliser un fichier versionné, vérifier RLS et tester la compatibilité avant application autorisée.
