# Paiements Mata Beauty

## Décision fournisseur

PayDunya est la passerelle Sandbox retenue pour le premier marché sénégalais.
Son intégration couvre Orange Money Sénégal, Wave et la carte bancaire dans un
même checkout de test. Cette couverture correspond à la V1 locale sans exposer
de secret PSP ni de donnée carte au navigateur.

L'activation reste conditionnée à la validation contractuelle et technique du
compte marchand. La répartition des fonds n'est pas considérée comme acquise :
les montants `held` et `available` sont une comptabilité interne Mata Beauty,
pas un compte séquestre juridique. Les frais publiés peuvent évoluer et doivent
être confirmés au contrat avant mise en production.

Sources officielles consultées le 4 août 2026 :

- https://developers.paydunya.com/doc/FR/softpay
- https://developers.paydunya.com/doc/FR/http_json
- https://developers.paydunya.com/doc/FR/sandbox_softpay

## Frontière de sécurité

- Le navigateur ne reçoit que les variables Supabase publiques.
- Les prix, commissions et montants nets sont recalculés sur le serveur en XOF
  entiers.
- La clé de service Supabase et les secrets PayDunya restent exclusivement côté
  serveur.
- Un retour vers la page de succès ne confirme jamais un débit.
- Seul un webhook signé, au montant et à la devise attendus, peut modifier le
  statut du paiement.
- Les événements, références fournisseur et clés d'idempotence sont uniques.
- Le registre professionnel est append-only ; les soldes sont des vues
  calculées.

## Activation sandbox

1. Faire valider le compte marchand PayDunya et les moyens Wave, Orange Money
   et carte pour le Sénégal.
2. Enregistrer dans Vercel Preview les secrets de test listés dans
   `.env.example`, sans préfixe `NEXT_PUBLIC_`.
3. Enregistrer l'URL HTTPS `/api/payments/webhook` chez PayDunya.
4. Configurer `PAYMENT_PROVIDER_MODE=paydunya_sandbox`,
   `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY` et `PAYDUNYA_TOKEN` uniquement
   dans la Preview. La route `/api/payments/capabilities` garde les moyens en
   ligne désactivés tant qu'un seul de ces éléments manque.
5. Tester succès, annulation, expiration, mauvaise signature, rejeu, mauvais
   montant, mauvaise devise et remboursement dans la sandbox.
6. Effectuer une revue sécurité et un rapprochement comptable avant d'activer
   la production.

## Limites actuelles

Le mode mock ne débite rien, ne crée plus de paiement en ligne via l'API et ne
fournit aucune URL de checkout. Les moyens en ligne restent donc désactivés
dans l'interface. Quand la Sandbox est entièrement configurée, le navigateur
ne peut suivre qu'une URL HTTPS exacte de checkout `app.paydunya.com`; le
retour navigateur affiche un état d'attente et seul le webhook confirmé peut
valider le paiement. Les remboursements restent des demandes auditables tant
que l'API de remboursement PSP n'est pas homologuée. Aucun numéro de carte,
PIN, OTP ou secret opérateur n'est stocké par Mata Beauty.
