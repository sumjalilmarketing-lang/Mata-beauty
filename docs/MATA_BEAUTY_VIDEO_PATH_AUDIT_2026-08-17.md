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
