# Recette Inspiration — 8 octobre 2026

État : livré sur https://mata-beauty.com et contrôlé après déploiement.

Version applicative : `9ec04f70b69390ad1cc89f51de67cadce3c557f9`.
Déploiement : `dpl_FX9dGrn3vFecYGm3N3P6sLktZoXQ`, https://mata-beauty-50ynb0oae-africrm.vercel.app.
Contrôle du domaine le 8 octobre 2026 à 15:28 UTC : HTTP 200, listes des 15 fichiers JavaScript et 2 CSS identiques au déploiement attendu, backend production présent et backend QA absent.

Les parcours complets avec écritures sont validés en QA isolée. Les parcours publics sont retestés en production. Cela ne remplace pas les contrôles sur téléphones physiques explicitement indiqués ci-dessous.

Périmètre : présentation immersive du feed, interactions sociales, disponibilité/réservation, commentaires et signalements. Le moteur de lecture existant est conservé. Aucun marché supplémentaire n’est ouvert ; les paiements restent en mode mock.

## Changements

- Vidéo dégagée, dégradé discret, rail profil/like/commentaires/partage à droite.
- Favoris, abonnement et signalement conservés dans « Plus d’options ».
- Informations limitées au nom public, ville réelle, prestation liée et prix/devise d’origine. Aucun identifiant technique ni adresse/disponibilité inventée.
- Disponibilités et réservation reliées au service réel ; retour au feed conservé.
- Commentaires avec chargement, erreur/réessai et protection contre les doubles soumissions.
- Limitation serveur : 5 commentaires/minute et 20/10 minutes, compte actif obligatoire. Supprimer un commentaire ne remet pas le compteur à zéro.
- Accrochage des cartes désactivé pour souris/trackpad : les petits mouvements ne doivent plus revenir au début. Accrochage tactile conservé.
- Signalements vidéo/commentaire séparés ; la modération d’un commentaire cible son texte, avec permission et audit, sans masquer sa vidéo.
- Commandes du feed et format monétaire adaptés aux langues actuellement proposées (français/anglais). Cela ne constitue pas une internationalisation de toute l’application.

## Résultats confirmés

| Zone | Action réellement exécutée | Environnement | Statut |
|---|---|---|---|
| Vérification locale | lint, typecheck, 100 tests, build | Local | PASS |
| Publication | Upload MP4 réel, publication automatique et présence feed | Preview/QA | PASS |
| Autres médias | Photo et avant/après publiés dans Storage | Preview/QA | PASS |
| Permissions | Contenus non publiables masqués, mutations étrangères refusées | QA | PASS |
| Média | Renouvellement d’un lien signé expiré | Preview/QA | PASS |
| Lecture | Lecture, pause/reprise, mute/unmute, arrêt hors écran, un lecteur actif | Preview/QA | PASS |
| Social | Like/unlike, favoris/retrait, abonnement/retrait | Preview/QA | PASS |
| Commentaires | Ouverture, publication et suppression de son commentaire | Preview/QA | PASS |
| Réservation | Disponibilités, service lié, réservation persistée, notification et contrôle côté Pro | Preview/QA | PASS |
| Erreur réservation | 503 simulé, absence de fausse confirmation, nouvel essai réussi | Preview/QA | PASS |
| Navigation | Profil/retour, filtres, pagination sans doublons | Preview/QA | PASS |
| Desktop | Molette grande/petite amplitude à 1366×768, 1440×900 et 1920×1080 | Chromium | PASS |
| Responsive | Profil/retour et ouverture réservation à 320, 360, 375, 390, 430, 768, 1024 et 1440 px | Chromium redimensionné | PASS |
| WebKit | Lecture, commentaires, disponibilités, retour, absence de débordement à 390×844 | Mobile simulé | PASS |
| Langue | Commandes anglaises, panneau commentaires et confirmation de like | Preview/QA | PASS |
| Intégrité serveur | 17 contrôles : propriété du service/commentaire, droits de modération, masquage/restauration et audit, accès documents privés | QA | PASS |
| Signalements | Vidéo et commentaire distincts, anti-doublon et interface de modération après correction | Preview/QA | PASS |
| Réseau vidéo | Erreur, nouvel essai, chargement bloqué et navigation rapide | Preview/QA | PASS |
| Upload invalide | Format, poids, contenu corrompu et interruption | Preview/QA | PASS |
| Anti-spam | Publication répétée, suppression et refus après seuil | QA | PASS |
| Production | Version réellement servie et migrations relues en base | mata-beauty.com | PASS |
| Production | Lecture, pause/reprise, son, commentaires en lecture, menu secondaire, partage réel par presse-papiers, profil/retour, ouverture disponibilité/réservation, position conservée | 390×844, 412×915, 1366×768 | PASS |
| Production | Dates du 8 au 13 octobre : 17 créneaux le 10, 14 le 11, zéro les autres jours, aucune erreur API affichée | Calendrier réel | PASS |
| Production | Sélection du 10 octobre à 09:00, montant 15 000 FCFA, confirmation puis formulaire de connexion obligatoire pour un visiteur | Parcours public | PASS |

Aucune erreur JavaScript ou réponse HTTP 4xx/5xx relevée dans les trois parcours publics. La disponibilité absente certains jours est affichée comme telle ; aucun créneau n’a été inventé. Aucune réservation n’a été créée chez un professionnel réel pendant ce contrôle public.

Les écritures de réservation, publication et modération utilisent uniquement les comptes temporaires de la QA isolée. Les fixtures sont nettoyées après chaque exécution.

## Limites conservées explicitement

- NOT TESTED — iPhone et Android physiques, swipe tactile matériel et trackpad physique pour cette version.
- NOT TESTED — feuille de partage native du système sur téléphone. Le scénario QA principal utilise une simulation de l’API de partage ; le presse-papiers réel a été contrôlé sur le domaine après déploiement.
- NOT TESTED — création d’une réservation, publication et modération avec des comptes réels en production pour cette livraison. Ces écritures ont été testées de bout en bout sur la QA isolée ; la production a été testée jusqu’à la sélection d’un vrai créneau et la demande de connexion.
- NOT TESTED — nouvel audit global des autres modules et de l’authentification : hors périmètre de cette modification du feed.
- L’analyse Supabase ne signale aucune nouvelle catégorie après les migrations. Les avertissements historiques restent présents : extension pg_net publique, fonctions SECURITY DEFINER exposées sous contrôle applicatif, tables internes sans politique de lecture directe, et protection leaked-password indisponible sur le plan actuel. Production : 4 informations RLS sans politique, 1 avertissement extension, 18 fonctions exposées à anon, 95 à authenticated et 1 avertissement leaked-password. Ces catégories sont des signaux de revue, pas une preuve d’exploitation ; ce contrôle ciblé ne vaut pas certification globale de sécurité. La nouvelle fonction de limitation des commentaires est interdite à anon et authenticated, vérification effectuée en production.

HaveIBeenPwned leaked-password protection — BLOCKED BY PLAN — activation possible après upgrade Pro. Cette livraison ne prétend pas activer cette option.

## Preuves locales

Les résultats JSON conservés dans le dépôt : [preuves de recette](evidence/inspiration-2026-10-08.json).

- `work/feed-before/` : captures avant modification, dont les identifiants techniques visibles.
- `work/feed-preview/` : captures du nouveau feed et lecture réelle à 390/412/1366 px.
- `work/ultra-simple/` : captures des parcours responsive.
- `work/feed-immersive/` : traces des essais et résultats WebKit/langue.
- `work/permission-audit/social-integrity-qa.json` : 17 contrôles serveur PASS.
- `work/feed-production/` : captures et résultats directs sur le domaine officiel.
- `work/feed-immersive/qa-complete/` : dernière exécution ciblée, 5 scénarios PASS, dont modération, réseau, fichiers invalides et anti-spam.

Migrations appliquées en QA puis production : `guard_feed_comment_rate`, `distinguish_video_comment_reports`, `count_only_video_reports_for_feed_visibility`. Les trois comportements ont été relus dans le schéma de production.

Les essais intermédiaires ont révélé un défaut réel de scroll et une confusion réelle des signalements, corrigés. Des arrêts supplémentaires provenaient de sélecteurs de tests devenus obsolètes, du délai global d’un parcours à huit tailles et de dépendances entre fixtures ; ils ne sont pas comptés comme des PASS. Les statuts ci-dessus reposent sur les exécutions confirmées.
