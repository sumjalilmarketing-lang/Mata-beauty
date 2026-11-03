# Audit des espaces client et finance — 3 novembre 2026

## Périmètre et méthode

Version de départ officielle : `e9a487fd683c4fb15318a84be5f96a3335c3a34f`, déploiement `dpl_GCti3C1wgNaHyKrUeHeuQXnfLGh3`. Revue des routes, navigation, création de mot de passe/reconnexion, historique privé, support, profil, synthèse financière, transactions, remboursements, commissions, wallets, versements, rapprochements, anomalies, journal et audit. Inspection des définitions et politiques réelles de Production, requêtes sous claims simulés dans des transactions annulées, tests navigateur sur comptes synthétiques.

Aucun email réel, réservation, paiement, remboursement, attribution de rôle ou migration n’a été exécuté dans cet audit. Les tests navigateur simulent Auth, l’activation et les données ; ils ne sont pas une connexion aux comptes réels des utilisateurs ni une certification des stores ou de la comptabilité.

## Corrections apportées

1. **Paiements client : erreur distincte d’un historique vide.** Un échec PostgREST produisait une liste vide, affichée comme « Aucun paiement enregistré ». États chargement/erreur/succès et bouton de reprise ajoutés. Idem pour le chargement des tickets de support. Les requêtes sont bornées et leurs rejets sont gérés.
2. **Identification des simulations côté client.** La mention « Paiement de test · aucun argent réel » tient compte de `is_test`, du fournisseur mock et du statut simulé. Aucun paiement simulé n’est présenté comme un encaissement réel.
3. **Photo de profil.** Le contrôle de sélection de photo est maintenant accessible dans l’éditeur intégré du profil unifié. Une mise à jour retournant zéro ligne ne peut plus afficher « Photo mise à jour » ; une ligne modifiée est requise.
4. **Profils inactifs.** Les profils clients désactivés, supprimés ou suspendus ne sont plus chargés sur la page propriétaire ou sur le profil social public sur la seule base d’une session encore présente.
5. **Listes de gestion, dont finance.** Les rejets réseau sont traités comme une indisponibilité, sans promesse rejetée non gérée ni liste vide trompeuse.

Le diagnostic initial d’un éditeur de profil absent a été écarté après inspection de la route explicite `/app/profile` : le profil unifié possède son éditeur et le lien paramètres ouvre `/app/profile?edit=1`. Ce fonctionnement a été conservé et testé, sans création d’un second profil.

## Résultats réellement vérifiés en Production

- RLS activée sur les tables client/finance examinées ; aucune table publique sans RLS détectée.
- Vue `wallet_balances` en `security_invoker=true`, respectant les politiques des tables sous-jacentes.
- Sous claims d’un client actif sans rôle interne : pas de permission `payments.read` ou `roles.manage`, zéro paiement, wallet, remboursement ou préférence étrangers lisibles. Les politiques des notes de support excluent `is_internal` pour le demandeur.
- Les appels directs à `finance_payment_overview` et `manage_refund_request` sont refusés au client. L’approbation de remboursement n’est pas testée sur une demande réelle.
- Sous AAL1 du compte portant le rôle finance : MFA requis, lecture financière et permission de remboursement refusées. Sous AAL2 du même compte, la synthèse et son paiement enregistré sont lisibles.
- Six vérifications SQL en lecture seule sur des valeurs synthétiques réussies : plus de 100 paiements, devises séparées, montants réels/test, espèces distinguées du paiement en ligne, statuts et remboursements.
- Les colonnes sélectionnées par les modules financiers correspondent au schéma existant.

### Configuration des accès : limite importante

Le rôle historique `finance` est détenu par le même compte que `super_admin`, `admin`, support et d’autres rôles historiques. Son droit `roles.manage` provient donc du cumul avec Super Admin : ce n’est pas la preuve d’une fuite du rôle financier isolé.

Aucun responsable `finance_manager`, agent `finance_agent` ni équipe finance active n’est actuellement configuré en Production. Ne pas prétendre qu’une équipe financière réelle a été recrutée et testée. Leurs définitions en base ont été vérifiées :

| Rôle | Permissions définies |
| --- | --- |
| finance_manager | finance.cases, payments.read, payouts.read, teams.manage |
| finance_agent | finance.cases |
| finance historique | bookings.read, commissions.manage, finance.cases, payments.read, payments.refund, payouts.manage, payouts.read |

La recette navigateur vérifie les responsables et agents isolés avec des comptes synthétiques, y compris l’absence de décision de remboursement pour `finance_manager` et le périmètre de dossiers pour l’agent. Aucune conversion du compte Super Admin ni attribution réelle n’a été faite. Pour exploiter cette délégation, désigner un responsable financier distinct puis ses agents.

### Limites des données disponibles

Production ne contient aucun message de support, aucune note interne et aucune écriture de wallet au moment de l’audit. Les requêtes négatives sur ces tables ne suffisent donc pas seules à démontrer leur isolation sur des données réelles : la revue des politiques et les tests synthétiques complètent ces contrôles. Un remboursement existe ; aucun statut ni montant n’est modifié.

Le journal financier est un suivi interne limité aux derniers mouvements affichés. Les synthèses ne constituent pas un solde bancaire ni une clôture comptable certifiée. Les paiements réels restent désactivés ; CinetPay et son rapprochement ne sont pas activés par cette livraison.

## Conservation et retour arrière

Empreintes intégrales avant/après, calculées avec md5(string_agg(to_jsonb(row)::text, '' order by id)) :

| Données | Nombre | Empreinte |
| --- | --- | --- |
| Réservations | 11 | 603277f32c97bdadc0d00899d2c998d8 |
| Paiements | 1 | 2212386289248db5b567886425e8c17f |

Retour arrière possible vers `dpl_GCti3C1wgNaHyKrUeHeuQXnfLGh3` sans restauration de base, puisque cette livraison ne change pas le schéma ou les données. Cela réintroduirait les défauts d’affichage corrigés ; préférer une correction ciblée.

## Validation de livraison

- 475 tests unitaires dans 78 fichiers réussis, dont cinq régressions sur les profils inactifs.
- 99 tests navigateur réussis, 1 scénario de molette ignoré sur mobile ; 16 scénarios ciblent spécifiquement les espaces client/finance.
- 26 contrôles structurels réussis ; TypeScript et compilation de production réussis.
- ESLint : 0 erreur, 8 avertissements préexistants.

Les premiers échecs de recette ont été analysés : certains venaient d’une fixture serveur qui ne représentait pas un client et d’attentes de test incorrectes (devise au format code, annonceur de route parmi les alertes). Ils ne sont pas déclarés comme des défauts de Production. Les fixtures ont été corrigées et la suite finale ci-dessus est verte.
