# Mata Beauty — audit de la chaîne vidéo et du feed

Date : 31 août 2026

Branche : `codex/launch-phase-2`

Périmètre : Studio prestataire → Storage → persistance Supabase → RLS → `social_feed` → lecteur client

Production : **non touchée**

Statut global : **FAIL / BLOCKED — Preview Vercel créée, backend Supabase QA isolé indisponible**

## Conclusion exécutable

La chaîne a été durcie de bout en bout dans le code et dans une migration versionnée. La publication n'affiche désormais un succès qu'après vérification de la ligne persistée, de la prestation principale, du média, de la présence dans `social_feed` et de la création d'URLs signées. Le feed lit directement la source chronologique, utilise un curseur stable, invalide son cache après publication et ne dépend plus d'un `list()` Storage préalable.

Une Preview Vercel réelle a été créée et inspectée. Elle embarque les marqueurs compilés du correctif vidéo, mais sa configuration Preview pointe vers le même projet Supabase que la Production. La création d'une branche Supabase isolée a été refusée par la plateforme, car l'organisation n'a pas accès à la fonctionnalité Branching. Aucun compte, média ou enregistrement QA n'a donc été créé sur ce backend partagé. Aucun contournement par des données simulées n'est présenté comme une validation distante.

## Validation distante du 31 août 2026

- URL Preview exacte : `https://mata-beauty-83a0q7o2h-africrm.vercel.app`.
- Déploiement Vercel : `dpl_7WLW42nn1RSMUhhAGDBJL6gxQfhj`.
- Cible Vercel inspectée : `preview`, état `READY`; aucune promotion Production.
- Commit source local déployé : `1171f9c053e8227865f64fb1ed8ad144621e7e67`.
- Preuve du code livré : les bundles distants contiennent le message `Votre vidéo a été publiée.` et l'événement `mata:feed:invalidate`, tous deux introduits par ce commit.
- Supabase configuré en Preview : `qjdwxdbvrxedyfolnpol.supabase.co`.
- Supabase configuré en Production : `qjdwxdbvrxedyfolnpol.supabase.co`.
- Isolation : **FAIL**, les deux cibles sont identiques.
- Tentative de branche QA `video-feed-qa-1171f9c` : **FAIL**, réponse Supabase `402 entitlement_required`, Branching réservé au plan Pro ou supérieur.
- Projets Supabase alternatifs : aucun projet Mata Beauty QA actif disponible.
- Migration distante `20260831010000_harden_video_delivery_chain.sql` : **NON APPLIQUÉE**, afin de ne pas modifier la Production.
- Comptes professionnel/client QA : **NON CRÉÉS**.
- Données et objets QA créés : **0**.
- Nettoyage QA : **PASS par absence de création**; aucun résidu QA public n'a été introduit.

La Preview a été ouverte sur desktop et à `390 × 844`. La page, la navigation mobile et l'état vide du feed s'affichent sans débordement horizontal ni erreur console. La CSP distante est présente et contient `upgrade-insecure-requests`. Le contrôle serveur répond `ok` avec configuration, base et rôle serveur disponibles. Ces vérifications restent non mutantes et ne constituent pas la preuve du parcours vidéo demandé.

## Diagnostic et corrections

| Étape | État initial / erreur | Cause racine | Correction | Preuve disponible |
|---|---|---|---|---|
| Upload vidéo et miniature | Le RPC pouvait réussir puis les fichiers être supprimés | Le `catch` supprimait les objets même après persistance si une étape ultérieure échouait | Drapeau `persisted`; nettoyage uniquement avant persistance | Tests unitaires et build |
| Retour de publication | Succès déclaré au seul retour du RPC | Absence de vérification DB, feed et Storage | Relecture de `posts`, relations, `social_feed` et URLs signées avant confirmation | Test du validateur + scénario distant renforcé |
| Message Studio | Message ambigu sur la visibilité | Le succès n'était pas corrélé à une livraison complète | Message exact `Votre vidéo a été publiée.` seulement après vérification | Assertion E2E distante ajoutée |
| Visibilité publique | Plusieurs politiques répétaient des critères incomplets | La cohérence entre `posts`, média et Storage pouvait diverger | Fonction centrale `is_public_social_post` et politiques RLS alignées | Migration versionnée |
| Propriété Storage | Lecture propriétaire fondée sur `owner_id` | Ce champ peut différer selon le mode/version d'upload | Vérification du premier segment du chemin, déjà imposé à l'upload | Migration versionnée |
| Résolution média | `list()` puis `createSignedUrl()` | Appel redondant, plus lent et source d'échecs RLS | Signature directe du chemin autorisé | E2E local Chromium/WebKit |
| Ordre du feed | Les contenus de lancement pouvaient dominer les nouveaux posts | Lecture prioritaire de `launch_social_feed` | Lecture de `social_feed`, tri `published_at desc, id desc` | E2E local et build |
| Pagination | Décalage calculé depuis le nombre de cartes affichées | Filtrage, diversification ou média invalide faussait l'offset | Curseur composite `published_at` + `id`, garde anti-concurrence | Inspection, typecheck, E2E |
| Cache | Le feed pouvait conserver l'état précédent après publication | Pas d'invalidation inter-composants | Suppression du cache session et événement `mata:feed:invalidate` | E2E local |
| WebKit local | Feed bloqué sur `https://localhost` | CSP `upgrade-insecure-requests` active en développement | Directive limitée à la production | Test Playwright iPhone 13/WebKit |

## Contrat de livraison vérifié par le client

Une vidéo annoncée comme publiée doit satisfaire simultanément les conditions suivantes :

1. `posts.id` correspond à l'identifiant demandé.
2. `status = 'published'`, `visibility = 'public'` et `published_at` est renseigné.
3. Le profil prestataire est approuvé et non suspendu.
4. Une prestation active est reliée comme prestation principale.
5. `social_post_media` relie le chemin vidéo et le chemin miniature attendus dans `provider-social-media`.
6. La ligne est lisible dans `social_feed`.
7. La vidéo et la miniature peuvent recevoir une URL signée.

En cas d'échec après persistance, le Studio indique que la visibilité n'a pas pu être confirmée et conserve les objets Storage; il ne crée pas silencieusement un post dont les médias ont été supprimés.

## Schéma, RLS et requête du feed

- Migration : `supabase/migrations/20260831010000_harden_video_delivery_chain.sql`.
- Tables concernées : `posts`, `post_services`, `provider_services`, `provider_profiles`, `profiles`, `social_post_media` et `storage.objects`.
- Vue lue par le client : `public.social_feed` avec `security_invoker=true`.
- Bucket : `provider-social-media`, privé; lecture via URLs signées.
- Fonction de cohérence : `public.is_public_social_post(uuid)`, `security definer`, `search_path` vide.
- Index de curseur : `(published_at desc, id desc)` limité aux publications publiques et publiées.
- Aucun secret ni rôle de service n'est exposé au navigateur.

## Lecteur, mobile et interactions

Le scénario Playwright ciblé vérifie deux cartes, une seule vidéo active, la mise en pause lors du défilement, le chargement anticipé, les filtres et le démarrage du parcours de réservation. Il passe sous Chromium et sous WebKit avec un profil iPhone 13. Le test isole le front avec des réponses réseau déterministes; il prouve le comportement du lecteur et du feed, pas l'état d'une base distante.

## Résultats des contrôles finaux

| Contrôle | Résultat |
|---|---|
| `pnpm lint` | Réussi |
| `pnpm typecheck` | Réussi |
| `pnpm test` | 14 fichiers, 64 tests réussis |
| Playwright feed ciblé — Chromium | Réussi |
| Playwright feed ciblé — WebKit / iPhone 13 | Réussi |
| `pnpm build` | Réussi, Next.js 16.2.11 |
| `pnpm build:sites` | Réussi |
| Preview Vercel nouvelle | PASS — cible `preview`, état `READY` |
| Présence du correctif dans les bundles | PASS — confirmation et invalidation retrouvées |
| Service role limité au serveur/QA | PASS statique — feed sur client Supabase + RLS; secret référencé côté serveur et scripts QA uniquement |
| Migration Supabase Preview | FAIL / BLOCKED — aucun backend isolé |
| Compte professionnel QA | NON CRÉÉ |
| Compte client QA | NON CRÉÉ |
| Upload réel Studio | FAIL / NON EXÉCUTÉ |
| Objet Storage réel | FAIL / NON EXÉCUTÉ |
| Ligne DB et relations réelles | FAIL / NON EXÉCUTÉ |
| RLS positive et négative distante | FAIL / NON EXÉCUTÉ |
| Feed réel | FAIL / NON EXÉCUTÉ; feed Preview actuellement vide |
| Autoplay réel | FAIL / NON EXÉCUTÉ |
| Scroll vertical multi-vidéo | FAIL / NON EXÉCUTÉ |
| Pagination distante | FAIL / NON EXÉCUTÉ |
| iPhone/WebKit réel | FAIL / NON EXÉCUTÉ; rendu 390 px seulement contrôlé |
| Chromium distant | PARTIEL — ouverture et console sans erreur, aucune vidéo réelle |
| Like persistant | FAIL / NON EXÉCUTÉ |
| Save persistant | FAIL / NON EXÉCUTÉ |
| Profil et prestation | FAIL / NON EXÉCUTÉ |
| Réservation | FAIL / NON EXÉCUTÉ |
| Console Preview | PASS sur état vide — aucune erreur ou alerte |
| Network Preview | PARTIEL — page, CSP et santé serveur disponibles; aucun média à contrôler |
| Nettoyage QA | PASS — aucune donnée QA créée |
| Test distant réel Studio → client | **FAIL / BLOCKED** |

## Scénarios d'acceptation Preview restant à exécuter

Ces scénarios doivent être rejoués sur une Preview isolée après application de la migration :

1. Se connecter comme prestataire approuvé, téléverser une vraie vidéo et une vraie miniature, associer une prestation active et publier.
2. Vérifier directement en base les statuts, la relation principale et les chemins média.
3. Vérifier la lecture anonyme/client de la ligne dans `social_feed` et la signature des deux objets Storage.
4. Recharger le compte client, confirmer que la nouvelle publication apparaît en tête sans duplication.
5. Tester lecture, pause, reprise, défilement, filtres, réservation, desktop et mobile.
6. Vérifier l'absence d'erreurs console, 401/403/404, requêtes répétées et médias bloqués.

Infrastructure à fournir avant reprise, sans coller de secret dans un message ni le committer :

- soit activer Supabase Branching sur l'organisation et autoriser la création d'une branche isolée;
- soit fournir un projet Supabase QA distinct, vide et dédié à cette recette;
- relier les variables Vercel Preview à ce backend isolé;
- rendre les clés QA disponibles exclusivement au runner sécurisé pour les preuves et le nettoyage.

## Traçabilité Git

Le correctif doit être committé sans inclure le fichier utilisateur non suivi `docs/PRODUCTION_READINESS_2026-08-16.md`. Le SHA du commit correctif est consigné dans le message de remise final; il ne peut pas être inscrit à l'intérieur du même commit sans créer une référence circulaire.

## Décision

**FAIL / BLOCKED. La Preview Vercel existe, mais le parcours Professionnel → Studio → upload → Client → lecture → swipe → like → save → profil → réservation n'a pas été exécuté. Une base Supabase QA isolée est obligatoire avant de poursuivre. Aucune mutation de Production n'a été effectuée.**
