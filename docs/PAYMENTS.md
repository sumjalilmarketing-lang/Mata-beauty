# Paiements Mata Beauty

## Décision fournisseur

PayTech est la passerelle cible pour le premier marché sénégalais. Sa
documentation officielle annonce Orange Money Sénégal, Wave, Free Money et
carte bancaire dans une même intégration, un environnement `test`, des IPN,
une API de remboursement et des transferts. Cette couverture correspond mieux
à la V1 locale qu'une intégration séparée de chaque opérateur.

L'activation reste conditionnée à la validation contractuelle et technique du
compte marchand. La répartition des fonds n'est pas considérée comme acquise :
les montants `held` et `available` sont une comptabilité interne Mata Beauty,
pas un compte séquestre juridique. Les frais publiés peuvent évoluer et doivent
être confirmés au contrat avant mise en production.

Sources officielles consultées le 3 août 2026 :

- https://paytech.sn/
- https://docs.intech.sn/doc_paytech.php

## Frontière de sécurité

- Le navigateur ne reçoit que les variables Supabase publiques.
- Les prix, commissions et montants nets sont recalculés sur le serveur en XOF
  entiers.
- La clé de service Supabase et les secrets PayTech restent exclusivement côté
  serveur.
- Un retour vers la page de succès ne confirme jamais un débit.
- Seul un webhook signé, au montant et à la devise attendus, peut modifier le
  statut du paiement.
- Les événements, références fournisseur et clés d'idempotence sont uniques.
- Le registre professionnel est append-only ; les soldes sont des vues
  calculées.

## Activation sandbox

1. Faire valider le compte marchand PayTech et les moyens Wave, Orange Money
   et carte pour le Sénégal.
2. Enregistrer dans Vercel Preview les secrets de test listés dans
   `.env.example`, sans préfixe `NEXT_PUBLIC_`.
3. Enregistrer l'URL HTTPS `/api/payments/webhook` chez PayTech.
4. Implémenter et valider l'adaptateur réseau PayTech à partir du contrat exact
   du compte ; conserver `PAYMENT_PROVIDER_MODE=mock` jusque-là.
5. Tester succès, annulation, expiration, mauvaise signature, rejeu, mauvais
   montant, mauvaise devise et remboursement dans la sandbox.
6. Effectuer une revue sécurité et un rapprochement comptable avant d'activer
   la production.

## Limites actuelles

Le mode mock ne débite rien et ne fournit aucune URL de checkout. Les moyens de
paiement en ligne restent donc désactivés dans l'interface. Les remboursements
sont enregistrés comme demandes auditables, mais ne sont pas envoyés à PayTech
avant validation de la sandbox. Aucun numéro de carte, PIN, OTP ou secret
opérateur n'est stocké par Mata Beauty.
