# MATA Beauty — état de recette internationale

## Décision : NO-GO production

Cette livraison corrige une partie du back-office international. Elle ne valide pas le lancement. Aucun changement Supabase Production, aucun paiement réel et aucune notification externe n'ont été exécutés dans cette intervention.

## Périmètre et preuves

- Base exclusivement utilisée : `mata-beauty-global-test`, référence `skrrfronlhoddtgxvezu`.
- Preview inspectée : `https://mata-beauty-gxecfono6-africrm.vercel.app`, source `6050566` ; les modifications de cette branche n'y sont pas encore validées.
- Cinq migrations internationales présentes, vérifiées dans l'historique distant.
- Premier Super Admin de test créé avec autorisation utilisateur : une seule attribution active `super_admin`, MFA obligatoire, un facteur Auth vérifié et accès UI administratif observé.
- Audit bootstrap : `2f760d0d-e51a-41c3-9efc-f61b4d90577b` ; vérification MFA : `70028158-4fdf-4baf-8a60-b05385fd8c07`.
- Aucun privilège administrateur sur les autres comptes de test. Aucun droit d'organisation Supabase ou Vercel ajouté.
- RLS activée sur toutes les tables ordinaires du schéma public au moment du contrôle. Cela ne constitue pas une validation exhaustive de leurs politiques.
- Les contrôles anonymes `is_admin`, `is_super_admin` et `has_admin_permission('providers.verify')` renvoient false.

## Défaut corrigé dans cette branche

Les lignes du back-office imposaient FCFA à des montants dont la devise était stockée en EUR ou USD. Les commissions mélangeaient les devises dans un total unique.

Les réservations, prestations, paiements, commissions et versements utilisent désormais leur devise enregistrée. Le registre des commissions regroupe les totaux par devise, sans conversion implicite. Les tests couvrent Paris/EUR, New York/USD, XOF et les devises SQL remplies d'espaces.

Validation locale : `pnpm lint`, `pnpm typecheck`, `pnpm test` (205 tests, 42 fichiers), `pnpm build` : PASS. Installation avec lockfile figé. Aucun secret committé.

## Recette non terminée

| Contrôle | État | Preuve / condition restante |
| --- | --- | --- |
| Approbation Studio Test Paris | BLOQUÉ | UI : brouillon, non soumis, 0/4 documents ; compte professionnel distinct inaccessible avec les identifiants saisis |
| Pièces de test | NON EXÉCUTÉ | Ajouter des fichiers explicitement TEST depuis le compte candidat, puis soumettre par le parcours normal |
| Réservation Paris et New York | NON EXÉCUTÉ | Aucun prestataire approuvé et aucune réservation dans la base lors du dernier contrôle |
| Confirmation, notifications internes, annulation, libération | NON EXÉCUTÉ | Exécuter avec comptes fictifs distincts et vérifier UI, historique et base |
| Concurrence / double réservation | PARTIEL | Contrainte d'exclusion SQL présente ; concurrence réelle non testée |
| Espaces Client / Professionnel / Salon / Collaborateur | NON VALIDÉ | Réaliser les quatre parcours avec comptes distincts, y compris refus d'accès croisés |
| Déploiement du correctif en Preview isolée | NON EXÉCUTÉ | Vérifier branche, URL Supabase test et absence de fournisseurs réels avant la recette UI |
| Indicateurs financiers globaux | À CORRIGER | Les anciens agrégats overview et social ne portent pas de devise ; ne pas les considérer comme des indicateurs internationaux fiables |
| Autres écrans internationaux | À AUDITER | Des formats XOF/Dakar subsistent notamment dans workspace-module, refund-review et l'historique des candidatures |

## Conditions du GO

Le GO exige les parcours ci-dessus exécutés et documentés sur la Preview reliée à la base test, la correction des agrégats multidevises et des anomalies reproductibles, puis une décision de déploiement production séparée. Un build réussi ne suffit pas.

Le compte candidat n'a pas été approuvé par SQL. Les vérifications de documents et d'accès n'ont pas été désactivées pour obtenir artificiellement un résultat positif. Les mots de passe et facteurs MFA restent sous le contrôle de l'utilisateur.
