# Mata Beauty — recette vidéo et feed

## Audit production du 7 octobre 2026

Cette section prévaut sur la recette Preview de septembre conservée plus bas. Domaine audité : **https://mata-beauty.com**. Aucun changement de design, nouveau module ou changement de permissions de base de données pendant cet audit.

Version publique vérifiée le 7 octobre à **19:56:44 UTC** : **b3b888dcacc0493744d65aaf4ac1b1b63e45a3bd**, déploiement **dpl_HpeuiymB7UsaRPWHjNPpWBZ7RxPq**. HTTP 200 ; les 15 chemins JavaScript publics correspondent à ceux du déploiement immuable `mata-beauty-jirvailji-africrm.vercel.app` ; backend production présent, backend QA absent. Preuve locale : `work/final-audit/production-version-b3b888d.json`.

### Défauts reproduits et corrigés

| BUG-ID | Écran et reproduction | Observé / attendu | Cause et correction | Preview | Production |
|---|---|---|---|---|---|
| VID-001 | Feed, média GET 404, puis clic Réessayer après rétablissement | Clic intercepté / relance de la vidéo | La commande lecture recouvrait le fallback. Retrait des commandes lecture/son en état d’erreur dans `app/social-feed.tsx`, commit `94cbdee` | PASS | PASS `b3b888d` |
| VID-002 | Lecture puis événement de document masqué | Lecture continuait / pause puis reprise au retour | Suivi de visibilité, arrêt des lecteurs et du comptage de vue hors page visible, `app/social-feed.tsx`, `94cbdee` | PASS, signal simulé | PASS `b3b888d` |
| VID-003 | GET vidéo retenu sans réponse | Chargement encore affiché après 35 s / erreur récupérable | Watchdog de 20 s du lecteur actif, libération de sa source et bouton Réessayer, `app/social-feed.tsx`, `94cbdee` | PASS | PASS `b3b888d` |
| VID-004 | Studio → Mes vidéos → Supprimer → actualiser | Vidéo supprimée toujours listée / disparition du Studio et du feed | La requête incluait les lignes supprimées logiquement. Filtrage `deleted_at` et `status`, `app/creator-studio.tsx`, `e12d0d8` | NOT TESTED | PASS sur `e12d0d8`, PASS `b3b888d` |
| VID-005 | Client connecté, ouverture du feed puis interaction avant chargement du profil | Modale de connexion injustifiée / attente de la session | Distinction entre authentification en cours et visiteur ; commandes protégées désactivées pendant l’attente, chargement du profil borné. `app/mata-beauty-app.tsx`, `app/social-feed.tsx`, `lib/auth/profile.ts`, `b3b888d` | NOT TESTED | PASS `b3b888d` |

Tests de régression ajoutés dans `tests/remote/social-feed-remote-ui.spec.ts`. La suppression reste logique : aucune purge irréversible du contenu historique n’a été ajoutée. Les erreurs réseau sont injectées dans les navigateurs de test, pas sur le service utilisé par les visiteurs.

### Exécutions et preuves

- Production `94cbdee` : **11 scénarios PASS**, puis échec du douzième dû à une navigation de fixture manquante. Ce résultat n’est pas présenté comme une suite de 12 PASS. Preuve : `work/final-audit/video-full-94cbdee`.
- Après correction de cette fixture, le scénario a reproduit VID-004. Son parcours complet a passé sur `e12d0d8` : `work/final-audit/video-upload-e12d0d8/.last-run.json`.
- La recette finale sur `e12d0d8` a ensuite reproduit VID-005 ; trois scénarios suivants non exécutés ne sont pas comptés PASS.
- Production `b3b888d` : **6 scénarios PASS en une exécution de 5 minutes, nettoyage compris**, preuve `work/final-audit/video-final-b3b888d/.last-run.json`. Publication MP4, photo/avant-après, interactions et réservation, signalement/modération, résilience réseau et upload/gestion. Les cinq régressions corrigées passent sur ce dernier build.
- Non-régression Auth sur `b3b888d` : **11 PASS**, nettoyage confirmé ; connexion, actualisation, routes Client protégées, session révoquée, liens inscription/invitation/reset à usage unique, session expirée et formulaire mobile. Preuve : `work/auth-audit/post-b3b888d-returns/results.json`. Liens générés pour la recette : ce contrôle ne prouve pas une nouvelle livraison SMTP ni une nouvelle connexion Google humaine.
- Avant les commits de code : `pnpm lint`, `pnpm typecheck`, `pnpm test` (**97 tests**) et `pnpm build` PASS. Ces contrôles ne remplacent pas les parcours navigateur.

### Couverture fonctionnelle observée

| Zone | Action et résultat attendu | Résultat observé | Statut / version |
|---|---|---|---|
| Publication | MP4 → service du Pro → Storage → feed Client | Média réel, auteur et service liés, lecture possible | PASS `94cbdee`, PASS `b3b888d` |
| Lecteur | Lecture, pause, reprise, mute/unmute, scroll, retour | Temps vidéo avance, pause et état muted contrôlés ; au plus un lecteur actif | PASS `94cbdee`, PASS `b3b888d` |
| Desktop | Molette à 1366×768, 1440×900, 1920×1080 | Cartes suivantes/précédentes accessibles | PASS navigateur `94cbdee`, pas matériel physique |
| Interactions | Like/favori/suivi, commentaire, profil et prestation | Actions et écritures réelles ; retrait like/favori/suivi contrôlé | PASS `94cbdee`, PASS `b3b888d` |
| Partage | Action de partage → événement serveur | Événement enregistré ; API native simulée | PASS partie applicative ; partage OS NOT TESTED |
| Réservation | Vidéo → prestation → créneau → confirmation → Client et Pro | Même professionnel, prix 18 000 XOF, durée 60 min, source vidéo, notification, créneau retiré | PASS `94cbdee`, PASS `b3b888d` |
| Réservation en erreur | API 503 → aucune fausse confirmation → réessayer | Échec explicite puis réservation réelle | PASS `94cbdee`, PASS `b3b888d` |
| Modération | Signaler → Admin avec MFA → masquer → audit → restaurer | Visibilité publique et opérations autorisées contrôlées | PASS `94cbdee`, PASS `b3b888d` |
| RLS | Brouillon/rejet caché, modification par Client ou autre Pro refusée | Refus et absence du feed contrôlés | PASS `94cbdee` |
| URLs signées | Lien expiré remplacé depuis le chemin Storage | Nouvelle signature exploitable | PASS API `94cbdee`, session UI longue NOT TESTED |
| Catalogue | Filtres, proximité Dakar, tendances et pagination | Curseur unique, pas de publications dupliquées | PASS `94cbdee` |
| Responsive | 320, 360, 375, 390, 430, 768, 1024 et 1440 px | Profil et réservation accessibles, pas de débordement horizontal | PASS `94cbdee`, viewports simulés |
| WebKit | Émulation iPhone 390×844, lecture et retour/avance | Lecture réelle et navigation fonctionnelles | PASS `94cbdee`, pas un iPhone physique |
| Studio mobile | 360, 375, 390 et 430 px | Navigation publication/messages accessible | PASS `94cbdee`, viewports simulés |
| Upload | Mauvais format, fichier corrompu, >100 MiB | Rejet avant publication | PASS `e12d0d8`, PASS `b3b888d` |
| Upload interrompu | Coupure Storage puis reprise et double clic | Pas de publication fantôme ; une seule publication après reprise | PASS `e12d0d8`, PASS `b3b888d` |
| Formats et gestion | MP4 paysage, WebM VP8 portrait, masquer/republier/archiver/supprimer | Lecture et dimensions contrôlées ; statut et feed cohérents | PASS `e12d0d8`, PASS `b3b888d` |
| Réseau lent/public | 512 kbit/s, latence 250 ms, visiteur puis actualisation | Lecture réelle, aucune erreur JS non interceptée dans cet échantillon | PASS rejoué sur `b3b888d`, `work/final-audit/video-public-refresh.json` |
| Feed indisponible | API feed 503 puis rétablissement | Message explicite, clic Réessayer, lecture retrouvée | PASS rejoué sur `b3b888d`, `work/final-audit/video-feed-error.json` |

Les comptes, publications, fichiers et réservations synthétiques sont nettoyés par les suites avec vérification des résultats. Les parcours normaux contrôlent les erreurs console/réseau ; les erreurs injectées attendues sont isolées des régressions inattendues.

### Limites explicites et décision

- **NOT TESTED — PHYSICAL TRACKPAD REQUIRED**. Molette navigateur et scroll programmatique ne prouvent pas le trackpad physique.
- **NOT TESTED** : lecture sur vrais iPhone/Android, son entendu, changement d’application matériel, caméra et rotation réelle. Le GPS précédemment validé humainement ne valide pas ces usages vidéo.
- **NOT TESTED** : MOV/HEVC/HDR iPhone, métadonnées de rotation, toutes combinaisons codec/navigateur. Formats réellement couverts : MP4 et WebM VP8.
- **NOT TESTED** : partage natif OS ; réponses/suppression/signalement des commentaires ; tous les cas de données manquantes.
- **NOT TESTED** : profilage mémoire prolongé et charge simultanée. Vingt changements rapides vérifient un nombre stable de lecteurs DOM, au plus deux sources attachées et un lecteur actif ; ce n’est pas une preuve d’absence de fuite mémoire sur plusieurs heures.
- **NOT TESTED** : expiration en session UI prolongée et révocation d’une URL média déjà délivrée après suppression ; fichier valide proche de 100 MiB/90 s ; dépassement de durée réel ; timeout d’API feed ou de signature sans réponse. Les tests couvrent le média bloqué et le feed en erreur 503.
- L’avancement d’upload affiche des étapes, pas une mesure qualifiée d’octets transmis.

**Bilan vidéo final : 5 défauts reproduits corrigés, 0 échec dans les 6 scénarios finaux et les 5 contrôles publics complémentaires sur b3b888d.** Les six autres scénarios de la suite étendue ont passé sur `94cbdee` et ne sont pas présentés comme rejoués sur le dernier build. Aucune vulnérabilité HIGH/CRITICAL reproduite non résolue dans ce périmètre ; ce n’est pas une certification des surfaces non testées. Latence de démarrage observée dans le scénario final : 1 089 ms, échantillon unique, pas un benchmark général.

**Verdict global maintenu : B — BÊTA CONTRÔLÉE.** L’audit vidéo ne lève pas les réserves de permissions exhaustives, des quatre workflows internes incomplets et du matériel du rapport général. **HaveIBeenPwned leaked-password protection — BLOCKED BY PLAN — activation possible après upgrade Pro** : fonction externe indisponible, distincte des défauts applicatifs ; aucune activation ou imitation effectuée.

## Historique — recette Preview du 7 septembre 2026

Les mentions de livraison et d’absence de déploiement production ci-dessous concernent exclusivement cette ancienne recette.

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
