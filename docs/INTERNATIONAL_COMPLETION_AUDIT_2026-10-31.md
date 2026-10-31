# Mata Beauty — finalisation internationale et audit général

Date : 31 octobre 2026. Environnement modifié : **mata-beauty-global-test**, projet `skrrfronlhoddtgxvezu`. Domaine public existant : mata-beauty.com. Aucun changement de données ou de schéma dans Supabase Production. Paiement réel et notifications à des clients réels non activés.

## Quatre défauts reproduits et corrigés

1. **Réservation indépendante hors contrôle de publication et de calendrier.** Avant correction, le test d’intégration insérait une réservation auprès d’un professionnel en brouillon : échec explicite `FAIL: draft provider accepted a booking`. Un nouveau contrôle privé du serveur exige un client actif, un professionnel approuvé et actif, une prestation active et non archivée, un établissement approuvé et actif le cas échéant, un mode de rendez-vous compatible et un créneau effectivement disponible. Le calcul canonique des disponibilités est réutilisé. Les verrous de ressource et la contrainte d’exclusion restent en place. Le plafond public de 80 résultats ne limite plus la validation interne des créneaux.
2. **Heure des notifications d’affectation.** Avant correction, le parcours salon échouait sur `assignment notification timezone incorrect in Paris`. Les notifications utilisent désormais le fuseau du salon ou du professionnel, indiqué dans le message. Le test passe aussi à New York.
3. **Liste des comptes collaborateurs inaccessible au propriétaire.** Le parcours échouait avec le code SQL `42804` : `auth.users.email` est de type varchar alors que la fonction déclare text. Un cast explicite corrige le résultat sans élargir les droits. L’accès reste réservé au propriétaire actif du salon.

4. **Horaires d’un salon sans affectation par collaborateur.** Un test complémentaire reproduisait des créneaux proposés malgré un jour de fermeture du salon (`closed salon/archived listing visible`). Le calendrier d’un service rattaché à un salon utilise maintenant les horaires du salon ; les règles personnelles ne rouvrent plus ce salon. Le refus d’insertion directe et l’absence de créneaux sont vérifiés.

## Migrations appliquées exclusivement dans le test

| Fichier versionné, créé par la CLI | Version attribuée par le connecteur distant |
| --- | --- |
| `20261031173823_enforce_international_booking_availability.sql` | `20261031175250` |
| `20261031175346_localize_assignment_notifications.sql` | `20261031175456` |
| `20261031175514_fix_owner_collaborator_access_result.sql` | `20261031175532` |
| `20261031180040_enforce_nonteam_business_hours.sql` | `20261031180103` |

Les fonctions correctives sont présentes et leurs tests passent. Les numéros distants sont générés par le connecteur lors de l’application ; cette correspondance doit être conservée pour une future réconciliation de l’historique. Les migrations internationales ne sont pas appliquées à Production.

## Recette serveur exécutée

Ces tests SQL utilisent le rôle Postgres `authenticated`, des identités et claims fictifs, et les politiques RLS et fonctions réelles. Les fixtures sont préparées par le banc de test dans une transaction puis intégralement annulées. Elles ne prouvent ni une connexion Supabase Auth réelle ni une approbation professionnelle par l’interface. Aucun compte privilégié supplémentaire n’est attribué.

| Périmètre | Résultat observé |
| --- | --- |
| Paris / Europe-Paris / EUR et New York / America-New_York / USD | Réservations indépendantes et salons PASS |
| Client, professionnel, propriétaire de salon, collaborateur et compte extérieur distincts | Restrictions de lecture/action serveur PASS |
| Professionnel brouillon ou suspendu ; prestation archivée | Refus d’insertion et absence de créneaux publics PASS |
| Hors ouverture, minute hors grille, exception de fermeture, jour fermé d’un salon sans équipe | Refus PASS |
| Montant, devise, durée et statut falsifiés par le client | Contrat recalculé par le serveur PASS |
| Réservation complète, confirmation par le professionnel | PASS |
| Client tentant de confirmer son rendez-vous | Refus PASS |
| Notifications internes de création, confirmation et annulation | PASS, heures et fuseaux vérifiés |
| Annulation, libération puis nouvelle réservation du même créneau | PASS |
| Seconde insertion sur le même créneau occupé | Refus `23P01` PASS ; ce test est séquentiel |
| Affectation automatique d’un collaborateur qualifié | PASS |
| Agenda d’un rendez-vous à 22 h dans le jour local du salon | PASS Paris et New York |
| Collaborateur : prestations et confirmation limitées au périmètre accordé | PASS |
| Collaborateur accédant aux comptes réservés au propriétaire ; compte extérieur agissant sur un rendez-vous | Refus PASS |
| Révocation par le propriétaire | Agenda, prestations et action du collaborateur ensuite refusés PASS |
| Règles de changement d’heure | PASS : 5 cas DST, 2 horaires invalides et 3 villes |

Fichiers reproductibles : `supabase/tests/international_booking_contract.sql`, `international_booking_eligibility.sql`, `international_team_contract.sql`, `international_closed_salon.sql` et `international_dst_slots.sql`. Ils sont réservés au projet isolé de test. Zéro utilisateur `qa-transaction-*` restant après vérification, zéro réservation durable ajoutée par ces essais. Zéro professionnel approuvé durablement par ces fixtures.

## Audit général de l’application

| Module | État et limite |
| --- | --- |
| Auth | Correctifs d’origine et d’invitation déjà déployés. Modèles e-mail du test enregistrés sur `/auth/confirm` avec TokenHash. Aucune session valide actuelle n’est déduite des tests de liens invalides. |
| Client / Professionnel | Cycle serveur international testé ci-dessus. Parcours navigateur authentifié à terminer. |
| Salon / Collaborateur | Affectation, agenda, monnaie, notification, permissions et révocation testés côté serveur. Invitations et connexion réelles à terminer dans le navigateur. |
| Réservations | Contrôle serveur renforcé et testé. Course simultanée entre deux transactions distinctes encore à mesurer. |
| Monnaies | EUR et USD conservés par contrat ; pas de conversion implicite ni mélange des agrégats déjà corrigés. |
| Paiements | Passerelle existante limitée à XOF en sandbox ; paiement international en ligne non certifié. Aucun paiement réel activé. |
| Notifications | Notifications internes testées. SMTP de test par défaut restreint ; délivrabilité de lancement non certifiée. |
| Données / RLS | Zéro table publique ordinaire sans RLS, zéro vue publique sans security_invoker dans l’inventaire du test. Ce constat ne constitue pas une preuve exhaustive de toutes les politiques. |
| Administration | Compte Super Admin de test existant avec MFA conservé. Aucun rôle ajouté pour ces essais. Session administrative valide nécessaire pour la recette UI d’approbation. |
| Langues | Choix de pays, fuseaux et devises présents. Les traductions complètes de tous les parcours ne sont pas certifiées. |
| Production web | Correctifs nationaux précédents publiés sur mata-beauty.com. Cette livraison de schéma reste isolée au test. |

Les advisors Supabase signalent encore des points à examiner : protection des mots de passe compromis désactivée dans le test, extension pg_net dans public, fonctions SECURITY DEFINER exécutables selon leurs grants, index de clés étrangères manquants et optimisations de politiques RLS. Une fonction RPC intentionnellement exposée avec contrôles internes n’est pas automatiquement une fuite ; ces avis ne doivent pas être effacés par une révocation générale qui casserait l’application. Les contrôles privés ajoutés restent non exécutables par anon et authenticated.

## Validation applicative

235 tests dans 45 fichiers PASS ; 26 contrôles structurels PASS ; TypeScript PASS ; lint zéro erreur et huit avertissements de navigation préexistants. Le premier build a rencontré un cache Turbopack local corrompu ; après déplacement du répertoire généré et reconstruction propre, le build passe. Aucun changement de dépendance dans cette livraison.

## Décision de lancement

**Le noyau serveur international progresse : les quatre anomalies reproduites sont corrigées dans le test et les parcours serveur ci-dessus passent. Le GO international public complet reste suspendu.** Il exige encore une session Auth réelle avec MFA pour le Super Admin de test, la soumission puis l’approbation normale du dossier fictif, les parcours navigateur des quatre espaces et un essai de concurrence entre transactions distinctes. Les migrations de Production et les intégrations de lancement doivent ensuite faire l’objet d’une publication contrôlée ; elles n’ont pas été exécutées dans cette mission.

Ne pas présenter les fixtures SQL comme un professionnel réellement approuvé ou une recette navigateur réussie. Ne pas désactiver la MFA ni créer de point d’entrée privilégié pour franchir ce blocage.
