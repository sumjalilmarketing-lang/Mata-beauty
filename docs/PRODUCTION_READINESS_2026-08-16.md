# Mata Beauty — Production Readiness — 2026-08-16

## Verdict exécutif

La base applicative et les suites locales sont stables, mais la Production ne doit pas être promue.

Blocages critiques :

1. le CLI Vercel local n'est pas authentifié (`Not authorized`) ;
2. le projet Vercel `mata-beauty` n'est actuellement relié à aucun dépôt Git ;
3. aucune Preview ne correspond au dernier commit GitHub ;
4. les credentials Supabase Production requis côté public et serveur ne sont pas tous valides ;
5. le parcours E2E réel doit être rejoué sur la future Preview exacte avant toute promotion.

## Références

- Dépôt : `sumjalilmarketing-lang/Mata-beauty`
- Branche : `codex/full-audit-and-fixes`
- Commit GitHub audité : `e47a98502773cee5936ad53a83c124dd2e1531bf`
- Projet Vercel : `mata-beauty`
- Project ID : `prj_dKh0QiVpaXnzzy9C921NAJyT2toZ`
- Team/Org ID : `team_QueFKLsphP5XjW3Mih5eZZDG`
- Équipe Vercel : `africrm` (Hobby)
- Compte visible dans le tableau de bord : `sumjalilmarketing-lang`
- Projet Supabase : `qjdwxdbvrxedyfolnpol` (`Mata-beauty`, branche `main`, Production)

## Diagnostic Vercel

### CLI

- `vercel deploy --yes` : `Not authorized`.
- Aucun fichier d'authentification CLI valide trouvé dans les emplacements Vercel standards.
- `.vercel/project.json` est présent et cible le bon Project ID et la bonne équipe.
- La session web Vercel permet de lire le projet, ses réglages, ses variables et ses déploiements.

Conclusion : le lien local du projet est correct ; l'échec vient de l'absence d'une authentification CLI valide, pas d'un mauvais Project ID.

### GitHub ↔ Vercel

Le panneau Vercel Git indique explicitement que le projet n'est connecté à aucun dépôt Git. Aucun déploiement automatique n'a donc été créé pour `e47a985`.

### Déploiements observés

- Dernière Preview : `https://mata-beauty-5rtp1k96d-africrm.vercel.app`
- SHA de cette Preview : `46cd494`
- Statut : `Ready`
- Cette Preview ne représente pas `e47a985`.
- Production actuelle : `https://mata-beauty.vercel.app`
- SHA Production actuel : `c876115`
- Statut Vercel : `Ready`, déploiement courant.
- Aucun déploiement Production n'a été effectué pendant cet audit.

## Environnements

Les valeurs secrètes ne sont jamais reproduites dans ce rapport.

| Variable | Local | Development Vercel | Preview | Production |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | PRESENT | MISSING | PRESENT | PRESENT |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | MISSING | MISSING | PRESENT | INVALID |
| `SUPABASE_SERVICE_ROLE_KEY` | MISSING | MISSING | PRESENT | MISSING |
| `NEXT_PUBLIC_APP_URL` | PRESENT | MISSING | PRESENT | PRESENT |
| `PAYMENT_PROVIDER_MODE` | PRESENT | MISSING | PRESENT | PRESENT |
| `PAYMENT_WEBHOOK_SECRET` | MISSING | MISSING | PRESENT | MISSING |
| `PAYMENT_SECURITY_PEPPER` | MISSING | MISSING | PRESENT | MISSING |

Notes :

- la Preview a été validée précédemment contre le projet Supabase attendu ;
- la clé service-role Preview reste exclusivement côté serveur ;
- les fichiers locaux contiennent les noms de variables mais pas les secrets Supabase ;
- le paiement reste en mode mock conformément aux règles du dépôt ;
- la Production ne doit pas être reconstruite avec son état actuel.

## Supabase

### Auth

- Site URL : `https://mata-beauty.vercel.app`.
- Callback Production présent : `https://mata-beauty.vercel.app/auth/callback`.
- Callback de réinitialisation et wildcard Production présents.
- Les Preview Vercel `mata-beauty-*-africrm.vercel.app/**` sont autorisées.
- Google Auth avait été testé sur Preview lors de la recette précédente.

### Storage

Buckets observés :

- `business-media` ;
- `provider-social-media` ;
- `social-videos` ;
- `social-thumbnails` ;
- `portfolios` ;
- `provider-documents` ;
- `avatars`.

Les limites de taille, types MIME et politiques sont configurés. Les médias privés du Studio utilisent des URL signées.

### RLS, RPC, triggers et Realtime

- Les tests Supabase réels précédents ont validé les restrictions RLS sociales et l'isolation des utilisateurs.
- Les opérations sociales privilégiées passent par des RPC contrôlées.
- La migration `20260816150000_repair_booking_created_notification.sql` a été appliquée et testée sur Preview.
- Le test de notification exige désormais exactement une notification `booking_created` par réservation.
- `messages` et `conversation_members` sont ajoutés à `supabase_realtime` par migration versionnée.
- La validation finale de ces éléments doit être répétée sur la Preview exacte du nouveau commit.

## Résultats techniques locaux

| Contrôle | Résultat |
| --- | --- |
| ESLint | PASS — 0 erreur |
| TypeScript strict | PASS |
| Vitest | PASS — 59/59 |
| Tests structurels | PASS — 18/18 |
| Build Next.js production | PASS — 16 routes générées |
| Playwright complet | PASS — 187/187 en 7,6 min |

### Responsive Playwright

PASS sur :

- 320 px ;
- 360 px ;
- 375 px ;
- 390 px ;
- 430 px ;
- 768 px ;
- 1024 px ;
- 1366 px ;
- 1440 px ;
- 1920 px ;
- profil Desktop Chrome standard.

Les scénarios couvrent notamment navigation, cibles tactiles, absence de débordement horizontal, Inspiration, réservation, OAuth, isolation utilisateur et retrait d'un créneau réservé.

## Parcours fonctionnels

Ces statuts distinguent les preuves locales/précédentes de la validation exigée sur la future Preview exacte.

| Parcours | État actuel | Motif |
| --- | --- | --- |
| Cliente | FAIL | non rejoué sur le SHA exact |
| Prestataire | FAIL | non rejoué sur le SHA exact |
| Salon | FAIL | non rejoué sur le SHA exact |
| Admin | FAIL | non rejoué sur le SHA exact |
| Super Admin | FAIL | non rejoué sur le SHA exact |
| Inspiration | FAIL | ancienne Preview seulement |
| Studio | FAIL | ancienne Preview seulement |
| Réservation | FAIL | ancienne Preview seulement |
| Messagerie | FAIL | non rejouée sur le SHA exact |
| Notifications | FAIL | test exact-once à rejouer |
| Avis | FAIL | non rejoué sur le SHA exact |
| RLS | FAIL | preuve réelle à répéter sur la Preview exacte |

## Audit avant Production

| Élément | Preview | Production | Statut |
| --- | --- | --- | --- |
| Supabase URL | PRESENT | PRESENT | PASS |
| Public key | PRESENT | INVALID | FAIL |
| Server credentials | PRESENT | MISSING | FAIL |
| Auth callbacks | PRESENT | PRESENT | PASS |
| Storage | PRESENT | PRESENT | PASS |
| RLS | PRESENT | PRESENT | PASS |
| Migrations | PRESENT | PRESENT | PASS |
| Vercel access | INVALID | PRESENT | FAIL |
| Build | PASS | PASS sur ancien SHA | FAIL |
| E2E | PASS sur ancien SHA | NOT TESTED | FAIL |

## Action humaine unique requise

Depuis un terminal local dans le dépôt, exécuter :

```powershell
pnpm dlx vercel@latest login
```

Terminer l'authentification dans le navigateur avec le compte qui possède l'équipe `africrm`, sans transmettre de token dans le chat. Une fois cette action terminée, Codex pourra déployer la Preview exacte, vérifier son SHA et rejouer tous les parcours réels.

## Étapes restantes avant Production

1. Authentifier le CLI Vercel.
2. Créer une Preview correspondant exactement au prochain commit audité.
3. Corriger les variables Supabase Production depuis les champs sécurisés Vercel.
4. Rejouer les E2E réels, y compris notification unique et absence d'orphelins.
5. Mettre à jour ce rapport avec l'URL et le SHA réellement déployés.
6. Demander une autorisation explicite avant toute promotion Production.

VERDICT: NOT PRODUCTION READY
