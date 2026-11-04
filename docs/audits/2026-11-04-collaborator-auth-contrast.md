# Mata Beauty — audit collaborateur, identité téléphone et contraste

Date : 4 novembre 2026, Dakar.

## Résultats vérifiés

- 538 tests automatisés réussis ; lint sans erreur (7 avertissements préexistants) ; TypeScript et compilation de production réussis.
- 36 tests navigateur réussis sur Chromium ordinateur et mobile : 12 pour téléphone/contraste/disponibilités/transfert, 2 inventaires de toutes les routes collaborateur, 22 régressions réservation et connexion existante.
- Base de recette : invitation rattachée à la bonne fiche, conservation des horaires et prestations, agenda limité aux affectations, modification de ses propres disponibilités, blocage des nouveaux créneaux, transfert à un collègue disponible, refus des accès étrangers et révoqués, absence de droits financiers.
- Notifications : une alerte collaborateur lors d’une réservation, propriétaire informé, ancien/nouveau collaborateur informés du transfert ; arrêt des nouvelles informations de réservation après révocation, y compris via le mécanisme de diffusion des notifications.
- Identité téléphone : une adresse email vide ne bloque plus un numéro confirmé ; avant confirmation le compte reste non vérifié ; la demande professionnelle reste soumise à examen ; les métadonnées du client ne donnent aucun droit administrateur.
- Contraste : les six raccourcis du profil professionnel/salon ont un fond blanc et un texte sombre, ainsi qu’un survol contrasté. Ratios AA vérifiés et couleurs réellement rendues contrôlées dans le navigateur.

Scripts SQL : `tests/integration/collaborator-workspace-rollback.sql` et `tests/integration/phone-only-identity-rollback.sql`. Données synthétiques, transactions intégralement annulées, aucun message réel envoyé.

## WhatsApp directement avec Meta

Le raccordement utilise le Send SMS Hook signé de Supabase pour livrer les codes par Meta ; Supabase garde la création et la validation des codes. Aucun Twilio n’est nécessaire. L’email et Google restent disponibles.

**L’envoi WhatsApp réel n’est pas validé et demeure désactivé tant que l’expéditeur, le modèle d’authentification approuvé, les identifiants Meta et le hook Supabase ne sont pas configurés.** Voir `docs/whatsapp-auth-setup.md`. Les tests HTTP emploient un faux prestataire et les tests navigateur des sessions simulées ; ils ne prouvent pas la réception d’un code sur un téléphone réel.

## Limites de l’audit

Pas de réception réelle WhatsApp/SMS/email, ni de notification push sur appareil physique, ni de paiement réel. Safari/iPad natifs ne sont pas testés. Les audits automatiques de base signalent toujours des éléments préexistants (notamment la vue publique social_feed en SECURITY DEFINER et la protection des mots de passe divulgués désactivée), hors des corrections ciblées de ce lot. Cet audit valide les parcours et périmètres testés ; il ne constitue pas une certification exhaustive de sécurité de l’application.
