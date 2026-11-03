# Rétablissement de l’entrée commerciale après création du mot de passe

## Incident vérifié

La capture utilisateur montre une page 404 après le parcours de mot de passe d’un responsable commercial. Le compte Henri Jean Baptiste Gomis possède toujours le rôle `commercial_manager` actif, sans révocation, sur un profil actif non suspendu ; aucun rôle ni mot de passe n’est modifié par ce correctif.

À l’inspection, le domaine officiel était servi par `dpl_2jpkUYiQCordEagZCjmbTeM8Znsd`, commit `78a6a82b008563b5f118292189412cc6f07c2b7c`, issu de `stabilization/production-readiness`. Ce commit descend de `9958a6a`, sans les livraisons de la branche `codex/department-workspaces-20261103` : `/commercial`, `/auth/workspace`, CRM et délégation notamment. Le déploiement précédent de cette branche avait été remplacé par celui de la branche de production. Ce défaut de provenance explique l’absence des routes ; l’URL exacte de la capture n’est pas disponible.

## Correction

Réconcilier le code livré sur la branche des espaces internes avec les commits de production `63a0b62` et `78a6a82`. Les cinq fichiers ajoutés/modifiés pour notifier l’ancien employé et réattribuer à un collègue sont conservés. Le conflit de fins de ligne dans `app/team-management.tsx` est résolu après normalisation, avec conservation des deux modifications.

Après création du mot de passe, le lien vers le résolveur `/auth/workspace` devient un lien HTML de navigation complète. Ce résolveur est une route HTTP d’authentification : son ouverture ne doit pas dépendre d’une transition App Router ou d’une prélecture. Une recette reproduit l’absence de navigation document avant correction, puis valide la navigation complète après correction.

La déconnexion après changement de mot de passe reste effective. Le membre se reconnecte avec son nouveau mot de passe ; le serveur vérifie la session, les rôles en base et les exigences MFA, puis l’envoie vers son département. Aucun rôle de l’URL ou des métadonnées utilisateur ne donne accès. Le bouton n’annonce plus systématiquement une configuration MFA puisque la décision appartient au serveur.

La branche de production reçoit l’arbre réconcilié afin que ses prochains déploiements contiennent aussi les espaces internes. Aucune PR n’est fusionnée par une action GitHub de fusion ; aucune migration supplémentaire n’est appliquée aux bases pendant cet incident.

## Validation

- 470 tests unitaires, 77 fichiers réussis.
- 14 tests navigateur des espaces internes réussis (ordinateur et mobile), dont création du mot de passe, activation simulée, déconnexion, nouvelle connexion et arrivée commerciale. Auth, email et MFA sont simulés dans cette recette : aucune connexion avec les identifiants réels de Henri n’a été réalisée.
- ESLint : aucune erreur ; 8 avertissements préexistants.
- Recette générale : 83 succès et 1 scénario de molette ignoré sur mobile. TypeScript et compilation de production vérifiés avant publication.
- Production contient toujours 11 réservations et 1 paiement lors de l’inspection ; aucune donnée métier modifiée par ce correctif.

## Retour arrière

Privilégier une correction ciblée du dernier commit. Restaurer uniquement le déploiement `78a6a82` réintroduirait l’absence des espaces internes ; restaurer uniquement `f57eb99` retirerait les dernières corrections de réattribution du salon. Ne pas restaurer la base : aucun changement de schéma n’est requis ici.
