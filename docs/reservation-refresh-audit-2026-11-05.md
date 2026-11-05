# Réservations et conservation des formulaires — 5 novembre 2026

## Défaut constaté dans le code

Le rafraîchissement périodique, au retour sur la fenêtre et via Realtime appelait le chargement complet de SalonControlCenter. Celui-ci passait l’espace en état loading et démontait les formulaires. Une modification de prestation ou de profil non enregistrée pouvait ainsi être perdue.

## Correction

Le rafraîchissement automatique ne lit désormais que les réservations du salon sélectionné, sans changer l’état de chargement de toute la page. Le filtre business_id reste explicite ; aucun statut ni date locale ne sont exclus. Les contrôles RLS existants restent appliqués par le client authentifié. La fenêtre reste limitée aux 200 rendez-vous aux dates les plus éloignées/récentes ; elle ne constitue pas un historique exhaustif.

Les réponses périmées sont ignorées même si le transport ne respecte pas l’annulation. Le changement de salon ou un chargement complet arrête la mise à jour précédente. Une panne conserve les données existantes et affiche un avertissement ; une réponse réussie suivante efface cet avertissement.

Aucune écriture en base, réservation réelle, invitation, paiement ou modification de rôle n’a été nécessaire.

## Vérifications et limites

- 572 tests Vitest réussis, dont quatre nouveaux contrôles de concurrence, reprise après erreur, annulation et transport filtré par salon.
- TypeScript et compilation de production réussis ; ESLint sans erreur, sept avertissements de navigation préexistants.
- Scénario navigateur ajouté : ouvrir une prestation en modification, saisir un titre, provoquer le retour sur la fenêtre, vérifier la conservation du titre. Ce scénario n’a pas pu s’exécuter : Chromium est arrêté avant le démarrage par une restriction socket de l’environnement. Ce blocage ne constitue ni un résultat réussi ni un défaut applicatif.
- L’accès réel à /salon/services redirige correctement le navigateur non connecté vers la connexion avec returnTo conservé. La validation visuelle de la modification nécessite une session salon authentifiée, non disponible pendant ce contrôle.

Ce lot ne revalide pas les paiements réels, les notifications hors application, la délivrabilité Outlook/Hotmail ni l’ensemble des parcours multi-rôles. Il ne constitue pas un GO global.
