# Prestations et tâches des collaborateurs

- `/staff/services` : sélection des prestations existantes du salon; déclaration libre d'une prestation absente du catalogue. Le collaborateur ne modifie que ses propres qualifications, sans pouvoir changer les prix ou les fiches de ses collègues.
- Une déclaration libre n'est pas une offre tarifée : le responsable configure prix/durée dans son catalogue avant qu'elle soit réservable. Les horaires, qualification, activation et capacité demeurent contrôlés par les fonctions de réservation existantes.
- `/staff/tasks` : tâches personnelles, statuts à faire/en cours/terminée. Le responsable attribue les tâches dans `/salon/team` ou `/pro/team`, avec consignes et échéance dans le fuseau du salon.
- Le responsable reçoit une notification des prestations renseignées; le collaborateur reçoit une notification de nouvelle tâche. Les tâches s'actualisent toutes les 30 secondes et au retour au premier plan.
- Tables privées par privilèges et RLS activée : `staff_service_declarations`, `salon_staff_tasks`. Écriture et lecture via RPC contrôlant session, activité, salon, affectation et révocation. Aucun nouveau droit financier.
- L'acceptation explicite d'une invitation est conservée pendant l'authentification pour reprendre le rattachement et ouvrir `/staff` sans deuxième clic d'acceptation. L'intention ne vaut que pour le token exact accepté. La simple ouverture d'un lien n'inscrit personne et ne crée pas de droits.
- WhatsApp sert au partage du lien. Un compte Mata Beauty authentifié/confirmé reste nécessaire; l'authentification par code WhatsApp dépend de l'activation Meta encore en attente. Aucun compte fictif ou autoconfirmé n'est créé.

## Vérifications

Tests transactionnels QA avec rollback : inscription et rattachement existants, conservation des qualifications/horaires, modification de ses seules prestations, déclaration libre, attribution propriétaire, tâches personnelles, interdiction collègue/tiers/révoqué, prix préservés et notification créée. Tests unitaires sur la reprise de consentement après authentification.

Aucun SMS/WhatsApp réel envoyé par ces tests. Tests navigateur du nouveau parcours non exécutés dans cet environnement.
