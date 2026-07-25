# Mata Beauty — instructions de contribution

- Garder TypeScript en mode strict et ne pas contourner les erreurs avec `any`.
- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` au navigateur.
- Toute nouvelle table publique doit activer RLS et recevoir des politiques testées.
- Les changements de schéma passent par une migration versionnée dans `supabase/migrations`.
- Le paiement reste en mode `mock` jusqu’à validation d’un fournisseur réel.
- Exécuter `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` avant un commit.
- Ne jamais committer `.env`, des mots de passe ou des jetons.
