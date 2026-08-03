# Architecture de paiement Mata Beauty

## Statut

Le paiement reste **désactivé en production**. Le mode par défaut est `mock` et ne confirme jamais un débit. L'adaptateur `paydunya_sandbox` ne peut être activé qu'avec les trois identifiants Sandbox présents côté serveur.

## Choix du PSP

PayDunya est retenu pour la phase Sandbox au Sénégal, car sa documentation officielle couvre la carte bancaire, Orange Money Sénégal et Wave Sénégal dans une même intégration SoftPay. L'API propose des endpoints Sandbox séparés, une IPN serveur et une API de confirmation du statut par token.

Sources officielles consultées le 4 août 2026 :

- https://developers.paydunya.com/doc/FR/softpay
- https://developers.paydunya.com/doc/FR/http_json
- https://developers.paydunya.com/doc/FR/sandbox_softpay

L'IPN PayDunya fournit un SHA-512 de la MasterKey. Comme cette preuve n'est pas une signature du corps complet, Mata Beauty ne s'y fie pas seule : chaque notification PayDunya est confirmée par un appel serveur-à-serveur à l'API `checkout-invoice/confirm/{token}` avant toute mutation financière.

## Flux

1. Le client authentifié envoie seulement `bookingId`, méthode et clé de tentative.
2. Le serveur recharge la réservation et calcule le montant en XOF.
3. `initialize_payment_v2` verrouille la réservation et réserve atomiquement la clé d'idempotence.
4. Le serveur crée la facture chez le PSP, puis rattache son token au paiement réservé.
5. Le retour navigateur ne modifie aucun statut.
6. L'IPN est authentifiée, confirmée auprès du PSP, contrôlée (référence, montant, devise, fraîcheur), puis transmise à une RPC atomique.
7. La RPC verrouille le paiement, applique la machine d'états, ajoute l'événement immuable, ajoute le ledger et confirme la réservation dans la même transaction.

## Comptabilité

`wallet_ledger` est append-only. Aucun solde n'est stocké ou modifié directement. `wallet_balances` calcule les soldes depuis les écritures. Les statuts `held` ne constituent pas une qualification juridique de séquestre.

## Journaux et données sensibles

- `payment_events` : événements PSP immuables, avec SHA-256 du payload et résultat.
- `financial_audit_log` : acteur, action, ancien/nouvel état, référence et IP pseudonymisée.
- `financial_security_events` : falsification, rejeu, incohérence ou dépassement de débit.
- Aucun PAN, CVV, secret PSP ou payload contenant des données carte n'est enregistré.

## Rapprochement

`reconciliation_runs` et `reconciliation_items` reçoivent les comparaisons périodiques entre les paiements internes et les exports/API PSP. Un traitement planifié devra appeler l'API PayDunya, classer les écarts et produire une alerte sans corriger silencieusement les écritures.

## Conditions de passage en production

- compte Business PayDunya validé et homologation contractuelle ;
- clés de production stockées exclusivement dans Vercel ;
- rotation des secrets et procédure d'incident testées ;
- rapprochement automatisé exécuté avec succès en Sandbox ;
- remboursements PSP total et partiel homologués ;
- analyse PCI DSS/SAQ et conformité BCEAO/OHADA/RGPD validées par les conseils compétents ;
- tests de charge, reprise, fraude et disponibilité à 100 % ;
- revue indépendante du code et des politiques RLS.
