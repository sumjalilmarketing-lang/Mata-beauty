# Correctifs Auth et localisation — 31 octobre 2026

Base : publication nationale 055796f88915e797233509a8c2540e205a6b5cfd. Cette livraison contient uniquement le correctif de résolution de l’origine d’authentification et le parcours d’invitation ordinaire, avec leurs tests. Elle ne contient aucun changement de schéma ni les fonctionnalités internationales non encore recettées.

Le callback garde les cookies sur le domaine de branche ou de déploiement exactement autorisé par les variables système de Vercel. Les domaines tiers sont rejetés par cette sélection ; le domaine canonique configuré en Production est conservé. Une invitation ordinaire peut atteindre la création du mot de passe sans dépendre d’une clé d’administration. Le traitement configuré des invitations internes et leur activation serveur restent inchangés, avec habilitations et MFA.

Validation : 192 tests dans 40 fichiers, 26 contrôles de structure, TypeScript et build PASS. Lint : zéro erreur, huit avertissements de navigation existants. Aucun secret ni destinataire réel dans la livraison. Aucune modification Supabase Production.

Autorisation de publication : demande explicite de l’utilisateur de corriger et publier sur mata-beauty.com, dans la limite de ne pas compromettre l’application. Le déploiement devra être vérifié READY, domaine assigné, pages publiques fonctionnelles et refus de liens invalides. Ce correctif ne certifie pas la recette complète Client/Professionnel/Salon/Collaborateur ni les réservations internationales.


## Localisation publique fiable

Défaut reproduit après publication initiale : la recherche qualifiait Vaulx-en-Velin de « Sénégal ». La route publique prenait le pays du profil personnel du propriétaire. Elle utilise maintenant exclusivement le pays de l’établissement dans provider_profiles. En l’absence de cette colonne dans le schéma national historique, elle renvoie un enrichissement vide ; la ville reste affichée sans inventer un pays. Les autres erreurs restent masquées par un refus 503. Aucun profil personnel n’est lu par cette route.

Tests : pays professionnel FR distinct du pays personnel SN, compatibilité avec colonne absente, refus des pays invalides ou des identifiants non demandés. La branche internationale dispose déjà du pays professionnel dans son schéma ; cette correction nationale n’exécute aucune migration.

Publication Auth initiale b679209 : déploiement dpl_CYxKHW6B2FTqnsNR5kmdft63yTkX READY, mata-beauty.com assigné sans erreur. Accueil, catalogue et recherche inspectés ; contrôle initial error/fatal sans entrée. La correction de localisation est l’étape suivante de cette même livraison et nécessite son contrôle après publication.
