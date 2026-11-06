# Mata Beauty — instructions de contribution

- Garder TypeScript en mode strict et ne pas contourner les erreurs avec `any`.
- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` au navigateur.
- Toute nouvelle table publique doit activer RLS et recevoir des politiques testées.
- Les changements de schéma passent par une migration versionnée dans `supabase/migrations`.
- Le paiement reste en mode `mock` jusqu’à validation d’un fournisseur réel.
- Exécuter `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` avant un commit.
- Ne jamais committer `.env`, des mots de passe ou des jetons.

## Qualité et revues

- Suivre `docs/quality/workflow.md` pour chaque changement. Exécuter `node scripts/quality-gate.mjs` avant livraison ; conserver les résultats et les limites de validation.
- Consulter `docs/quality/review-roles.md` pour déléguer les revues indépendantes lorsque des sous-agents sont disponibles et autorisés. Un agent principal reste responsable de l'intégration et des conflits ; aucune écriture concurrente sur les mêmes fichiers.
- Appliquer les compétences spécialisées décrites dans `docs/quality/skills.md`, avec les skills disponibles ou leurs vérifications équivalentes. Ces guides ne constituent pas des agents autonomes installés.
- Ne pas annoncer un test navigateur, multi-compte ou appareil comme réussi s'il n'a pas réellement été exécuté. Distinguer fixtures, base isolée et production.
- Ne jamais lancer automatiquement les scripts `verify-*-remote`, créer des comptes ou attribuer des rôles en production depuis CI. Aucun secret de production dans les tests.
- Les échecs des contrôles ne doivent pas être masqués, remplacés par un skip ou contournés pour livrer. Signaler et corriger la cause.
