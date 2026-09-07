# Mata Beauty — recette vidéo et feed

Date : 7 septembre 2026. Branche : `codex/launch-phase-2`.

## État de livraison

**PASS — 9 scénarios distants réussis sur une seule exécution, en 3,9 minutes, nettoyage compris.** La publication Studio, la lecture cliente, les interactions, la réservation et les navigations mobiles ont été vérifiées sur le backend QA réel le 7 septembre 2026.

- Preview : https://mata-beauty-ik9zp4691-africrm.vercel.app
- Déploiement : `dpl_ExjtHy9LE4vhefcckXEszBP7chpS`, état `READY`, cible Preview.
- Code applicatif déployé : `9adce6c`.
- Backend isolé : `kazlvtxkbsdhbfvtqqdp.supabase.co`.
- Production : aucun déploiement, aucune migration ni donnée de test introduite pendant cette reprise.
- Paiement réel : non activé ; aucun encaissement dans cette recette.

Ce rapport remplace le constat bloqué du 31 août : le backend QA isolé est maintenant disponible et les publications réelles ont été exécutées.

## Causes et corrections

| Défaut | Correction | Fichiers principaux |
|---|---|---|
| Succès de publication non corrélé à la livraison réelle | Vérification de la ligne, des relations, du feed et de la signature Storage ; conservation des objets après persistance | `app/video-publisher.tsx`, `lib/domain/video-delivery.ts` |
| Feed, visibilité et pagination incohérents | Lecture de `social_feed`, curseur composite, invalidation du cache après publication, signature directe des médias | `app/social-feed.tsx`, migration `20260831010000_harden_video_delivery_chain.sql` |
| Création de compte, audit et approbation bloqués sur QA | Réparation des champs propres à chaque table et de l’approbation administrateur | Migrations `20260831020000`, `20260831021000`, `20260831022000` |
| Aperçus photo Studio bloqués par la CSP | Autorisation de `blob:` dans `img-src` | `next.config.ts` |
| Envoi de message impossible : `record new has no field status` | Conditions du déclencheur multi-table lisant le statut via JSONB, sans accès à un champ absent | `20260906010000_repair_launch_event_status_dispatch.sql` |
| Profil : erreur 400 sur la galerie | Lecture de `storage_path` et tri `sort_order`, URL publique du bucket `portfolios` | `app/mata-beauty-app.tsx` |
| Clic profil avant disponibilité du catalogue | Requête ciblée du prestataire approuvé, indépendante du chargement initial et de la limite du catalogue | `app/mata-beauty-app.tsx`, `lib/supabase/catalog.ts` |
| Requêtes du feed et statistiques lancées pendant une navigation WebKit | Pas de changement d’état déclenchant un rechargement avant redirection ; annulation des requêtes à `pagehide` et au démontage ; réactivation à `pageshow` | `app/mata-beauty-app.tsx`, `app/social-feed.tsx` |
| Recette instable aux changements de page | Pagination mesurée par les seules requêtes avec curseur ; connexion ciblant la navigation du compte ; chargements WebKit attendus avant retour/avance | `tests/remote/social-feed-remote-ui.spec.ts` |
| Comptes QA non supprimables après messagerie/modération | Suppression préalable des conversations et références QA, suppression Storage groupée, vérification des résultats et délai dédié | `tests/remote/social-feed-remote-ui.spec.ts` |

## Schéma, Storage et sécurité

La publication relie `posts`, `post_services`, `provider_services`, `provider_profiles`, `profiles` et `social_post_media`. La vue `social_feed` utilise `security_invoker=true`. Le bucket `provider-social-media` est privé. Les chemins sont propres au prestataire et à la publication ; les vidéos et miniatures sont lues par URL signée.

La fonction `is_public_social_post` centralise les critères de publication publique : post publié, date de publication valide, prestataire approuvé et non suspendu, prestation principale active, absence de signalements bloquants. Les politiques de lecture des publications, médias et objets Storage s’appuient sur ces règles.

La recette vérifie qu’un brouillon et les contenus d’un prestataire rejeté sont invisibles au client, que le client et un autre prestataire ne peuvent pas modifier la publication, et qu’un prestataire ne peut pas exécuter la modération réservée aux administrateurs. Les migrations sont versionnées et appliquées uniquement à QA. La clé de service reste dans le processus du runner ; elle n’est pas injectée dans le navigateur ni committée.

## Parcours réellement exercés

La suite crée des comptes temporaires distincts : professionnel, cliente, administrateur et Super Admin. Le professionnel est approuvé par le RPC administrateur puis se connecte au vrai Studio.

Neuf MP4 H.264 de cinq secondes sont téléversés depuis le sélecteur du formulaire, chacun avec un chemin Storage distinct et une miniature. Une dixième vidéo est publiée pendant que la cliente garde son feed ouvert. Deux photos et un avant/après sont également publiés via Studio. Aucune publication n’est injectée directement en base.

La cliente retrouve les vidéos, les lit, met en pause et reprend, active le son, défile avec une seule vidéo active, utilise les filtres et charge la page suivante par curseur. La nouvelle vidéo apparaît après navigation normale, sans rebuild. Les likes, sauvegardes, abonnements et commentaires sont vérifiés en base.

La réservation est créée depuis la vidéo avec `source_post_id`. Le créneau disparaît, le prestataire reçoit une notification et voit la réservation et ses statistiques. Les comptes échangent des messages ; le prestataire confirme, commence puis termine la prestation ; la cliente laisse un avis, qui met à jour la note. Un signalement est traité dans l’interface administrateur, la publication est masquée, les traces d’audit sont contrôlées puis le Super Admin la restaure.

## Validation

| Contrôle | Résultat |
|---|---|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 14 fichiers, 64 tests |
| `pnpm test:smoke` | PASS — 23 tests |
| `pnpm build` local et Vercel | PASS |
| Upload MP4, photo, avant/après et preuve DB/Storage | PASS |
| RLS et expiration/régénération d’une URL signée | PASS |
| Lecture, interactions, réservation, messagerie, avis | PASS |
| Modération, filtres et pagination sans doublons | PASS — une requête avec curseur pour le chargement suivant |
| Chromium aux largeurs 320, 360, 375, 390 et 430 px | PASS |
| WebKit mobile 390 × 844, autoplay et retour/avance | PASS |
| Console et réponses réseau de l’application | PASS — aucune erreur capturée pendant la suite finale |
| Suite distante entière et nettoyage final | PASS — 9 tests, 3,9 minutes ; fichiers QA et profils supprimés avec assertions |

## Performances et limites des preuves

Une mesure `EXPLAIN ANALYZE` sur le feed QA peuplé, sous rôle client, retourne huit lignes en **21,105 ms**, avec **25,24 ms** de planification. Cette mesure SQL ponctuelle n’inclut pas le réseau, la signature des médias ou le rendu, et ne constitue pas un test de charge.

Des expirations SQL intermittentes ont été observées pendant des passages antérieurs. Elles n’étaient pas reproduites par la mesure sur les données réelles et aucune erreur réseau n’a été capturée pendant la suite finale. Leur cause précise n’a pas été établie ; cette réussite ponctuelle ne constitue pas une garantie sous charge. Aucune hausse du timeout SQL ni suppression du contrôle réseau n’a été utilisée pour les masquer.

Les formats mobiles sont des contextes navigateur, pas des téléphones physiques. Le partage vérifie l’enregistrement applicatif avec une simulation de la boîte de partage système. Le contrôle console exclut uniquement le script de feedback Vercel Preview déjà identifié ; les erreurs de l’application restent bloquantes. Les navigations WebKit attendent les chargements pour ne pas interrompre les requêtes de la page précédente.

Les comptes, publications, conversations et fichiers QA sont temporaires et supprimés après la suite. La Preview n’est donc pas destinée à conserver ces démonstrations dans son feed.

## Traçabilité

- `1171f9c` : chaîne de publication et livraison vidéo.
- `64a95e0` : corrections QA, CSP et recette étendue.
- `aaefb24` : déclencheur de messages et galerie du profil.
- `4ce3beb` : ouverture du profil indépendante du catalogue.
- `9adce6c` : annulation des requêtes au départ de la page et recette stabilisée ; dernière version applicative déployée.
- Les ajustements finaux de recette et ce rapport sont enregistrés dans un commit distinct.
- Le document utilisateur non suivi `docs/PRODUCTION_READINESS_2026-08-16.md` reste exclu des commits.
