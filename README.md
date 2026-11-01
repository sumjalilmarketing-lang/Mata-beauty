# Mata Beauty

Mata Beauty est une plateforme sociale de découverte et de réservation de
prestations beauté conçue pour le Sénégal et extensible à l’Afrique
francophone. Le contenu inspire, renforce la confiance et mène directement à
une prestation réservable. La vision produit de référence est décrite dans
[`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md).

## Ce qui fonctionne

- catalogue de 12 prestataires avec recherche, zone et catégories ;
- feed vidéo vertical avec prestations liées, actions sociales et réservation ;
- attribution sécurisée des réservations générées par une vidéo ;
- profils détaillés, favoris et états vides ;
- parcours de réservation avec prestation, date, créneau, lieu et paiement sur
  place en mode test ;
- espace client relié aux réservations, favoris et notifications ;
- onboarding prestataire avec profil, prestations et envoi à validation ;
- administration avec métriques et modération des prestataires ;
- adaptation mobile, tablette et ordinateur ;
- module Supabase Auth REST pour inscription, connexion, déconnexion et
  récupération de mot de passe dès que les variables sont configurées ;
- migration PostgreSQL complète avec 24 tables, contraintes, index, triggers,
  prévention des doubles réservations, Storage et RLS ;
- données de référence de démonstration séparées dans `supabase/seed.sql`.

Le catalogue charge les prestataires approuvés depuis Supabase. Tant qu’aucun
profil réel n’est publié, l’interface conserve un aperçu embarqué clairement
étiqueté comme démonstration.

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
PAYDUNYA_MASTER_KEY=
PAYDUNYA_PRIVATE_KEY=
PAYDUNYA_TOKEN=
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

## Comptes et rôles

L’interface ne committe aucun compte Auth. Les inscriptions client et
prestataire créent automatiquement leur profil associé. L’attribution du rôle
`admin` doit être réalisée côté
serveur ou en SQL par un opérateur autorisé, jamais depuis le navigateur.

## Structure

- `app/` : expérience publique et tableaux de bord ;
- `lib/supabase/` : client navigateur utilisant uniquement la clé publiable ;
- `supabase/migrations/` : schéma PostgreSQL et politiques RLS ;
- `supabase/seed.sql` : catégories de démonstration idempotentes ;
- `docs/ARCHITECTURE.md` : décisions d’architecture et frontières de sécurité ;
- `tests/` : vérifications critiques du produit et de la migration.

## Limites du MVP

- Wave, Orange Money et carte restent désactivés ; aucun faux fournisseur n’est
  utilisé ;
- la messagerie est modélisée en base mais son interface et sa synchronisation
  temps réel restent à brancher ;
- les tests RLS d’intégration nécessitent une instance Supabase locale.
