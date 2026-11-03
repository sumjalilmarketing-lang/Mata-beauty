# Invitations salon — correctif et validation technique

## Portée

La correction s’applique à toutes les futures invitations de tous les salons. Le code ne contient aucune exception par adresse ou domaine de messagerie.

## Comportement proposé

- Contrôle des suppressions du prestataire avant création et envoi, après vérification des droits du propriétaire.
- Conservation du reçu d’envoi dans les événements privés existants, via une fonction réservée au propriétaire actif du salon.
- Consultation du statut après vérification des autorisations ; aucun contenu de message, destinataire ou secret retourné au navigateur.
- Bouton « Vérifier la livraison » : distingue prise en charge, acceptation du serveur destinataire, retard, rejet et suppression.
- Une acceptation de l’API n’est pas une preuve de réception en boîte principale.
- Un échec de conservation du reçu ne révoque pas une invitation déjà envoyée.
- Les invitations historiques sans reçu affichent honnêtement un suivi indisponible.

## Validation

Branche indépendante de la PR #35 : 337 tests automatisés réussis, TypeScript et compilation de production réussis ; lint sans erreur et six avertissements existants. Les tests n’envoient aucune invitation réelle.

Migration appliquée uniquement à Test. Vérifié : anon ne peut pas exécuter la nouvelle fonction ; authenticated ne peut pas modifier directement les événements privés ; appel par utilisateur sans autorisation refusé.

Aucun test navigateur ni scénario réel complet d’acceptation Outlook/Hotmail validé. Les recettes restantes couvrent réception réelle, courriers indésirables, redirection après authentification, refus d’un compte différent, permissions exactes, expiration et usage unique.

## Intégration

La PR #36 reste en brouillon. Aucune fusion, migration ou mise en production réalisée. Après validation et autorisation explicite, appliquer la migration avant le déploiement applicatif. Aucune réécriture des invitations ou des rôles existants n’est nécessaire.

Les diagnostics de messages réels sont conservés séparément de ce document technique ; ils ne constituent pas une preuve de compatibilité de toutes les boîtes d’un fournisseur.
