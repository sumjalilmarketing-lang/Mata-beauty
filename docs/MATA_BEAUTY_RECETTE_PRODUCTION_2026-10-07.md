# MATA Beauty — recette de production du 7 octobre 2026

## Décision : C — NON PRÊT pour un lancement public sans réserve

La gestion **Équipe & accès est déployée et qualifiée**. Les parcours critiques détaillés ci-dessous passent réellement sur https://mata-beauty.com. La recette exhaustive de tous les contrôles de toutes les pages et l’examen de toutes les fonctions SQL privilégiées restent incomplets. Les sous-modules historiques non connectés ne sont pas transformés en PASS par une navigation réussie. La décision porte sur le lancement général, pas sur un échec des parcours qualifiés.

## Version et méthode

- Application : `c8331a7052877305fa48d42d996f25fa80a7dc59`.
- Déploiement : `dpl_FXY8g7KstvgZfisHRWk8KnbmzF79` ; URL immuable `https://mata-beauty-3du6m340n-africrm.vercel.app`.
- Domaine : https://mata-beauty.com ; HTTP 200. À 10:52 CEST : 14 fichiers JavaScript identiques avec le déploiement immuable authentifié, zéro différence.
- Six migrations Équipe/RBAC appliquées au projet Supabase production `qjdwxdbvrxedyfolnpol` après qualification QA.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (90 tests) et `pnpm build` passent avant le commit applicatif. Ils sont distincts des tests réels ci-dessous.
- Chromium, fenêtres desktop et vues mobiles simulées. Les tests ont créé des utilisateurs, documents, prestations et réservations fictifs, puis les ont nettoyés. Les e-mails de recette sont adressés aux destinataires de simulation Resend.
- Le consentement et la reconnexion Google ont été effectués par l’utilisateur ; les effets ont ensuite été contrôlés en base, sans accès à ses identifiants.

## Résultats exécutés sur le domaine / backend de production

Les nombres sont ceux des scénarios ou contrôles nommés, pas ceux des clics. Les relances identiques ne sont pas additionnées. Le scénario Support de navigation, répété dans la suite opérations, n’est compté qu’une fois.

| Lot | Contrôles distincts PASS | FAIL restant dans le lot | Preuve |
|---|---:|---:|---|
| Équipe, invitations, MFA et rôles — serveur | 28 | 0 | work/team-audit/production-rpc-results.json |
| Équipe — navigateur | 13 | 0 | work/team-audit/production-ui-results.json |
| Publication vidéo/photo, feed → réservation, modération | 4 | 0 | work/team-audit/production-video |
| Quatre documents → complément → approbation ; MFA | 2 | 0 | work/team-audit/production-dossier |
| Menus, routes directes, notifications, logout, six profils | 6 | 0 | work/team-audit/production-direct-routes |
| Catalogue, Salon complet, profil Client, navigation publique, responsive Auth | 5 | 0 | production-salon-retest et production-broad-retest |
| GPS simulé / repli manuel / panne feed et reprise | 6 | 0 | work/team-audit/production-degraded |
| Auto-attribution, auto-approbation, révocation, protection Super Admin | 24 | 0 | work/final-audit/final-role-security.json |
| Réservation concurrente, double requête, prix protégé, paiement mock | 8 | 0 | work/final-audit/booking-concurrency.json |
| Santé avec panne partielle ; ticket Support jusqu’à résolution | 2 | 0 | work/team-audit/production-operations |
| Inscription SMTP, bienvenue unique, reset, reconnexion | 7 | 0 | production-smtp.json et production-smtp-delivery.json |
| E-mails de sept événements/destinataires réels de recette | 7 | 0 | production-transactional-emails.json |
| Reconnexion Google confirmée par l’utilisateur et contrôlée en DB | 1 | 0 | Contrôle DB du 7 octobre après confirmation humaine |
| **Total de ce périmètre exécuté** | **113** | **0** | Ne vaut pas couverture exhaustive de l’application |

Les neuf assertions supplémentaires du script de candidature/e-mails recouvrent des contrôles déjà qualifiés ; elles ne sont pas ajoutées à ce total. Les 90 tests unitaires sont également exclus. Les réserves NOT TESTED/BLOCKED ci-dessous restent hors de ce total de contrôles exécutés.

## Résultats utilisateur importants

| Zone | Action réellement effectuée | Attendu | Observé | Statut |
|---|---|---|---|---|
| Équipe | Inviter Finance, ouvrir l’e-mail, choisir un mot de passe, configurer MFA | Accès Finance seulement | Parcours terminé et API équipe refusée | PASS |
| Équipe | Finance → Support dans l’UI | Retrait immédiat de Finance | Même session refusée Finance, acceptée Support | PASS |
| Équipe | Suspendre, actualiser, tenter une connexion ; réactiver ; révoquer | Blocage puis réactivation contrôlée | Permissions et sessions bloquées ; révocation retire les appartenances | PASS |
| Vidéo | Pro publie MP4 ; Client lit, défile, ouvre la prestation et réserve | Contexte et réservation corrects | Parcours terminé ; lecteur testé ; démarrage observé à 539 ms sur cette exécution | PASS |
| Modération | Signaler, examiner, masquer, retrouver l’audit, restaurer | Décision appliquée | Publication et audit conformes | PASS |
| Candidature | Quatre documents, ouverture PDF, demande de complément, remplacement, approbation | Accès Pro après validation uniquement | Parcours terminé | PASS |
| Réservation | Deux clients concurrents puis double requête du même client | Un seul enregistrement | Un succès et un conflit 23P01 dans chaque cas | PASS |
| Salon | Profil, collaborateur, prestation, horaires, média, réservation, messages, avis/statistiques | Données cohérentes | Parcours terminé depuis un salon de recette approuvé | PASS |
| Auth e-mail | Double clic inscription → confirmation → profil ; reset depuis autre navigateur | Client unique et nouveau mot de passe utilisable | Une requête inscription ; confirmation, bienvenue et reset livrés par Resend ; reconnexion réussie | PASS |
| Google | Reconnexion humaine au même compte | Même utilisateur Client | Identifiant inchangé, une identité Google, un profil, un envoi de bienvenue | PASS |
| E-mails métier | Dossier reçu, complément, nouvelle soumission, approbation, réservation et confirmation | Bons liens, pas de double envoi du même événement | Sept envois, une tentative chacun ; domaine canonique | PASS |
| Mobile | Connexion visiteur et déconnexion connectée ; responsive Auth | Commandes accessibles | Boutons présents ; Auth aux sept dimensions demandées | PASS |
| Localisation | Autorisation/refus/indisponibilité/timeout/précision simulés | Message ou saisie manuelle utilisable | Repli manuel testé | PASS |
| Localisation matérielle | GPS sur téléphone réel | Position et résultats proches | Pas exécuté dans cette session | NOT TESTED |
| Scroll matériel | Trackpad physique | Défilement naturel | Impossible à qualifier avec une souris ou une simulation | NOT TESTED |

Les e-mails « dossier reçu » correspondent à deux soumissions distinctes avant/après complément. Les deux confirmations de rendez-vous concernent deux destinataires. Aucune duplication d’un même événement/destinataire n’a été constatée. La boîte humaine de bienvenue a été confirmée par l’utilisateur lors de sa première inscription Google ; les autres livraisons ont été vérifiées via Resend, pas dans sa messagerie personnelle.

## Échecs rencontrés et résolution

| ID | Reproduction / cause | Résolution | Statut |
|---|---|---|---|
| BUG-TEAM-01 | L’ancienne attribution cumulait Finance et Support | Remplacement atomique des appartenances ; même session retestée | PASS QA et production |
| BUG-TEAM-02 | Finance pouvait archiver un salon étranger par RPC | Propriétaire ou Super Admin requis ; six rôles internes refusés | PASS QA et production |
| BUG-TEAM-03 | Timestamp Auth infini incompatible avec les opérations Auth | Date finie et verrou profil conservé ; fixtures nettoyées | PASS QA et production |
| TEST-02 | Le scénario Salon préparait son approbation avec un Admin ordinaire | Refus conservé comme assertion ; préparation par Super Admin de recette après MFA | PASS après retest ; aucune permission relâchée |
| TEST-03 | Adresse de simulation trop longue, Resend 422 | Partie locale raccourcie ; sept envois métier passent ; nettoyage confirmé | PASS après retest ; aucun changement applicatif |
| TEST-04 | Sélecteurs anciens « Profil » pour ouvrir la connexion visiteur | Reconnaissance de « Se connecter à MATA Beauty » | PASS après retest |

L’approbation Salon réalisée dans la préparation du scénario est un appel autorisé de fixture, pas une preuve de parcours administratif Salon clic par clic. Le scénario de candidature professionnelle, lui, utilise réellement son interface d’examen.

## Réserves avant accueil public

| Problème | Risque / fonction | Bloquant avant lancement | Correction ou qualification nécessaire | Statut |
|---|---|---|---|---|
| Examen complet des RPC privilégiées historique inachevé | Périmètres métier/RLS éventuellement contournables par un chemin non testé | OUI | Terminer l’examen et les tests adverses de chaque RPC exposée, notamment paiements et écriture d’audit | NOT TESTED |
| Sous-modules Finance non raccordés à leur source métier | Soldes, remboursements, rapprochement et versements non opérationnels | OUI avant paiement en ligne réel ; NON si paiement sur place uniquement | Conserver mock ; qualifier/raccorder les flux avant activation d’un fournisseur | BLOCKED |
| Files secondaires Support / Modération / Onboarding incomplètes | Files génériques, sanctions/appels/affectations non opérationnels | OUI avant usage autonome de ces files | Qualifier chaque action, raccorder l’existant ou retirer clairement de l’offre de lancement | NOT TESTED |
| Pilotage Lancement/Cohorte/antifraude absent ou partiel | Pas de surveillance complète malgré présence des menus | OUI si inclus dans l’exploitation prévue | Résoudre les ressources manquantes sans introduire de faux compteurs | BLOCKED |
| Inventaire clic par clic incomplet | Une navigation réussie ne prouve pas toutes les actions | OUI pour la validation exhaustive demandée | Compléter les contrôles restants par rôle, y compris erreurs, clavier/focus et actions secondaires | NOT TESTED |
| GPS et trackpad physiques | Comportements réels non prouvés | OUI pour lever ces réserves matérielles | Recette sur appareils réels | NOT TESTED |
| Réception des invitations et e-mails métier dans une boîte humaine | Délivrabilité réelle hors simulation non qualifiée | OUI avant invitation de collaborateurs réels sans suivi | Vérifier réception/spam dans une boîte contrôlée ; aucun secret nécessaire | NOT TESTED |

Inventaires détaillés historiques : `MATA_BEAUTY_LAUNCH_BLOCKERS_2026-10-06.md` et `MATA_BEAUTY_SECURITY_RESERVES_2026-10-06.md`. Leurs lignes Administrateurs/Rôles sont remplacées par le rapport Équipe actuel ; leurs autres réserves ne sont pas implicitement levées.

## Prochaines actions exactes

1. Finir la qualification des fonctions privilégiées et de l’isolation métier, sans se limiter aux refus Client/Pro.
2. Fixer le périmètre exploitable des modules internes secondaires et qualifier leurs opérations réelles ; conserver les paiements mock.
3. Terminer la matrice exhaustive des contrôles visibles, y compris annulation/modification, liens secondaires, erreurs et accessibilité.
4. Faire les contrôles GPS/trackpad sur matériel réel et la réception d’une invitation dans une boîte humaine.
5. Rejouer les parcours critiques après toute correction supplémentaire et vérifier de nouveau le commit servi sur le domaine.

La livraison Équipe est qualifiée ; **aucune conclusion « toute l’application est prête » n’est émise**.
