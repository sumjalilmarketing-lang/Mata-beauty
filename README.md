# Mata Beauty

Mata Beauty est une marketplace de réservation de prestations beauté conçue
pour le Sénégal et extensible à l’Afrique francophone. Cette première version
livre une expérience responsive complète, trois tableaux de bord de
démonstration et une fondation Supabase sécurisée.

## Ce qui fonctionne

- catalogue de 12 prestataires avec recherche, zone et catégories ;
- profils détaillés, favoris et états vides ;
- parcours de réservation avec prestation, date, créneau, lieu et paiement sur
  place en mode test ;
- espaces client, prestataire et administration ;
- adaptation mobile, tablette et ordinateur ;
- module Supabase Auth REST pour inscription, connexion, déconnexion et
  récupération de mot de passe dès que les variables sont configurées ;
- migration PostgreSQL complète avec 24 tables, contraintes, index, triggers,
  prévention des doubles réservations, Storage et RLS ;
- données de référence de démonstration séparées dans `supabase/seed.sql`.

Le catalogue affiché est volontairement un jeu de démonstration embarqué. Les
écritures persistantes nécessitent de relier un projet Supabase.

## Prérequis

- Node.js 22 ou plus récent ;
- pnpm 11 ;
- Supabase CLI uniquement pour lancer ou appliquer la base localement.

## Installation et lancement

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

Ouvrir ensuite `http://localhost:3000`.

Sur macOS ou Linux, remplacer la commande `copy` par :

```bash
cp .env.example .env.local
```

## Variables

Renseigner localement, sans jamais les committer :

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_ID=
SUPABASE_DB_PASSWORD=
SUPABASE_ACCESS_TOKEN=
PAYMENT_PROVIDER_MODE=mock
```

`SUPABASE_SERVICE_ROLE_KEY` est réservée au serveur. Elle ne doit jamais être
préfixée par `NEXT_PUBLIC_`.

## Base locale Supabase

```bash
supabase start
supabase db reset
```

`db reset` est destiné uniquement à la base locale de développement. Pour un
projet distant déjà lié, vérifier le projet puis appliquer les migrations non
destructives :

```bash
supabase status
supabase db push --dry-run
supabase db push
```

Ne jamais lancer ces commandes contre une base contenant des données réelles
sans sauvegarde et revue humaine.

## Contrôles qualité

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Comptes de démonstration

L’interface propose des vues de démonstration sans mot de passe. Aucun compte
Auth réel n’est committé. Après connexion Supabase, créer trois utilisateurs
locaux via Auth puis attribuer les rôles `client`, `provider` et `admin` dans
`profiles`. L’attribution du rôle administrateur doit être réalisée côté
serveur ou en SQL par un opérateur autorisé, jamais depuis le navigateur.

## Structure

- `app/` : expérience publique et tableaux de bord ;
- `lib/supabase.ts` : client Auth minimal utilisant uniquement la clé anonyme ;
- `supabase/migrations/` : schéma PostgreSQL et politiques RLS ;
- `supabase/seed.sql` : catégories de démonstration idempotentes ;
- `docs/ARCHITECTURE.md` : décisions d’architecture et frontières de sécurité ;
- `tests/` : vérifications critiques du produit et de la migration.

## Limites du MVP

- Supabase n’est pas lié tant que les variables et l’outil CLI ne sont pas
  fournis ;
- le catalogue embarqué ne persiste pas encore les actions dans la base ;
- Wave, Orange Money et carte restent désactivés ; aucun faux fournisseur n’est
  utilisé ;
- la messagerie et les notifications sont modélisées en base mais leur
  synchronisation temps réel reste à brancher ;
- les tests RLS d’intégration nécessitent une instance Supabase locale.
