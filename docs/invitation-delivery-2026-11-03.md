# Invitations salon — correctif et validation technique

## Portée

La correction s’applique à toutes les futures invitations de tous les salons. Le code ne contient aucune exception par adresse ou domaine de messagerie.

## Comportement proposé

- Création explicite d’un lien à partager directement avec le destinataire, sans envoi d’email. Le même lien est aussi proposé au propriétaire après une prise en charge par le prestataire.
- Le lien apparaît uniquement à sa création, reste en mémoire dans la page et n’est pas conservé dans le stockage du navigateur. Fermer la page fait perdre cette copie ; l’invitation peut toujours être révoquée.
- Acceptation avec l’adresse invitée et confirmée uniquement, expiration à 48 heures et usage unique. Aucun accès attribué à la création du lien.
- Une invitation déjà en attente n’est pas remplacée silencieusement : révocation explicite avant nouvelle création.
- Contrôle des suppressions du prestataire avant création et envoi, après vérification des droits du propriétaire.
- Conservation du reçu d’envoi dans les événements privés existants, via une fonction réservée au propriétaire actif du salon.
- Consultation du statut après vérification des autorisations ; aucun contenu de message, destinataire ou secret retourné au navigateur.
- Bouton « Vérifier la livraison » : distingue prise en charge, acceptation du serveur destinataire, retard, rejet et suppression.
- Une acceptation de l’API n’est pas une preuve de réception en boîte principale.
- Un échec de conservation du reçu ne révoque pas une invitation déjà envoyée.
- Les invitations historiques sans reçu affichent honnêtement un suivi indisponible.

## Validation

Branche indépendante de la PR #35 : 343 tests automatisés réussis, TypeScript et compilation de production réussis ; lint sans erreur et six avertissements existants. Les tests n’envoient aucune invitation réelle.

Avant publication, migration et contrôles de permissions validés sur Test. Vérifié : anon ne peut pas exécuter la nouvelle fonction ; authenticated ne peut pas modifier directement les événements privés ; appel par utilisateur sans autorisation refusé.

Contrôle supplémentaire en Test, avec fixtures synthétiques et transaction annulée : création réservée au propriétaire, refus d’un autre compte ou d’une adresse non confirmée, permissions exactes, usage unique, révocation et expiration. Aucun faux reçu email pour un lien partagé. Absence des utilisateurs synthétiques vérifiée après rollback. Les définitions d’acceptation Test/Production sont identiques après normalisation des fins de ligne.

Les contrôles navigateur après publication confirment la présence des nouveaux boutons et le fonctionnement du suivi des anciens envois. Aucun scénario réel complet d’acceptation Outlook/Hotmail validé. Les recettes restantes couvrent réception réelle, courriers indésirables, copie sur mobile et redirection après authentification. Le lien de secours conserve l’exigence d’une adresse confirmée : si la confirmation d’inscription n’arrive pas non plus, utiliser une autre adresse possédée et confirmable ne remplace pas l’investigation de délivrabilité.

## Limite du correctif

Le suivi et le lien de secours ne lèvent pas un rejet SMTP par le fournisseur destinataire. Le problème de remise réelle ne peut être déclaré résolu qu’après une livraison observée. Une investigation du prestataire d’envoi peut être nécessaire ; aucun renvoi répété automatique après rejet permanent.

## Intégration

Le 3 novembre 2026, après autorisation explicite du propriétaire, la migration additive de reçu a été appliquée en production, puis le commit fa4ef79a588a4293c2765aba2c466c1127a84812 a été déployé directement sur mata-beauty.com. Vercel confirme READY et le domaine officiel est associé à ce déploiement. La PR reste en brouillon et n’a pas été fusionnée ; les autres PR ne font pas partie de cette livraison.

Vérifications après déploiement : accueil et page d’acceptation HTTP 200, API équipe sans session HTTP 401, nouveaux boutons visibles dans l’espace salon authentifié, suivi d’un ancien envoi sans reçu explicitement indisponible. Aucun envoi, révocation ou rôle réel supplémentaire créé pendant ces vérifications. Aucun log error/fatal trouvé dans la fenêtre de démarrage interrogée ; cela ne constitue pas une garantie d’absence d’incident.

La fonction de reçu est exécutable par authenticated avec contrôle propriétaire, non exécutable par anon ; les modifications directes des événements privés restent refusées à authenticated. Le lien de secours réutilise les fonctions de création et d’acceptation existantes. Aucune réécriture des invitations ou des rôles existants.

Retour arrière : redéployer la version applicative précédente. Les invitations créées restent valables jusqu’à leur expiration ou leur révocation et les rôles acceptés restent conservés. La fonction de reçu additive peut rester en place ; ne pas effacer les événements pour revenir en arrière.

Les diagnostics de messages réels sont conservés séparément de ce document technique ; ils ne constituent pas une preuve de compatibilité de toutes les boîtes d’un fournisseur.
