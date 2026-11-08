# Corrections de l’audit général du 8 novembre 2026

## Périmètre

F01–F10 sont corrigés dans ce lot. Le correctif de finalisation Storage de la PR 49, déjà appliqué à la base, est inclus pour réconcilier le code de référence avec la production.

- F01 : quatre métriques sociales limitées par UID vérifié ; ingestion anonyme côté serveur avec clé IP HMAC de l’entrée Vercel et plafonds IP/global. Le compteur de partages, le consentement et l’annulation des requêtes restent préservés.
- F02 : les objets documentaires référencés deviennent immuables ; une correction utilise un nouveau chemin et une nouvelle revue. Verrouillage de la source avant référencement, suppression directe des preuves interdite aux utilisateurs.
- F03 : erreurs de transfert distinguées par statut HTTP ; journalisation serveur limitée à des étapes fixes, sans URL signée, jeton ou contenu utilisateur.
- F04 : délai de chargement, erreur et reprise du tableau de bord administrateur.
- F05 : retrait de la recherche globale sans consommateur. Les recherches locales réellement opérationnelles des listes et du CRM restent disponibles ; ajout d’une recherche dédiée au support.
- F06 : pagination serveur et ordre déterministe des demandes au support, recherche du sujet sur tous les résultats autorisés, protection contre les réponses obsolètes.
- F07 : paramètres personnels authentifiés accessibles sans rôle client, métadonnées privées, absence de lien vers une candidature client inaccessible. Aucun rôle supplémentaire attribué.
- F08 : dialogue natif de confirmation : focus initial, confinement, Échap et restauration du focus.
- F09 : rendez-vous confirmé déjà commencé affiché avant le prochain rendez-vous futur.
- F10 : état collectif de soumission d’avis séparé de l’auteur ; un collègue autorisé voit qu’un avis existe sans divulgation anticipée de son contenu.

H01 : lecture des octets réellement reçus pour les avis et invitations, même sans Content-Length fiable. H02 : cookies initiaux Secure sur HTTPS. H03 : les entrées privées précédemment statiques sont désormais dynamiques et reçoivent un nonce CSP. La compatibilité inline des pages publiques statiques reste distincte.

H04 reste une amélioration de rétention à planifier : les échecs connus nettoient les fichiers temporaires, mais une réponse de préparation perdue après son émission peut laisser un objet privé abandonné. Ce lot n’introduit pas de suppression automatique sans coordination avec la publication.

## Vérifications

- Base PostgreSQL isolée PGlite : migration réelle, quota partagé entre quatre métriques, rotation des identifiants, ACL anonymes, limites IP/globales, déduplication, publication privée ; documents immuables et nouvelle revue ; fonctions existantes d’autorisation des avis avec client/propriétaire/collaborateur, accès révoqué et suspension.
- Les tests de documents réutilisent le garde documentaire existant. L’effacement privilégié est vérifié dans l’ordre retrait de la référence puis retrait de l’objet ; aucune suppression réelle n’est effectuée.
- La concurrence multiconnexion PostgreSQL et le remplacement effectif des octets via l’API Storage ne sont pas simulés par PGlite.
- Tests navigateur ajoutés pour chargement/reprise admin, 101 tickets, paramètres internes, clavier et avis collectif. Exécution locale bloquée avant ouverture des pages par Chromium : `socket() failed: Operation not permitted`. Ce blocage n’est pas un résultat applicatif ; les scénarios sont inclus dans le job navigateur de la CI.
- Aucun compte réel, paiement réel, document personnel ou contenu privé utilisé pour les preuves.

La réussite des tests automatisés ne remplace pas une recette sur le téléphone ayant rencontré l’échec vidéo.
