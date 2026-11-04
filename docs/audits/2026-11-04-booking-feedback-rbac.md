# Réservations, agendas et évaluations — 4 novembre 2026

## Changements

- Le dashboard professionnel filtre par son identifiant de prestataire OU les identifiants de ses salons détenus, sous RLS. Il affiche les 200 réservations créées le plus récemment, tous statuts confondus, et indique cette limite. Ce n'est pas un historique exhaustif.
- La vue salon propose un sélecteur explicite lorsque le propriétaire possède plusieurs salons. Les compteurs quotidiens utilisent le fuseau du salon.
- Réservations : abonnements Realtime côté professionnel/salon; actualisation par notification privée côté collaborateur; repli toutes les 30 secondes et au retour au premier plan. Les politiques RLS existantes continuent de filtrer les événements. Une connexion Realtime perdue peut donc retarder l'affichage jusqu'au repli.
- Les collaborateurs utilisent toujours le RPC d'agenda filtré par affectation et permissions actives. Le répertoire d'équipe ne renvoie que les identifiants, noms et intitulés, sans planning ni données financières.
- Déplacement par propriétaire via `reschedule_owned_booking` : session contrôlée, rendez-vous futur en attente/confirmé, même durée, prix et collaborateur, verrou de ressource, contrôle des disponibilités et conflits existants. Le collaborateur ordinaire ne peut pas déplacer le rendez-vous.
- Les choix de collaborateur, qualifications, absences, verrous et transferts existants sont conservés; tests de non-régression SQL exécutés en QA.

## Évaluations

La nouvelle table `booking_reviews` complète les avis historiques `reviews` sans modifier leurs politiques de modération. Elle contient reviewer_id, reviewee_id, booking_id, type, rating, critères, commentaire, visibilité et embargo. Les agrégats historiques de profil continuent de porter sur `reviews`; le nouveau flux s'affiche dans le rendez-vous. Aucune migration destructive des avis historiques.

L'accès direct à la table est révoqué; RLS activée. Écriture par `submit_booking_review`, qui dérive les identités de la réservation et de la session et exige une prestation terminée. Un avis par direction et réservation. Le propriétaire/prestataire ou le collaborateur affecté disposant de bookings.manage peuvent évaluer le client.

`GET/POST /api/bookings/reviews` : session vérifiée, schéma Zod strict, réponse sans cache, erreurs SQL non exposées. Le composant lit le RPC avec les mêmes règles.

L'auteur peut lire son propre avis immédiatement. Les avis publics sont dévoilés lorsque les deux directions sont soumises, ou 48 heures après le dépôt de chaque avis. Le délai est évalué à la lecture et n'exige pas de cron. Les avis internes ne deviennent jamais publics. Le passage à completed crée une notification par destinataire distinct et les actions sont présentes dans le rendez-vous.

## Rôles

Owner = propriétaire effectif du salon en base. L'ancien libellé interne `manager` d'une fiche collaborateur n'accorde pas à lui seul une vue globale ni de nouveaux droits financiers. Une délégation de gestion globale à un manager distinct du propriétaire nécessite un modèle de permission dédié; elle n'est pas accordée implicitement par ce lot.

## Vérifications et état

- TypeScript, lint, tests unitaires/API et build exécutés; détails dans le compte rendu de livraison.
- Transactions QA avec fixtures synthétiques et rollback : invitation/agenda/absence/transfert/révocation/finance, évaluations autorisées/refusées/doublons/embargo/confidentialité, déplacement propriétaire et refus collaborateur.
- Production non modifiée par ces migrations au moment de ce compte rendu. Les migrations sont versionnées dans supabase/migrations.
- Les tests navigateur de ce nouveau lot n'ont pas été exécutés dans cet environnement (exécutable Chromium précédemment utilisé absent). Aucun test avec vrais paiements, SMS ou notifications natives.
