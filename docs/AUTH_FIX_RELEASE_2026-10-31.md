# Correctif Auth isolé — 31 octobre 2026

Base : publication nationale 055796f88915e797233509a8c2540e205a6b5cfd. Cette livraison contient uniquement le correctif de résolution de l’origine d’authentification et le parcours d’invitation ordinaire, avec leurs tests. Elle ne contient aucun changement de schéma ni les fonctionnalités internationales non encore recettées.

Le callback garde les cookies sur le domaine de branche ou de déploiement exactement autorisé par les variables système de Vercel. Les domaines tiers sont rejetés par cette sélection ; le domaine canonique configuré en Production est conservé. Une invitation ordinaire peut atteindre la création du mot de passe sans dépendre d’une clé d’administration. Le traitement configuré des invitations internes et leur activation serveur restent inchangés, avec habilitations et MFA.

Validation : 190 tests dans 40 fichiers, 26 contrôles de structure, TypeScript et build PASS. Lint : zéro erreur, huit avertissements de navigation existants. Aucun secret ni destinataire réel dans la livraison. Aucune modification Supabase Production.

Autorisation de publication : demande explicite de l’utilisateur de corriger et publier sur mata-beauty.com, dans la limite de ne pas compromettre l’application. Le déploiement devra être vérifié READY, domaine assigné, pages publiques fonctionnelles et refus de liens invalides. Ce correctif ne certifie pas la recette complète Client/Professionnel/Salon/Collaborateur ni les réservations internationales.
