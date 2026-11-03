# CRM commercial Mata Beauty — 3 novembre 2026

> État intermédiaire : la livraison et les contrôles de la délégation hiérarchique sont décrits dans [l’audit actualisé](delegated-teams-audit-2026-11-03.md).

## Fonctionnalités développées

- CRM natif dans l’espace commercial : vue commerciale, prospects et relances à échéance, avec accès séparé aux dossiers professionnels.
- Fiche établissement : nom, contact, téléphone, email, ville, adresse, origine du contact et prochaine relance (heure de l’appareil, instant stocké en UTC).
- Pipeline : à contacter, contacté, rendez-vous, proposition, inscription en cours, gagné, perdu ; motif obligatoire pour une perte.
- Recherche et pagination de 50 prospects. Les compteurs portent sur tous les résultats autorisés, pas seulement sur la page visible.
- Historique paginé de 25 événements : notes, appels, rendez-vous et comptes rendus email/WhatsApp, plus trace automatique des créations, changements d’étape, réaffectations, archives et restaurations. Le journal n’envoie aucun message.
- Chaque commercial travaille sur les prospects qui lui sont affectés. Le Super Admin voit l’ensemble et peut les réaffecter à un commercial actif. Les anciens propriétaires perdent l’accès au prospect et à son historique.
- Liaison facultative avec un dossier professionnel existant, recherché par nom ou ville. Un prospect gagné et un dossier approuvé sont deux états distincts. Le CRM n’approuve aucun compte et ne modifie aucune réservation.
- Archivage/restauration, sans suppression de l’historique.

## Sécurité et migrations

La migration `20261103112737_commercial_crm.sql` exige d’abord `department_workspaces`. Elle ajoute `crm.manage` aux rôles commercial et super_admin, sans attribuer de rôle à une personne. Les agents de vérification existants ne deviennent pas automatiquement commerciaux.

Les deux tables publiques activent RLS. Finance, support, client et accès anonymes n’obtiennent aucun accès CRM. Le MFA et le statut actif sont contrôlés en base ; aucune autorisation ne dépend des métadonnées utilisateur. Créateur, responsable, dates et version ne peuvent pas être fournis librement par les appels du navigateur. Seule une RPC réservée au Super Admin réaffecte un prospect.

Les notes ne peuvent pas être modifiées ou supprimées par les agents. Les écritures d’historique portent l’auteur réel. La version de fiche permet de refuser un enregistrement devenu obsolète. L’ajout d’une note verrouille et recontrôle le prospect face à une réaffectation.

Une suppression de dossier professionnel peut retirer uniquement le lien CRM par clé étrangère sans bloquer la suppression ; elle n’efface ni le prospect ni ses notes. La suppression physique d’un compte commercial encore référencé exige une réaffectation et un traitement explicite des références ; désactivation et révocation des accès restent utilisables sans effacer l’historique.

## Vérifications réellement effectuées

- 362 tests automatisés réussis, TypeScript et compilation de production réussis ; lint sans erreur, six avertissements préexistants.
- Parmi eux, dix tests SQL exécutent la migration CRM réelle dans un PostgreSQL embarqué PGlite 0.5.14, avec un schéma minimal, des données synthétiques et des claims Auth simulés. Les trois fonctions RBAC reproduisent les définitions lues sur Test.
- Vérifications SQL locales : refus anon/finance/support/client/AAL1 ; isolation entre deux commerciaux ; auteur réel ; réaffectation Super Admin et perte d’accès de l’ancien commercial ; écriture obsolète refusée ; historique immuable et faux événements refusés ; archivage/restauration ; 151 prospects correctement agrégés ; recherche littérale ; révocation/suspension ; liaison sans approbation et nettoyage de lien lors d’une suppression ; exclusion des relances closes/archivées ; contraintes de champs.

Ces tests locaux ne remplacent pas une recette Supabase Auth, PostgREST et navigateur. PGlite est une dépendance de développement uniquement, épinglée ; il n’est pas utilisé par le CRM déployé.

## État et suite

Aucune migration CRM appliquée à Supabase et aucune mise en production. La migration préalable des espaces métiers reste non appliquée sur Test : les confirmations précédentes ont expiré. Aucun vrai prospect importé, aucun message envoyé, aucun accès réel attribué.

Après confirmation Supabase sur Test : appliquer les deux migrations dans l’ordre, contrôler les conseillers sécurité, puis vérifier avec deux commerciaux et un Super Admin réels de recette : connexion/MFA, création et modification, relance, note, réaffectation, lien dossier, archives et refus d’accès finance/support. Vérifier également les invitations internes et la validation de dossier indépendante du pipeline. Ensuite seulement décider de la publication sur mata-beauty.com.

## Retour arrière

Avant production : aucun effet sur les données actuelles. Après une future publication, redéployer l’application précédente et retirer l’accès CRM si nécessaire, sans supprimer les prospects ni leur historique. Ne pas retirer le rôle commercial ou supprimer des personnes encore référencées sans revue et réaffectation explicites.
