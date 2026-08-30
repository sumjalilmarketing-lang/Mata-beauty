# Mata Beauty — audit de la chaîne vidéo et du feed

Date : 31 août 2026

Branche : `codex/launch-phase-2`

Périmètre : Studio prestataire → Storage → persistance Supabase → RLS → `social_feed` → lecteur client

Production : **non touchée**

Statut global : **correctif validé localement, acceptation Preview distante en attente**

## Conclusion exécutable

La chaîne a été durcie de bout en bout dans le code et dans une migration versionnée. La publication n'affiche désormais un succès qu'après vérification de la ligne persistée, de la prestation principale, du média, de la présence dans `social_feed` et de la création d'URLs signées. Le feed lit directement la source chronologique, utilise un curseur stable, invalide son cache après publication et ne dépend plus d'un `list()` Storage préalable.

La validation distante réelle ne peut pas être déclarée terminée dans cet environnement : aucune URL Preview exploitable ni clé Supabase QA n'est disponible. Les variables publiques et d'administration locales nécessaires au test distant sont absentes ou vides. Aucun contournement par des données simulées n'est présenté comme une validation distante.

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
| Test distant réel Studio → client | Bloqué par configuration Preview absente |
| Validation console/réseau sur Preview | Bloquée par URL Preview absente |

## Scénarios d'acceptation Preview restant à exécuter

Ces scénarios doivent être rejoués sur une Preview isolée après application de la migration :

1. Se connecter comme prestataire approuvé, téléverser une vraie vidéo et une vraie miniature, associer une prestation active et publier.
2. Vérifier directement en base les statuts, la relation principale et les chemins média.
3. Vérifier la lecture anonyme/client de la ligne dans `social_feed` et la signature des deux objets Storage.
4. Recharger le compte client, confirmer que la nouvelle publication apparaît en tête sans duplication.
5. Tester lecture, pause, reprise, défilement, filtres, réservation, desktop et mobile.
6. Vérifier l'absence d'erreurs console, 401/403/404, requêtes répétées et médias bloqués.

Configuration à fournir de manière sécurisée dans l'environnement de test, sans la coller dans un message ni la committer :

- une URL Preview autorisée;
- `REMOTE_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY` réservée au processus de test distant;
- le cas échéant, le mécanisme d'accès à la Preview protégée.

## Traçabilité Git

Le correctif doit être committé sans inclure le fichier utilisateur non suivi `docs/PRODUCTION_READINESS_2026-08-16.md`. Le SHA du commit correctif est consigné dans le message de remise final; il ne peut pas être inscrit à l'intérieur du même commit sans créer une référence circulaire.

## Décision

**Go technique local. No-go d'acceptation Preview tant que les six scénarios distants ci-dessus n'ont pas été exécutés avec succès. Production inchangée.**
