# Audit des espaces Salon et Professionnel — 3 novembre 2026

## Résultat et périmètre

Version de départ : 5855d9c25cdb6ba835412f5b5afc0d053a6c30cf, déploiement officiel dpl_7rY9V72opCw4ZWg1JbMhNxwRFvaj. Audit des routes, navigation et menu Plus, prestations, réservations, profil/visibilité du salon, fermetures, portfolio, équipe, agenda et droits d’accès. Corrections d’interface sans modification du schéma ni migration en Production.

## Défauts corrigés

| Défaut confirmé | Correction |
| --- | --- |
| Mise à jour de réservation professionnelle annoncée réussie avec zéro ligne modifiée | Une ligne retournée est exigée ; statut attendu vérifié et erreur explicite en cas de changement concurrent |
| Réservation du salon modifiée par ID seul | Filtrage par salon et ancien statut, vérification de la ligne effectivement enregistrée |
| Enregistrement du profil, visibilité, activation de prestation ou suppression de fermeture confirmés sans ligne modifiée | Vérification du résultat et filtres du propriétaire/salon ; activation protégée aussi par la version updated_at |
| Fichier de portfolio effacé avant validation de sa suppression en base | La base confirme d’abord la suppression ; sinon le fichier est conservé. Les logos/couvertures encore utilisés doivent être remplacés avant retrait |
| Mise à jour du logo ou de la couverture ignorée après l’ajout du média | Erreur partielle explicite si l’image est enregistrée mais que sa publication échoue |
| Photo de collaborateur annoncée enregistrée avec zéro ligne modifiée | Vérification de la ligne, filtrage par salon, nettoyage du seul nouveau fichier en cas d’échec |
| Chargement du salon sans borne ou rejet réseau non traité | Délais bornés, état d’erreur et reprise ; ancien message d’erreur effacé lors d’un nouvel essai |
| Nouvelle prestation prétendument en brouillon sans horaires mais activée par le trigger commercial de Production | Statut draft explicite quand les horaires manquent, published sinon ; repli vers is_active seul uniquement après l’erreur explicite de colonne status absente sur l’ancien schéma Test |

La différence de schéma a été vérifiée directement : Production possède status et un trigger BEFORE INSERT OR UPDATE OF status ; Test ne possède pas status. En Production, omettre status lors d’un INSERT utilise published et peut écraser is_active=false. La définition réelle du trigger a été copiée dans une fixture locale et son comportement reproduit sous PGlite. Aucun taux, statut ou service existant n’a été modifié en masse.

## Sécurité et cohérence vérifiées

- RLS active sur les tables de salons, prestations, collaborateurs, horaires, exceptions et réservations inspectées.
- Politiques de modification des prestations limitées au propriétaire et à ses salons, aux délégations commerciales explicites ou à categories.manage. Les permissions de création/modification des collaborateurs sont contrôlées par require_owner et les prestations extérieures au salon sont refusées.
- Sous claims simulés d’un client actif sans rôle interne, dans une transaction READ ONLY : is_super_admin=false, categories.manage=false, aucun droit service.update sur les salons d’autrui.
- Le trigger guard_provider_trust_fields interdit aux clients authentifiés de modifier directement validation, badge de vérification, notes agrégées ou propriétaire du profil professionnel.
- La réattribution réelle vérifie le propriétaire ou l’employé actuellement affecté avec bookings.manage, recontrôle après verrou, exige un rendez-vous futur et un collègue du même salon qualifié/disponible. Ces définitions ont été inspectées ; aucun rendez-vous réel n’a été transféré pendant cet audit.
- Les objets business-media sont publiquement lisibles ; leur ajout, modification et suppression exigent owns_business sur le dossier du salon. Ce bucket n’est pas approprié à des justificatifs privés.
- L’archivage archive_owned_business conserve réservations et historique ; les changements de devise incompatibles avec les prestations existantes sont refusés par les triggers.

### Limites et méthode

Un essai UPDATE sans changement de valeur sur les prestations étrangères, prévu dans une transaction annulée, a été refusé par le contrôle automatique : il pouvait toucher un grand nombre de lignes et déclencher verrous/triggers. Il n’a pas été exécuté ni contourné. La vérification a été remplacée par la lecture des politiques et fonctions, une transaction explicitement READ ONLY et les tests locaux/synthétiques. Aucun nouvel essai d’écriture en Production n’a été fait.

Les tests navigateur utilisent des comptes et données fictifs. Ils couvrent le propriétaire professionnel/salon, les états de refus/erreur et la navigation ; le drapeau collaborateur du banc général reste désactivé. La connexion réelle d’un équipier, les réceptions Gmail/Outlook, les notifications réelles et la concurrence entre utilisateurs sur une réservation réelle ne sont pas requalifiées comme validées ici. Les fonctions de sécurité correspondantes ont été lues, sans envoi d’invitation réelle. Les contrôles ne constituent pas un audit exhaustif de toutes les fonctions administratives de la plateforme.

## Conservation et retour arrière

Au début de l’audit : 11 réservations, 1 paiement. Empreintes intégrales (md5 de string_agg(to_jsonb(row)::text, '' order by id)) : réservations 603277f32c97bdadc0d00899d2c998d8 ; paiements 2212386289248db5b567886425e8c17f. Aucune donnée métier réelle n’a été modifiée dans les contrôles.

Retour arrière frontend possible vers dpl_7rY9V72opCw4ZWg1JbMhNxwRFvaj sans restauration de base. Cette restauration réintroduirait les faux succès et le défaut de création en brouillon ; préférer une correction ciblée.

## Validation finale

479 tests unitaires dans 79 fichiers réussis, dont quatre tests SQL locaux reproduisant le trigger commercial réel. 117 tests navigateur réussis, 1 scénario de molette ignoré sur mobile ; 18 tests ciblent les espaces salon/pro sur ordinateur et mobile. 26 contrôles structurels, TypeScript et compilation de production réussis. ESLint : aucune erreur, 7 avertissements préexistants (l’avertissement de variable updated inutilisée est résolu).

Les premiers échecs de recette provenaient de noms de boutons attendus incorrects et d’une fixture renvoyant un objet au lieu d’une liste pour une requête .in ; ces attentes et données fictives ont été corrigées. Ils ne sont pas présentés comme des défauts de Production.

Les empreintes des 11 réservations et du paiement ont été relues après les contrôles : elles sont identiques à celles de départ. Aucun horaire, congé, membre d’équipe, service ou montant réel n’a été modifié par la recette.
