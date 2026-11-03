# Acomptes par prestation et politique d’annulation — 3 novembre 2026

## Comportement livré

Le propriétaire peut modifier « Acompte prévu (%) » dans Mes prestations / Modifier, de 0 à 60 %, avec recommandations de 20–30 % pour les prestations courtes et jusqu’à 60 % pour les prestations longues ou coûteuses. Aucun classement automatique ni taux imposé sur le catalogue existant.

Avant confirmation, le client voit le prix total, l’acompte prévu, le solde théorique après paiement de cet acompte, ainsi que le montant réellement dû aujourd’hui (0) et le total à régler sur place. Le taux et la devise sont conservés dans le brouillon lors de la connexion ; le catalogue alimente également le parcours depuis une vidéo. Les nouveaux libellés de réservation sont traduits en anglais et espagnol.

La politique publiée sur `/legal/annulation` et résumée avant confirmation prévoit une annulation gratuite au moins 48 heures avant, le remboursement intégral si le professionnel annule, et la conservation du seul acompte réellement payé pour une annulation tardive ou une absence, sous réserve des droits applicables et contestations. Aucun solde supplémentaire n’est prélevé automatiquement. Les autres documents juridiques non rédigés restent distincts : cette livraison ne constitue pas leur validation juridique.

## Limite opérationnelle explicite

Aucun paiement réel ni remboursement n’est activé. CinetPay n’est pas intégré par cette livraison. Le réglage est une configuration prévisionnelle, sans dette ni encaissement créé. La sandbox existante réalise un paiement intégral : elle est donc refusée pour une prestation avec acompte positif, côté interface et API, avant toute initialisation. Le parcours sur place reste utilisable.

Avant de facturer réellement un acompte, il faudra un devis serveur immuable associé à la réservation, l’acceptation de la politique versionnée, les notifications de paiement vérifiées et idempotentes, la gestion du solde, les remboursements et leur rapprochement. Un simple changement de variable d’environnement ne suffit pas.

## Migration et conservation

`20261103192448_service_deposit_percentage.sql` ajoute uniquement `provider_services.deposit_percentage`, smallint NOT NULL DEFAULT 0, CHECK 0..60. Elle ne modifie ni les réservations ni les paiements, ni l’ancien champ `deposit_amount`. Appliquée sur Test puis Production. Les 18 prestations de Production sont restées à 0 %. Les anciennes réservations conservent leurs contrats.

RLS reste active ; aucune politique et aucun privilège supplémentaire n’ont été ajoutés. Test et Production ont des politiques préexistantes différentes : Production contrôle aussi le statut publié, l’archivage, l’appartenance au salon et les permissions commerciales. Cette livraison ne les remplace pas par les politiques plus anciennes de Test.

Essais SQL hébergés non persistants en Production : 0 mise à jour sous anon et sous authenticated sans identité ; 1 mise à jour au taux de 30 sous simulation des claims du propriétaire, transaction annulée. Il s’agit de simulations SQL, pas d’une connexion Auth réelle du propriétaire. Test accepte 60 dans une transaction annulée ; les rejets de 61, -1 et NULL sont couverts par PGlite.

Empreintes intégrales avant/après (md5 de string_agg(to_jsonb(row)::text, '' order by id)) :

- Réservations : 11 ; `603277f32c97bdadc0d00899d2c998d8`.
- Paiements : 1 ; `2212386289248db5b567886425e8c17f`.

## Validation

470 tests unitaires dans 77 fichiers : calculs et arrondis XOF/EUR/USD/GBP/CAD, bornes, conservation des montants, refus du checkout intégral pour un acompte, fermeture en cas de configuration indisponible. 26 contrôles structurels réussis. ESLint : aucune erreur, 8 avertissements préexistants.

Recette générale : 79 succès et 1 test mobile ignoré (scénario de molette réservé au bureau). Après correction de la devise depuis le flux vidéo : 22 tests de réservation réussis sur ordinateur et mobile, dont 30 % et 60 % avant confirmation et après connexion, ainsi que 35 EUR à 30 % (10,50 EUR / 24,50 EUR) et conservation de la devise à l’insertion. Publication de la politique contrôlée et captures mobile/ordinateur inspectées. TypeScript et compilation de production réussis. Aucun email, paiement ou rendez-vous réel créé pendant la recette.

## Retour arrière

Restaurer le frontend Vercel précédent `dpl_GD3ozXA26KeZorpDRLxqU4Z8aBba` (d484297). Conserver la colonne additive et ses réglages : l’ancien frontend les ignore ; pas de suppression de colonne ni restauration globale de base. Aucun transfert ni paiement à annuler. Si une collecte réelle est ajoutée ultérieurement, réévaluer ce retour arrière avant toute restauration.
