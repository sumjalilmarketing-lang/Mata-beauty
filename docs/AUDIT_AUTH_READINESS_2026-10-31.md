# Audit de disponibilité MATA Beauty — 31 octobre 2026

Le domaine de référence est https://mata-beauty.com. La dernière publication nationale vérifiée est le correctif de dépendances 055796f. La version internationale reste soumise à recette ; aucun GO international ne peut être déduit de la compilation du site.

## Défauts d’authentification confirmés

1. **Changement de domaine en Preview.** Reproduit avec un token volontairement invalide sur l’alias international : le callback redirige de l’alias de branche vers l’URL unique du déploiement. Les cookies host-only ne suivent pas ce changement de domaine. Le correctif conserve l’origine visitée lorsqu’elle correspond exactement au domaine de branche ou de déploiement fourni par Vercel. Un domaine tiers, un autre projet Vercel et HTTP ne sont pas autorisés par cette règle.
2. **Invitation ordinaire dépendante d’une clé d’administration.** Après vérification Auth et synchronisation du profil, /auth/confirm appelait systématiquement le client service_role pour toute invitation. Dans un test isolé sans cette clé, cela empêchait l’accès à la création du mot de passe. L’invitation ordinaire fonctionne désormais avec la session vérifiée seule. Lorsqu’une configuration serveur existe, la détection d’une invitation interne est conservée ; l’activation des rôles reste exclusivement contrôlée par le serveur, ses habilitations et le MFA.
3. **Configuration des liens de test.** Site URL était localhost et aucun retour n’était autorisé. Correction déjà appliquée uniquement à mata-beauty-global-test : alias international et trois pages exactes /auth/confirm, /auth/callback, /auth/update-password. Aucun joker.
4. **Parcours e-mail à configurer pour une publication.** Le test utilise le SMTP intégré de Supabase. La réception par un opérateur autorisé ne certifie pas la livraison à des utilisateurs externes. Le lancement demande un SMTP dédié, sa délivrabilité et les modèles correctement reliés aux routes de l’application.

## Validation des correctifs de code

235 tests unitaires dans 45 fichiers : PASS. Les nouveaux cas couvrent les domaines de branche et déploiement, les refus de domaines tiers, la production canonique, le développement local, l’invitation sans clé privilégiée, le parcours interne configuré, les liens invalides et le refus d’un compte suspendu. 26 contrôles de structure PASS. TypeScript et build PASS ; lint zéro erreur et huit avertissements existants de navigation.

Ces tests ne remplacent pas les réservations authentifiées Paris/New York, les quatre rôles distincts, les notifications internes et la concurrence réelle. Les migrations internationales ne doivent pas être mises en production avec un simple déploiement de code sans recette coordonnée.

Aucun mot de passe, token, lien de récupération, destinataire réel ou donnée privée de messagerie n’est reproduit ici. Aucun rôle ni protection d’accès n’a été désactivé.
