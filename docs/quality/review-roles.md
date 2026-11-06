# Profils de sous-agents de revue

Ces profils sont des consignes de délégation, pas cinq services IA permanents. Les utiliser avec le mécanisme de sous-agents disponible ; à défaut, faire les passes séparément sans prétendre à une revue indépendante.

Chaque revue commence par le diff et les exigences, reste en lecture seule, et fournit : sévérité, fichier/ligne, scénario reproductible, preuve, correction proposée et limite de vérification. Aucun secret, aucune modification de production. L'intégrateur valide les conclusions avant de modifier le code.

| Profil | Responsabilité | Scénarios négatifs |
|---|---|---|
| Sécurité | RBAC, tenant, RLS, API, Storage, données privées | Tiers, visiteur, session expirée, usurpation de propriétaire |
| Réservation | Durée, prix, fuseaux, statuts, capacité, concurrence | Chevauchement, transfert, annulation, double clic |
| Interface | Mobile, contraste, clavier, labels, états de chargement et erreur | 320/390/768 px, formulaires vides, panne réseau |
| Régression | Tests pertinents, fixtures isolées, erreurs et reprise | Faux succès, duplication, réponses périmées |
| Livraison | CI, migration, commit, version publique, retour arrière | Déploiement en échec, cache ancien, schéma incompatible |

Déléguer les domaines affectés, pas systématiquement cinq tâches identiques. Partager uniquement les éléments nécessaires. Ne pas demander aux sous-agents d'approuver leur propre implémentation.
