# Mata Beauty — audit complet du parcours vidéo — 2026-08-17

## Périmètre et état distant

- Base auditée : branche `codex/video-upload-critical-fix`, commit `5b40ed28b3bb972ddae8a08c65ba24e2640882c0`.
- Production de référence : commit applicatif `5639a23cdb959be8e16a05ad0238c2e0e9a4b450`.
- Supabase : projet `qjdwxdbvrxedyfolnpol`, 40 migrations locales et distantes alignées avant cet audit.
- Contenus distants au moment de l'audit : 16 publications `published/public`, toutes de type `photo`, avec 16 médias dans `provider-social-media`.
- Aucun mock n'alimente le feed social ou le Studio en Production. Les données de démonstration ne sont présentes que dans les tests et sont nettoyées.

## Inventaire

### Routes et surfaces

- Feed immersif principal : `/`, écran interne `feed` rendu par `app/social-feed.tsx`.
- Feed espace cliente : `/app/feed` via le routeur d'espace sécurisé.
- Studio professionnel : `/pro/videos`.
- Studio Salon : `/salon/videos`.
- Partage public : `/posts/[id]` et `/video/[id]`.
- Profil public : `/professional/[username]` et profil mobile interne.
- Prestation publique : `/service/[id]`.
- Modération : `/admin/content` et espace `/moderation` selon les permissions.
- Aucune route API vidéo dédiée : l'upload utilise directement Supabase Storage sous session Auth et les écritures métier passent par des RPC sécurisées.

### Composants et domaines

- `app/social-feed.tsx` : feed, lecteur, pagination, interactions et réservation.
- `app/video-publisher.tsx` : sélection, analyse, miniature, upload et publication.
- `app/creator-studio.tsx` : bibliothèque et statuts du créateur.
- `app/social-dashboard.tsx` : statistiques créateur et inspirations cliente.
- `app/super-admin.tsx` : modération sociale et mise en avant.
- `lib/social/video-upload.ts` : validation format/taille et erreurs publiques.
- `lib/domain/social-feed.ts` : filtres, score et diversification.
- Aucun hook vidéo personnalisé : les abonnements et observateurs sont locaux aux composants.

### Tables et vues existantes

- `posts`, `social_post_media`, `post_services`.
- `post_likes`, `post_comments` avec `parent_id` pour les réponses, `post_saves`, `post_shares`.
- `follows`, `hashtags`, `post_hashtags`.
- `video_views`, `post_booking_clicks`, `social_profile_visits`.
- `reports`, `moderation_actions`, `social_post_features`.
- `inspiration_collections`, `inspiration_collection_posts`.
- Vue `social_feed` et vues de compatibilité `social_post_*`.
- RPC principales : `create_provider_video_post`, `manage_own_social_post`, `toggle_post_like`, `toggle_post_save`, `toggle_follow_provider_from_post`, `record_video_view`, `record_post_share`, `record_post_booking_click`, `record_social_profile_visit`, `report_social_post`, `report_post_comment`, `provider_creator_statistics`, `admin_moderate_social_post`.

### Storage distant

| Bucket | Public | Limite | Usage |
|---|---:|---:|---|
| `provider-social-media` | non | 100 Mo | Studio actuel, vidéos/photos/avant-après et miniatures |
| `social-videos` | oui | 100 Mo | compatibilité historique, aucun média distant actuel référencé |
| `social-thumbnails` | oui | 5 Mo | compatibilité historique, aucun média distant actuel référencé |
| `provider-documents` | non | 10 Mo | KYC, séparé du social |

Le bucket KYC n'est jamais utilisé par le parcours vidéo.

## Matrice fonctionnelle avant correction

| Fonction | État actuel | Bug / écart | Cause | Correction prévue | Test associé |
|---|---|---|---|---|---|
| Route feed immersive | fonctionnel | Pas de route publique canonique `/feed` | Feed piloté par l'état interne de la page d'accueil | Ajouter une entrée `/feed` conservant le même composant | Playwright navigation directe |
| Route Studio `/pro/videos` | fonctionnel | Aucun | Module d'espace relié au Studio | Conserver | Playwright professionnel |
| Bouton central `+` | fonctionnel | Aucun | Header et FAB reliés à l'espace professionnel | Conserver | Playwright publication |
| Feed vertical plein écran | fonctionnel | Aucun | `scroll-snap`, une carte par écran, `IntersectionObserver` | Conserver | Playwright 10 contenus + responsive |
| Une seule vidéo active | fonctionnel | Aucun critique | Pause de toutes les vidéos hors index actif | Conserver et tester | Playwright lecteur |
| Préchargement limité | fonctionnel | Aucun | Source courante + suivante, `preload` auto/metadata/none | Conserver | Test DOM lecteur |
| Reprise de position | fonctionnel | Aucun | ID actif conservé en `sessionStorage` | Conserver | Playwright profil → retour |
| Autoplay/mute/boucle/pause | fonctionnel | Aucun critique | Lecteur natif avec repli autoplay | Conserver | Playwright lecteur |
| Buffering/erreur/retry/progression | fonctionnel | Aucun critique | États `loading`, fallback et barre de progression | Conserver | Playwright erreur/lecture |
| Informations vidéo | fonctionnel | Compteur d'abonnés absent | Le feed n'expose pas le total public | Ajouter une RPC de compte public | Test RPC + UI |
| Réservation depuis vidéo | fonctionnel | Aucun | Prestation liée, créneaux réels et prix rechargé par la RPC de réservation | Conserver | Playwright + assertion prix serveur |
| Upload MP4/WebM/MOV | fonctionnel | Pas de transcodage serveur | Validation navigateur et Storage uniquement | Documenter ; conserver le refus propre des codecs illisibles | Unitaires + vrais fichiers |
| Limites 90 s / 100 Mo | fonctionnel | Constante durée non partagée | 90 s dupliqué entre navigateur et SQL | Centraliser côté TypeScript et tester | Vitest |
| Progression d'upload | fonctionnel | Pas de reprise TUS | XHR direct authentifié, progression réelle | Conserver ; reprise hors périmètre sans pipeline dédié | Playwright coupure réseau |
| Miniature automatique/personnalisée | fonctionnel | Sélection précise d'une frame non interactive | Frame automatique à 25 % ou fichier personnalisé | Conserver, clarifier l'UI | Playwright miniature |
| Brouillons privés | fonctionnel | Bucket historique public | Nouveau bucket privé, anciens buckets ouverts | Fermer les buckets historiques et signer leur lecture | Tests Storage/RLS |
| Publications programmées | fonctionnel | Aucun | Statut `scheduled` + `pg_cron` chaque minute | Conserver | Test RPC/cron structurel |
| Statuts | partiel | `ready` absent et `processing` non exposé | Pas de transcodage asynchrone | Ne pas simuler un traitement inexistant ; documenter | Test contraintes |
| Bibliothèque publiée | partiel | Onglet Vidéos mélange les statuts | Filtre uniquement par type | Limiter aux vidéos publiées | Test UI Studio |
| Archives | absent | Pas d'onglet Archives | Statut présent mais non routé | Ajouter la rubrique | Test UI Studio |
| Commentaires créateur | absent | Pas de rubrique dédiée | Commentaires seulement dans le feed | Ajouter lecture des commentaires reçus | Test UI Studio |
| Signalements créateur | partiel | États masqués visibles mais pas de rubrique modération | Les rapports restent privés, à juste titre | Ajouter une rubrique d'état de modération sans exposer les auteurs | Test UI Studio/RLS |
| Commentaires client | partiel | Limite fixe de 50, sans pagination explicite | Requête unique | Ajouter pagination incrémentale | Playwright > 20 commentaires |
| Réponses aux commentaires | fonctionnel | Aucun critique | `parent_id`, création et rendu indenté | Conserver | Playwright réponse |
| Suppression commentaire | fonctionnel et sécurisé | Aucun | UI propriétaire + RLS propriétaire/admin | Conserver | Test refus croisé |
| Likes | fonctionnel et sécurisé | Aucun | PK `(post_id, profile_id)` + RPC atomique | Conserver | Test double toggle/compteur |
| Enregistrements | partiel | Collections créables mais affectation d'un post à une collection absente | Save global non relié depuis l'UI aux collections | Ajouter affectation depuis Mes inspirations | Test client |
| Follow | partiel | Pas d'onglet Abonnements ni compteur | Follow atomique présent, feed dédié absent | Ajouter filtre Abonnements et compte public | Playwright follow/feed |
| Hashtags | partiel | Normalisés en base mais non cliquables | Affichage sous forme de texte | Rendre cliquables et filtrer via URL `/feed?hashtag=` | Unitaires + Playwright |
| Recherche vidéo | partiel | Recherche catalogue ne filtre pas les posts | Bouton feed redirige vers Découvrir | Ajouter recherche locale feed sur vidéo/pro/prestation/ville/hashtag | Playwright recherche |
| Feed Pour toi | fonctionnel v1 | Aucun critique | Récence, engagement, follow, affinité, proximité, disponibilité, diversification | Conserver et étendre aux filtres explicites | Vitest score/diversité |
| Feed Abonnements | absent | Aucun état vide/suggestions | Filtre inexistant | Ajouter onglet et état Découvrir | Playwright |
| Profil depuis vidéo | partiel | Prestations/avis disponibles, autres vidéos absentes | Profil charge seulement portfolio classique | Ajouter médias sociaux publiés | Playwright profil |
| Statistiques créateur | fonctionnel | Aucun critique | Vues, watch time, complétion, likes, commentaires, saves, partages, follows, visites, clics, réservations, CA | Conserver | RPC réelle |
| Modération | fonctionnel et sécurisé | Aucun critique | Signalement privé, décisions permissionnées, audit, masquage/restauration | Conserver | Playwright admin/RLS |
| Recherche/filtres catalogue | fonctionnel | Proximité GPS exacte non implémentée | Ville/quartier/catégorie/prix/note disponibles | Ne pas simuler une distance GPS | Tests catalogue |
| Performance réseau | partiel | Pas de télémétrie première frame/FPS | Watch events seulement | Ajouter événements lecteur utiles sans prétendre mesurer le FPS | Test RPC |
| Mobile 320–430 | fonctionnel | Aucun défaut connu | CSS responsive et tests existants | Rejouer après corrections | Playwright cinq largeurs |
| Mocks/données fictives Production | fonctionnel | Aucun mock social | Feed, compteurs et médias viennent de Supabase | Conserver | Audit structurel |
| Boutons non reliés | fonctionnel sur le parcours social | Aucun bouton social orphelin identifié | 21 boutons audités, tous ont un handler | Conserver | Playwright actions |

## Priorités de correction

1. Fermer les buckets Storage historiques publics avec lecture propriétaire/publiée/admin et compatibilité URL signée.
2. Ajouter `/feed`, recherche vidéo et hashtags navigables.
3. Ajouter l'onglet Abonnements et le compteur réel de followers.
4. Paginer les commentaires et compléter Mes inspirations/collections.
5. Compléter le Studio : vidéos publiées, archives, commentaires et état de modération.
6. Relier les vidéos sociales publiées au profil professionnel.
7. Étendre les tests unitaires, RLS et Playwright, puis déployer une Preview uniquement.

## Non-objectifs assumés

- Aucun transcodage MOV/MP4 serveur n'existe : le navigateur valide les codecs lisibles et affiche une erreur claire sinon.
- Aucun upload reprenable TUS n'est annoncé : l'upload XHR actuel fournit une progression réelle et un nettoyage transactionnel.
- Aucun algorithme opaque n'est revendiqué : le feed Pour toi reste une heuristique déterministe, testable et diversifiée.
- Aucune proximité GPS exacte n'est simulée sans consentement et infrastructure géospatiale.

## Résultat final après correction — 2026-08-18

### Version livrée

- Branche : `codex/video-upload-critical-fix`.
- Commit applicatif déployé et testé : `ec8e604` (`fix(video): stabilize inspiration collections test path`).
- Preview Vercel : `https://mata-beauty-4a9miu5ce-africrm.vercel.app`.
- Déploiement Vercel : `dpl_BbpPtQMaNzfWwr4nJTgDffvmVo8B`, état `READY`, cible Preview uniquement.
- Production : non modifiée.
- Supabase : migration `20260817100000_video_path_hardening.sql` appliquée ; 41 migrations locales et 41 distantes alignées.

### Matrice de clôture

| Bloc audité | Correction | Test réel | Résultat |
|---|---|---|---|
| Route vidéo | `/feed` canonique relié au feed immersif existant | Navigation directe Preview | PASS |
| Publication professionnelle | Upload, miniature, description, hashtags, prestation, visibilité et publication conservés dans un flux unique | WebM enregistré par Chromium + vrais MP4/MOV | PASS |
| Durée WebM | Repli de métadonnées borné avec `Number.MAX_SAFE_INTEGER`, sans valeur non finie | Publication WebM réelle de plus d'une seconde | PASS |
| Storage | `provider-social-media`, `social-videos` et `social-thumbnails` privés ; lecture signée uniquement si propriétaire, publication publique autorisée ou admin | Test Storage/RLS distant | PASS |
| Brouillons et contenus masqués | Lecture étrangère refusée ; feed limité à `published/public` | Script distant et scénario de modération | PASS |
| Feed vertical | Snap, autoplay muet, boucle, pause hors écran, une seule vidéo active et préchargement courant/suivant | Playwright lecteur et scroll | PASS |
| MP4/WebM/MOV | Validation centralisée, 90 s et 100 Mo, messages publics sûrs | Vitest + trois conteneurs réels | PASS |
| Photos et avant/après | Upload Storage privé, écriture Supabase et rendu dans le feed | Playwright Preview | PASS |
| Likes/saves/follows | RPC atomiques, contraintes uniques et compteurs serveur | Double-toggle/RLS distant + Playwright | PASS |
| Commentaires | Création, réponses, suppression propriétaire, signalement et pagination 20 par 20 | 22 commentaires réels et refus croisé | PASS |
| Mes inspirations | Route `/app/inspirations`, sauvegardes, création et affectation de collection | Golden Path Preview | PASS |
| Concurrence collections | Les réponses de chargement obsolètes ne peuvent plus écraser une création récente | Playwright réseau réel | PASS |
| Hashtags/recherche | Hashtags normalisés et cliquables, URL filtrée et recherche vidéo/pro/prestation/ville | Playwright Preview | PASS |
| Abonnements | Onglet alimenté par les professionnels suivis et compteur public serveur | Playwright + RPC | PASS |
| Profil professionnel | Vidéos sociales publiées et prestations accessibles depuis le feed | Feed → profil → vidéos → prestation → retour | PASS |
| Réservation | Prestation, prix et disponibilités rechargés côté serveur ; attribution au post source | Réservation réelle + suppression du créneau + notification | PASS |
| Statistiques | Vues, watch time, complétion, interactions, follows, visites, clics, réservations et CA | RPC `provider_creator_statistics` | PASS |
| Modération | Signalement privé, refus professionnel, masquage admin, disparition du feed, audit et restauration Super Admin | Playwright + assertions base | PASS |
| Studio | Vidéos publiées, brouillons, programmées, archives, commentaires, état de modération et statistiques | Playwright professionnel | PASS |
| Mobile | Aucun débordement et actions accessibles sur le parcours feed/profil/réservation | 320, 360, 375, 390 et 430 px | PASS |

### Architecture finale

- Routes cliente : `/feed`, `/app/feed`, `/app/inspirations`, `/professional/[username]`, `/service/[id]`.
- Routes créateur : `/pro/videos` et `/salon/videos`.
- Routes de partage : `/posts/[id]` et `/video/[id]`.
- Modération : `/admin/content`, avec décision par RPC permissionnée et auditée.
- Le navigateur envoie le média directement à Supabase Storage sous sa session Auth. La création métier passe ensuite par une RPC qui revalide l'auteur, le statut professionnel, la prestation, le chemin Storage, la durée, le type et la visibilité.
- La réservation ne fait jamais confiance au prix envoyé par le navigateur : le montant provient de `provider_services` dans la transaction serveur.

Tables et vues utilisées : `posts`, `social_post_media`, `post_services`, `post_likes`, `post_comments`, `post_saves`, `post_shares`, `follows`, `hashtags`, `post_hashtags`, `video_views`, `video_watch_events`, `post_booking_clicks`, `social_profile_visits`, `reports`, `moderation_actions`, `social_post_features`, `inspiration_collections`, `inspiration_collection_posts` et `social_feed`.

Buckets finaux :

| Bucket | Public | Limite | Règle finale |
|---|---:|---:|---|
| `provider-social-media` | non | 100 Mo | Écriture sous le dossier de l'auteur ; lecture propriétaire, média publié/public ou admin |
| `social-videos` | non | 100 Mo | Compatibilité historique avec URL signée et même contrôle de publication |
| `social-thumbnails` | non | 5 Mo | Compatibilité historique avec URL signée et même contrôle de publication |
| `provider-documents` | non | 10 Mo | KYC séparé, jamais utilisé par le social |

Composants modifiés : `SocialFeed`, `VideoPublisher`, `CreatorStudio`, `SocialDashboard`, le profil professionnel et le routeur d'espaces. Aucun composant métier validé n'a été supprimé.

### Résultats exacts

- `pnpm lint` : PASS, 0 erreur.
- `pnpm typecheck` : PASS, TypeScript strict.
- `pnpm test` : PASS, 14 fichiers et 78 tests.
- `pnpm test:smoke` : PASS, 19/19 tests structurels.
- `pnpm build` : PASS, build Next.js 16.2.11 et 17 pages statiques générées.
- `pnpm test:social:remote` : PASS avec 14 preuves distantes : publication avec prestation obligatoire, brouillon privé, compteurs protégés, modification étrangère refusée, isolation upload, likes idempotents, save/follow, commentaires/RLS, vues, collections privées, attribution/prix serveur et statistiques.
- `tests/remote/social-feed-remote-ui.spec.ts` : PASS, 7/7 scénarios en 2,8 minutes sur la Preview finale et Supabase réel.
- Responsive Playwright final : PASS à 320, 360, 375, 390 et 430 px. Inspection navigateur complémentaire sans débordement à 768, 1024 et 1440 px.
- Migrations : PASS, 41/41 alignées.
- Nettoyage : PASS après purge ciblée des anciens résidus de recette ; 0 compte Auth `codex-feed-*`, 0 profil Mata Feed temporaire. Le `afterAll` supprime maintenant rapports, décisions et messages avant les comptes.
- Protection Preview : les bypass temporaires étaient générés uniquement pour chaque exécution et révoqués dans un bloc `finally`. Aucun secret n'a été affiché ni commité.

### Bugs réellement détectés et corrigés pendant la recette finale

1. Le module `Inspirations` du nouvel espace client affichait encore un écran générique. Il rend désormais le tableau réel `SocialDashboard` et le raccourci profil cible `/app/inspirations`.
2. Deux chargements concurrents pouvaient faire disparaître une collection juste créée. Un identifiant de requête empêche désormais toute réponse obsolète de remplacer l'état le plus récent.
3. Le test de pagination utilisait des URLs de médias inexistants. Les fixtures chargent maintenant un vrai MP4 dans Storage et le suppriment au nettoyage.
4. Les exécutions interrompues laissaient des comptes à cause des clés étrangères `RESTRICT` de la modération. Le nettoyage respecte maintenant l'ordre rapports/décisions/messages, puis Auth.

### Limites connues, non simulées

- Il n'existe pas de transcodage serveur : MP4, WebM et MOV sont acceptés seulement lorsque le navigateur peut réellement décoder leurs codecs.
- Il n'existe pas encore de reprise TUS après fermeture complète du navigateur ; la progression XHR et le nettoyage sur erreur sont opérationnels.
- La proximité exacte GPS et une mesure matérielle fiable des FPS ne sont pas revendiquées.
- Le navigateur automatisé disponible était Chromium. Edge natif et Safari/WebKit natif n'étaient pas disponibles dans cet environnement ; aucun PASS n'est inventé pour eux.

VERDICT PARCOURS VIDÉO: READY ON PREVIEW
