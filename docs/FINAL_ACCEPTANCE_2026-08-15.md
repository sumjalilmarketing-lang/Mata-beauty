# Mata Beauty — recette finale réelle du 15 août 2026

## Verdict

**READY pour publication avec paiement sur place et paiement en ligne désactivé.**

Les cinq blocages critiques ont été levés sur le projet Supabase `qjdwxdbvrxedyfolnpol` et contrôlés sur le Preview Vercel `https://mata-beauty-i4mbph0ix-africrm.vercel.app` (`READY`, déploiement `dpl_DvibExECLzWGFfhKiMK3L5kDUTsv`). Le paiement réel reste volontairement désactivé : aucune méthode en ligne n’est exposée sans configuration Sandbox complète, et l’interface affiche explicitement **Paiement de démonstration** en Sandbox.

Production observée pendant la recette, sans promotion à ce stade : `https://mata-beauty.vercel.app`.

## Matrice de preuve

| Domaine critique | Preuve exécutée | Résultat |
| --- | --- | --- |
| Salon | création/mise à jour, profil, GPS, horaires, fermeture, équipe, invitation, rôles, prestation, réservation, revenus, avis, médias | PASS |
| Archivage | salon, prestations et collaborateurs désactivés sans effacer l’historique | PASS |
| Réservation | prix/durée/devise/attribution serveur, double créneau refusé, visibilité cliente/prestataire/salon | PASS |
| Cycle métier | `pending → confirmed → in_progress → completed → review` | PASS |
| Avis et statistiques | note 5/5 et compteur recalculés après correction du trigger | PASS |
| Studio | prestataire approuvé, vidéo et miniature Storage, publication liée à une prestation, feed, like, save, follow, commentaire, signalement, vue, réservation attribuée | PASS |
| RLS | tiers sans lecture/modification réservation, messages, invitation, favori, brouillon ou collection | PASS |
| Paiement | mode réel fermé, Sandbox explicitement démonstrative, webhook seule source de vérité | PASS |
| Commission | règle active à date d’effet, règle future ignorée, brut/commission/net figés historiquement | PASS |
| Auth/RBAC | Client, Prestataire, Salon, Admin, Super Admin, tiers, escalade Admin→Super Admin refusée | PASS |
| Preview | build Vercel, health serveur, routes publiques, console applicative | PASS |

## Recette Supabase continue

Run : `1786829975795-1fbcca`.

Résultat : **22/22 contrôles réels réussis**.

- 6 comptes Auth temporaires : Client, Prestataire, Salon, Admin, Super Admin et tiers ;
- profils uniques et rôles distincts ;
- onboarding, prestation, disponibilité et salon réels ;
- horaires et invitation Salon privés ;
- 2 réservations avec prix et devise imposés côté serveur ;
- anti-double réservation ;
- commission à 12 % sur `18 000 XOF` : `2 160 XOF` de commission et `15 840 XOF` net, inchangés après modification de la règle et du prix catalogue ;
- conversation et réponse professionnelle privées ;
- cycle complet jusqu’à l’avis et recalcul `rating=5`, `reviews=1` ;
- notifications Cliente et Prestataire ;
- favori privé ;
- catégorie Admin visible côté Client ;
- réservation Admin et audit Super Admin.

Les six comptes, réservations, paiements de test, règles de commission, médias et données temporaires ont été supprimés par le harnais en fin de recette.

## Studio et Storage réels

Résultat du script `scripts/verify-social-remote.mjs` : **14/14 groupes de contrôles réussis**.

- vidéo et miniature envoyées dans `provider-social-media` ;
- brouillon privé et média privé inaccessible au tiers ;
- publication impossible sans prestation ;
- compteur direct forgé et modification étrangère refusés ;
- like/unlike idempotent, enregistrement et abonnement ;
- commentaire, réponse, suppression interdite au tiers et signalement ;
- vue dédupliquée et complétion ;
- collections privées ;
- réservation attribuée à la publication avec prix serveur ;
- statistiques créateur réelles.

Deux anomalies détectées par les tests réels ont été corrigées :

1. le trigger d’agrégation des avis était bloqué par le garde-fou des champs serveur ;
2. le trigger de notification sociale lisait `NEW.author_id` sur `post_likes`, qui possède `profile_id`.

## Playwright et responsive

### Suite principale

- **144/144** scénarios réussis ;
- 9 profils : bureau, 320, 360, 375, 390, 430, tablette, laptop et widescreen ;
- durée totale : **6,3 min** ;
- anti-double réservation, RLS, restauration OAuth, zones tactiles et absence de débordement inclus.

Mesures issues des tests :

- parcours classique : **8 actions**, moyenne **8,227 s**, minimum **5,353 s**, maximum **12,039 s** ;
- parcours social : **6 actions**, moyenne **6,766 s**, minimum **4,484 s**, maximum **8,967 s**.

Le parcours historique « avant » n’était pas instrumenté ; aucune mesure avant optimisation n’est inventée.

### Preview réel

- `continuous-real-acceptance.spec.ts` : **1/1**, 41,2 s ;
- vérification des espaces Client, Prestataire, Salon et tiers sur le même jeu Supabase ;
- `preview-health.spec.ts` : **1/1**, routes UI `/` et `/discover` à 200 ;
- `/manifest.webmanifest` est généré par le build et `/api/health/server` est contrôlé séparément via `vercel curl` ;
- aucune erreur JavaScript applicative ; l’injection externe de la barre Vercel, volontairement bloquée par la CSP, est exclue du signal applicatif ;
- health : `configuration=true`, `database=true`, `serviceRole=true`.

## Contrôles techniques finaux

- ESLint : PASS ;
- TypeScript strict : PASS ;
- Vitest : **57/57** ;
- tests structurels : **18/18** ;
- Playwright local : **144/144** ;
- Playwright Preview réel : **2/2** ;
- build Next.js 16.2.11 local : PASS ;
- build Vercel : PASS ;
- recherche de secrets dans les fichiers modifiés : aucun secret détecté.

## Migrations finales

- `20260815210000_salon_production_workflows.sql` ;
- `20260815211000_repair_review_rating_refresh.sql` ;
- `20260815212000_repair_social_engagement_notification.sql`.

Toutes les nouvelles tables publiques activent RLS. Le bucket `business-media` limite les écritures au propriétaire, aux images JPEG/PNG/WebP et à 12 Mo. Les documents KYC restent hors de ce bucket public.

## Limites connues

- aucun PSP réel n’est homologué : le paiement en ligne de production reste désactivé ;
- le script Vercel Live Feedback est bloqué sur Preview par la CSP stricte, sans effet sur l’application ;
- les modules sans workflow réel ont été retirés de la navigation concernée plutôt que laissés sous forme de boutons inactifs.

## Références Git et déploiement

- dépôt : `sumjalilmarketing-lang/Mata-beauty` ;
- branche : `codex/full-audit-and-fixes` ;
- commit fonctionnel testé sur Preview : `4387951` ;
- projet Vercel : `mata-beauty`, équipe `africrm` ;
- Preview testée : `https://mata-beauty-i4mbph0ix-africrm.vercel.app`.
