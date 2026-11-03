# Accès commerciaux, finance et service client

## Comportement préparé

Dans Super Admin → Équipe & accès, trois services permettent de filtrer les membres, inviter un nouveau membre ou attribuer un rôle à un compte existant. L’attribution et la révocation restent réservées au Super Admin avec MFA, motif et journal d’audit. Aucun compte réel n’a été créé ou modifié pendant ce développement.

- Commercial : espace `/commercial`, dossiers professionnels, justificatifs, compléments, approbation/refus et historique par dossier. Permissions : providers.read, providers.verify, documents.review, ainsi que crm.manage via la migration CRM séparée. Aucun annuaire général des clients, finance, support ou gestion des rôles.
- Finance : espace `/finance`, synthèse de tous les paiements par devise et par mode, paiements sur place séparés, remboursements, commissions, nets enregistrés, montants en attente et journal des 100 derniers mouvements des wallets. Ce journal ne constitue pas une comptabilité légale complète. Les paiements et virements restent dans leur mode actuel ; aucun fournisseur réel n’est activé.
- Service client et réclamations : espace `/support-agent`, file de tickets existante, réponses, affectations, priorités, suivi et contexte des réservations. Aucun droit de validation professionnelle, finance ou attribution des accès.

Après MFA, l’entrée administrative redirige les agents vers leur espace. L’URL directe Équipe & accès est aussi protégée côté serveur. Les rôles métier ne voient pas le menu Super Admin. Les rôles existants de vérification et d’opérations conservent leurs espaces.

## Migration

`20261103103837_department_workspaces.sql` crée le rôle commercial sans l’attribuer à une personne, retire audit.read au rôle finance (les journaux financiers restent accessibles via payments.read), ajoute une synthèse financière SECURITY INVOKER sous RLS et MFA, et inclut les commerciaux actifs dans les notifications de nouveaux dossiers.

Si un rôle commercial préexistant possède des permissions inattendues, la migration refuse de l’élargir. La synthèse ne mélange jamais devises ou simulations. Les commissions et nets sont des montants enregistrés avant ajustements de remboursement, pas un solde bancaire.

## Vérifié

- 362 tests automatisés réussis ; TypeScript et compilation de production réussis ; lint sans erreur, six avertissements existants.
- Six contrôles SQL en lecture seule sur Test, sur données virtuelles : total de 151 paiements non tronqué à 100 lignes, statuts/remboursements, sur place séparé, fournisseur mock et statut simulé toujours classés en test, devises/modes distincts.
- Vérification en lecture seule après les tentatives de migration : rôle commercial absent et nouvelle fonction absente de Test.

## Non vérifié / blocage

Deux demandes d’application de la migration sur Test ont expiré à l’étape de confirmation Supabase. La migration n’a donc été appliquée ni à Test ni à Production. Aucun changement de rôle ou permission réel effectué. Les nouveaux contrôles SQL d’autorisations ne sont pas déclarés réussis : `tests/integration/department-access-rollback.sql` est préparé pour les exécuter sur Test après application de la migration. Aucun parcours navigateur avec chaque rôle n’a été validé.

## Suite nécessaire

1. Confirmer l’application de la seule migration department_workspaces sur mata-beauty-global-test.
2. Exécuter les tests SQL transactionnels et vérifier le rollback ainsi que les conseillers sécurité.
3. Recette sur Test : connexion + MFA de chaque rôle, création/retrait d’accès par le Super Admin, dossiers complets/incomplets, tickets et journal financier. Aucun envoi vers un vrai membre sans instruction explicite.
4. Après validation et autorisation de publication, comparer la définition de la notification et les permissions entre Test et Production, appliquer la migration puis déployer le commit testé. Préserver les réservations, invitations et membres existants.

## Retour arrière

Le site en production n’a pas été modifié. Après une future publication, restaurer la version applicative précédente sans effacer journaux ni appartenances. Conserver le rôle commercial tant que des membres le référencent et traiter leur réaffectation explicitement. Ne pas restaurer automatiquement l’accès finance à l’audit général. La fonction de synthèse peut rester inutilisée ; supprimer une permission ou un rôle attribué exige une revue des comptes concernés.

## Extension CRM

Le CRM natif a été ajouté à la même PR, avec fiches prospects, pipeline, relances, notes et réaffectation par Super Admin. Voir `docs/commercial-crm-2026-11-03.md` pour sa migration distincte, les dix tests SQL locaux et les limites de recette Supabase encore non validée.
