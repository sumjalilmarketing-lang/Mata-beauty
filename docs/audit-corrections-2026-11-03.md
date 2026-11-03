# Corrections après audit général - 3 novembre 2026

La migration `20261103161056_audit_booking_and_legacy_media_guards.sql` est appliquée sur Test et Production. Elle ne modifie aucune réservation, aucun paiement ni fichier. Les définitions inattendues arrêtent la transaction.

Le contrat d'une réservation reste immuable pour les clients et agents, y compris ceux disposant d'un rôle interne avec MFA. L'exception générale `is_admin()` est remplacée par une permission explicite de gestion de statut, après contrôle du contrat. Le service serveur conserve son accès. L'annulation client fonctionne aussi lorsque client et professionnel sont la même personne. Une politique restrictive protège les vidéos et miniatures privées historiques contre l'accès des rôles délégués, tout en conservant propriétaire et publication publique autorisée.

Les empreintes normalisées du trigger sont identiques sur Test et Production : `d08c41105fa989536bdba1aeff0df6bf`. Après application, les 11 réservations et le paiement Production conservent leurs nombres et empreintes intégrales antérieurs.

L'interface cesse d'envoyer une demande de suppression lorsque le motif est annulé. Une mise à jour de statut ne peut plus annoncer un succès si aucune réservation n'est retournée ; elle vérifie aussi le statut attendu. Les paramètres professionnels ne sont plus remplacés par le profil public ; l'ancienne adresse menu ouvre les paramètres.

Validation : 419 tests unitaires dont 15 nouvelles régressions SQL, 26 contrôles structurels, TypeScript et compilation. Recette SQL hébergée des équipes réussie sur Test après migration, données synthétiques annulées. Les nouveaux tests PostgreSQL couvrent les six rôles, MFA, immutabilité, annulation double rôle, tiers, opérateur autorisé, serveur, propriétaire/public des anciens médias et refus de dérive de définition.

La langue française des scénarios navigateur est explicite. Leurs médias simulés passent par le contrat d'URL HTTPS signé actuel, sans désactiver la CSP. Un lot intermédiaire de 44 parcours s'est arrêté après six échecs : 28 réussis, 10 non exécutés. La suite globale n'est donc pas déclarée entièrement verte. Les scénarios internationaux et de cycle vidéo nécessitent encore une recette complète ; les tests ne sont pas désactivés.

Restent distincts : rédaction/validation des CGU et de la confidentialité, réception réelle Outlook/Hotmail, blocage des utilisateurs, recette native/iOS et dossier des stores. Aucun succès sur ces points n'est revendiqué. Aucun email réel envoyé ni rôle attribué à une personne pour ces corrections.

Retour arrière : restaurer le déploiement frontend précédent si nécessaire ; conserver les protections SQL. Toute restauration des anciennes gardes rouvrirait les défauts de l'audit et nécessite une décision explicite. Les scripts ne suppriment aucune donnée.
