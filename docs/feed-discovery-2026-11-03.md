# Découverte des vidéos Mata Beauty — 3 novembre 2026

## Fonctionnement livré

Le fil « Pour toi » utilise les publications publiques éligibles de Mata Beauty, sans exiger d’abonnement au créateur. Un fil « Abonnements » séparé permet de retrouver les créateurs suivis ; la connexion est requise pour ce fil. Le bouton de rafraîchissement recharge les publications récentes, sans interrompre périodiquement le lecteur à l’insu de l’utilisateur.

Le classement de chaque lot combine le score existant (récence et engagement) avec une affinité par prestation : tresses, barbier, coiffure, perruques, maquillage, ongles, spa, massage, soins. L’affinité est déduite du titre, de la légende et des hashtags des publications appréciées/enregistrées présentes dans le premier lot, ainsi que des titres des vingt réservations récentes du compte. Les lectures achevées à 95 % et les nouvelles réactions enrichissent les intérêts en mémoire pour les lots suivants. Aucun intérêt n’est partagé entre comptes et aucun historique supplémentaire n’est enregistré en base.

Une place de découverte est réservée à intervalle régulier aux publications récentes (72 h) encore peu vues (moins de 100 vues), lorsqu’une alternative d’auteur existe dans le lot. Les autres contenus restent présents. Le système n’utilise pas le sexe pour déterminer les prestations qui peuvent intéresser une personne.

Les lots supplémentaires sont ajoutés à la suite du fil : une réaction ou une pagination ne retrie plus les clips déjà affichés. Les filtres explicites de recherche, de prestation et de localisation restent applicables ; le fil sans filtre n’impose aucune restriction d’abonnement.

Le boost payant reste absent de l’interface. Aucun achat publicitaire, facturation, nombre de vues garanti ou diffusion forcée à tous les comptes n’est mis en place.

## Accès et sécurité vérifiés

Contrôle en lecture seule de la définition réelle de public.social_feed et des politiques de posts, post_likes, post_saves, follows et favorites en Production. Le fil public exige une publication publiée et publique, un professionnel approuvé non suspendu, une prestation active associée et l’absence de signalement fort au sens de la fonction de modération existante. La publication de vidéos par de simples comptes clients n’est pas ajoutée par cette livraison.

Les lectures de réactions, abonnements et favoris ajoutent un filtre explicite sur le compte connecté, en complément de la RLS existante. Les signaux personnels sont facultatifs et limités à cinq secondes d’attente ; le fil public reste disponible si leur chargement échoue. Une panne de lecture des abonnements affiche une erreur et une action de reprise, plutôt qu’une fausse liste vide.

Observation Production au moment du contrôle : 8 vidéos publiques de 3 créateurs. Les tests de recommandation emploient des données synthétiques ; ce petit volume réel ne permet pas de mesurer une hausse statistique des vues ni de conclure à la capacité de diffusion à grande échelle.

## Portée et retour arrière

Aucune migration ni modification de réservation, paiement, rôle ou fichier vidéo. Les améliorations de lecture et les installations par espace sont conservées, ainsi que les opérations commerciales du commit 38c6e497f483c94f61f2e115417170b924441999 et l’espace RH du commit bf7e39c7cd411f577e8daa25ea63caea7d8a8329, arrivé pendant la préparation de la publication.

Le classement est une première version explicable, réalisée par lots côté application. Il ne s’agit pas d’un moteur de recommandation entraîné ni d’un index global personnalisé côté serveur. Les lectures et intérêts de session ne constituent pas encore un profil comportemental durable entre appareils. La qualité 4K et le streaming adaptatif restent soumis aux limites exposées dans client-video-audit-2026-11-03.md.

Retour arrière applicatif : restaurer le déploiement dpl_J3nBGRyCyPEvH2qbLuEf2Y7pQu7t (commit bf7e39c), puis réconcilier le code avant la publication suivante. Aucune restauration de données nécessaire.

## Recette finale

- 519 tests unitaires réussis dans 84 fichiers sur la version combinée avec l’espace RH.
- Recette générale sur la base commerciale 38c6e4 : 135 parcours navigateur réussis sur ordinateur et mobile ; 1 cas de molette réservé au bureau ignoré sur mobile.
- 26 contrôles smoke réussis.
- TypeScript et compilation de production Next.js réussis.
- Lint : 0 erreur, 7 avertissements préexistants.

Les nouveaux parcours vérifient la découverte d’un créateur non suivi, l’affinité spa/massage, le maintien du clip après une réaction et une pagination, le filtrage des abonnements, la connexion requise et la reprise après panne des abonnements. Le test de panne laisse le délai nécessaire à l’expiration bornée des requêtes personnelles avant de vérifier l’erreur. Les vidéos et comptes de recette sont synthétiques ; aucun engagement ni réservation réelle n’est généré.

Après conservation du commit RH bf7e39c : 64 parcours supplémentaires de non-régression réussis sur ordinateur et mobile (découverte, parcours publics, client/finance et RH). TypeScript, compilation de production, 519 tests unitaires, lint et 26 contrôles smoke ont été relancés avec succès sur cette version combinée. Aucun changement du fil n’a été écrasé par la mise à jour concurrente.
