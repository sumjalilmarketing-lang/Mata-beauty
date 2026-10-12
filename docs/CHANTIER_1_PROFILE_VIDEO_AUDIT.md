# Chantier 1 — audit initial des profils, vidéos et commentaires

Date : 11 octobre 2026. Inspection du code et lecture du schéma production ; aucun parcours navigateur de ce chantier n'est encore déclaré PASS.

## Existant réutilisable

| Zone | Implémentation existante | Contrat conservé |
|---|---|---|
| Lecteur immersif | `app/social-feed.tsx` | Lecture, pause, une vidéo active, préchargement de la suivante, likes, signalement, partage, service et réservation avec `sourcePostId`. |
| Média publié | Vue `social_feed`, `media_items`, bucket privé `provider-social-media` | Signature des URL autorisées, aucun passage du bucket en public. |
| Profil depuis feed | `openSocialProvider` et `ProviderProfileScreen` dans `app/mata-beauty-app.tsx` | Résolution par véritable `authorId`, catalogue publié, réservation existante. |
| Profil partageable | `app/professional/[username]/page.tsx` | Slug public, profil approuvé, prestations et partage QR. |
| Commentaires | `post_comments`, `parent_id`, `report_post_comment` | Création, réponses, suppression par auteur, modération et signalement. |
| Protection commentaires | `guard_feed_comment_rate`, `protect_post_comment_fields`, RLS | Compte actif, 5 créations/minute et 20/10 minutes ; auteur/post/parent immuables ; réponse sur la même publication. |
| Présentation | `lib/domain/feed-presentation.ts`, `feed-copy.ts` | Noms publics sans identifiants techniques, montant/devise réelle, textes FR/EN. |

## Écarts constatés avant modification

1. Deux profils distincts : le profil local n'a ni galerie vidéo ni bouton Message ; le profil `/professional/[username]` présente seulement des prestations. Le partage local utilise l'URL courante au lieu du profil canonique.
2. Le feed n'accepte pas encore de collection limitée à un professionnel ni de vidéo initiale. Le retour mémorise seulement `mata-feed-active-post`, pas la position de lecture. L'ouverture du profil démonte le lecteur.
3. Le panneau commentaires ne suspend pas le lecteur : les effets `video.play()` ne vérifient pas `commentsPost`. Aucun geste de fermeture n'est prévu. Les réponses apparaissent en liste plate, avec une indentation seulement.
4. Aucun modèle/API de like de commentaire n'existe. Le schéma production confirme uniquement `post_comments` et ses fonctions de création/modération, sans `post_comment_likes`.
5. Les commentaires sont limités aux 50 derniers sans pagination. Le champ `social_feed.allow_comments` existe en production mais n'est pas transmis à l'interface.
6. La page de partage `app/posts/[id]/page.tsx` utilise `video_url` sans résoudre `media_items` ; elle ne réutilise pas les interactions du lecteur immersif.
7. Le profil SSR et la page de partage imposent FCFA. Le profil SSR n'applique pas le nettoyage du nom public déjà utilisé par le feed.

## Drift de schéma vérifié en production

Lecture effectuée sur `qjdwxdbvrxedyfolnpol`, limitée aux colonnes, politiques et définitions de fonctions. `post_comments.parent_id`, `social_feed.media_items`, `social_feed.allow_comments` sont présents. `provider_profiles.area` existe ; `avatar_url` appartient aux données de profil/feed et non à `provider_profiles`. La fonction locale `is_public_social_post` n'existe pas en production : la migration de likes ne doit pas en dépendre. La nouvelle autorisation utilisera la publication effectivement visible dans `social_feed`, les commentaires non masqués et un compte actif pour toute écriture.

## Changements minimaux retenus

- Une galerie paginée du professionnel basée sur `social_feed.author_id`, limitée aux vidéos publiées ; miniatures signées et trois colonnes sur mobile.
- Réutiliser `SocialFeed` avec une collection fournie pour le plein écran ; conserver la galerie montée et restaurer son défilement à la fermeture.
- Utiliser le même composant galerie sur le profil local et le profil public. Le lien Message est `/app/messages?provider=<uuid>` ; l'entrée de messagerie assure l'authentification et conserve le `returnTo`.
- Extraire uniquement les types et la résolution des médias utiles ; préserver les règles existantes de lecture, publication et réservation.
- Pause immédiate à l'ouverture des commentaires ; fermeture au même instant et reprise uniquement si la vidéo jouait avant l'ouverture. Regrouper les réponses et ajouter pagination, likes et fermeture par geste.
- Ajouter une migration isolée pour les likes de commentaires : unicité `(comment_id, profile_id)`, RLS, écritures par RPC autorisé et idempotent, compte actif et limitation de débit. Les commentaires restent distincts des avis vérifiés.

## Vérification à réaliser

| Contrôle | Statut initial |
|---|---|
| Profil depuis avatar, galerie réelle, miniature → vidéo → retour au même défilement | NOT TESTED |
| Panneau commentaires : pause/reprise/position, réponse, like/unlike, suppression, signalement | NOT TESTED |
| RLS : anonyme, auteur, autre compte, compte suspendu, commentaire masqué/publication non publique | NOT TESTED |
| Réservation depuis vidéo et service corrects | NOT TESTED |
| iPhone, Android, desktop, réseau lent | NOT TESTED |
| Déploiement et domaine production | NOT TESTED — aucune mutation cloud autorisée pour cette phase locale |

Les tests existants `tests/remote/social-feed-remote-ui.spec.ts` couvrent déjà lecture, pause, visibilité, commentaires simples et modération en QA. Ils ne prouvent pas les nouveaux parcours ci-dessus.
