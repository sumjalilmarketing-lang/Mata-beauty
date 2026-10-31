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

Validation locale : `pnpm lint`, `pnpm typecheck`, `pnpm test` (207 tests, 42 fichiers), `pnpm build` : PASS. Installation avec lockfile figé. Aucun secret committé.

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
| Indicateurs financiers globaux | CORRIGÉS EN TEST | Migration currency_aware_admin_aggregates appliquée exclusivement au test ; UI adaptée ; validation des données financières avec plusieurs devises et session habilitée encore à effectuer |
| Autres écrans internationaux | À AUDITER | Les devises de workspace-module et refund-review sont corrigées ; les dates de l'historique des candidatures restent à adapter |

## Conditions du GO

Le GO exige les parcours ci-dessus exécutés et documentés sur la Preview reliée à la base test, la correction des agrégats multidevises et des anomalies reproductibles, puis une décision de déploiement production séparée. Un build réussi ne suffit pas.

Le compte candidat n'a pas été approuvé par SQL. Les vérifications de documents et d'accès n'ont pas été désactivées pour obtenir artificiellement un résultat positif. Les mots de passe et facteurs MFA restent sous le contrôle de l'utilisateur.

## Audit complémentaire et autorisation de déploiement

L’utilisateur autorise désormais le déploiement sur mata-beauty.com sous condition de ne pas compromettre l’application. Le déploiement n’a pas été exécuté : les cinq migrations internationales sont absentes de Production et la recette de bout en bout demeure bloquée par les identifiants du candidat fictif.

La dernière production Vercel listée est READY, commit e4919bb2af48e35e646ba06b91bd08578fedd8cd. La branche internationale 6050566 est directement en avance d’un commit, sans retard sur cette version. Le site public mata-beauty.com a été ouvert et répond. Aucune modification des données de Production n’a été effectuée.

Contrôle supplémentaire test : aucune table ordinaire publique sans RLS et aucune vue publique sans security_invoker dans l’inventaire SQL. Les avis de sécurité fournisseurs restent à examiner individuellement, notamment les fonctions SECURITY DEFINER ; l’absence de RLS désactivée n’est pas une certification des autorisations.

Correctifs supplémentaires : devise source dans les espaces de gestion (prestations, paiements, soldes, commissions, versements), devise des remboursements depuis leur paiement lié, indication explicite quand devise ou montant absent, sans remplacement silencieux par XOF ou zéro. Tests 206/206, lint, TypeScript et build réussis. Aucun nouveau hook, aucune modification d’autorisation, aucune migration de schéma dans ces correctifs.

## Audit approfondi — agrégats et autorisations

Migration versionnée 20261031014139_currency_aware_admin_aggregates.sql : les RPC de pilotage exposent financial_by_currency (CA hors paiements test/mock, commissions et panier moyen) et gross_by_currency (attribution sociale). Tri stable par devise ; aucun taux de change implicite. Les anciennes valeurs scalaires deviennent XOF-only pour préserver les anciens écrans. Les contrôles d’habilitation, search_path vide et propriétaires des fonctions sont conservés.

Migration appliquée au projet test seulement. Vérification SQL : anon n’a pas EXECUTE sur les deux RPC ; authenticated sans identité reçoit null pour le pilotage et un objet vide pour le social. Ceci vérifie les refus et la compilation SQL, pas un parcours financier habilité avec données multidevises. L’interface signale explicitement une migration absente et distingue accès restreint et registre vide.

Validation locale : 207 tests, lint et build (incluant TypeScript) PASS. Les tests des fuseaux couvrent déjà les heures inexistantes et répétées à Paris/New York, le changement d’heure et les décalages UTC de Dakar, Paris, Bruxelles, Madrid et New York. Ce sont des tests de logique, pas une preuve de réservation distante concurrente.

Avis fournisseurs test après migration : 7 INFO RLS sans politique, 1 WARN extension publique, 16 WARN fonctions SECURITY DEFINER exécutables par anon, 112 par authenticated, 1 protection mots de passe compromis désactivée. Ces avertissements ne prouvent pas autant de vulnérabilités : les fonctions publiques incluent disponibilités, maintenance et événements sociaux. Leur revue exhaustive et les tests croisés de rôles restent requis. Ne pas supprimer globalement ces autorisations au risque de casser les parcours publics.

Revue des gardes des espaces : pro/salon exigent statut approuvé ; staff exige des permissions de collaborateur ; les espaces internes utilisent get_admin_context et les rôles autorisés. La revue de code ne remplace pas les quatre sessions fictives distinctes. NO-GO production maintenu. Six migrations internationales/correctives sont maintenant à coordonner avant le déploiement du code, après recette et sauvegarde/retour arrière vérifiés.


## Reprise ciblée internationale — 31 octobre, correctif DST

Défaut reproduit sur la base isolée : à Paris le 28 mars 2027, une prestation de 60 minutes à 01:30 était acceptée par le calcul nominal avec fermeture à 03:00 ; son terme réel est 03:30. Le même décalage existe à New York au passage à l’heure d’été. Le calcul nominal retirait aussi certains créneaux valides pendant l’heure répétée d’automne.

Migration `20261031062239_dst_safe_independent_slots.sql`, appliquée uniquement au test : la fonction privée calcule les instants réels puis compare la durée écoulée à la fermeture réelle. Elle conserve les deux occurrences des heures répétées. Aucune table, politique RLS, attribution de rôle ou donnée utilisateur modifiée. Nouvelle fonction SECURITY INVOKER, search_path vide, EXECUTE refusé à anon et authenticated.

Vérification SQL distante, reproductible avec `supabase/tests/international_dst_slots.sql` : PASS pour cinq scénarios DST (Paris/New York, printemps/automne et fermeture inexistante), deux horaires invalides, horaires normaux Dakar/Paris/New York et refus d’accès public au helper. Aucun jeu de données ni claims Auth synthétiques utilisé. Ceci valide le calcul SQL ; ce n’est pas une recette authentifiée de réservation.

Le script historique de recette ne lit plus `.env.local` et n’a plus de repli Production. Il exige exactement la base internationale isolée et son alias de branche Preview. Douze cas de régression vérifient les cibles autorisées/refusées. Ce script historique n’a pas été exécuté : ses créations de rôles privilégiés ne remplacent pas la procédure d’approbation normale avec MFA.

L’accueil, le manifeste et les métadonnées ne présentent plus toutes les offres comme exclusivement sénégalaises. La langue publiée reste le français ; cette correction ne constitue pas une traduction complète anglaise ou espagnole.

Validation locale : 222 tests dans 43 fichiers, TypeScript, lint (zéro erreur, huit avertissements existants) et build PASS. Dernier inventaire distant : zéro professionnel approuvé, zéro dossier pending_review, zéro réservation, un facteur MFA vérifié. Le blocage des sessions professionnelles et la soumission normale du dossier doivent encore être résolus avant de déclarer le GO.


## Preview corrigée disponible — résultat de la reprise

Déploiement `dpl_B8SZJoKHAweja75tXc2ZPj4VB4cA`, commit `a1b8ab3631549ede87ea346bcdc2aaaa9394a932`, target staging/Preview : READY, alias sans erreur. URL : https://mata-beauty-leicwmq5v-africrm.vercel.app ; alias stable international : https://mata-beauty-git-codex-global-test-preview-20261031-africrm.vercel.app. Build Vercel effectif environ 75 secondes. L’URL Supabase de cette branche a été revérifiée : projet isolé skrrfronlhoddtgxvezu ; service role et clé d’envoi email vides pour empêcher le repli vers les intégrations partagées.

Contrôle navigateur de la nouvelle version : titre « Réservez votre beauté près de vous », accueil « NATIONAL ET INTERNATIONAL », catalogue de catégories chargé. Le dossier /app/application exige une connexion. Les refus anonymes /pro, /salon et /staff ont également été observés sur l’alias avant bascule de cette livraison ; ils ne constituent pas les tests croisés entre comptes authentifiés. Scan error/fatal de la nouvelle Preview, fenêtre initiale 30 minutes : aucune entrée retournée ; aucune surveillance continue validée.

La nouvelle tentative de connexion du compte fictif professionnel, via le formulaire sécurisé, a renvoyé « E-mail ou mot de passe incorrect ». Vérification administrative en lecture seule : email confirmé, mot de passe configuré (existence vérifiée uniquement), compte actif, non suspendu et non banni ; dossier professionnel draft. Aucun secret lu, enregistré dans le rapport ou remplacé par SQL. La session navigateur Supabase est elle aussi déconnectée ; le connecteur conserve l’accès de gestion SQL autorisé, sans fournir l’API Admin Auth permettant une récupération officielle du mot de passe.

Point supplémentaire à traiter avant GO, identifié par revue des fonctions et politiques : l’insertion des réservations indépendantes contrôle l’identité client, le prix serveur, la date future et la concurrence, mais ne semble pas revalider l’horaire publié ni le statut approuvé du prestataire dans le trigger. Le parcours équipe dispose de can_assign. Ce point doit être reproduit avec une vraie session fictive et corrigé avec vérification des cas autorisés/refusés ; aucun contournement d’accès n’a été exécuté pour cette investigation.

Décision maintenue : NO-GO international. Corrections et Preview livrées, mais l’approbation normale, les réservations Paris/New York, les notifications internes, l’annulation/libération, la concurrence effective et les quatre espaces authentifiés ne sont pas encore certifiés. Les paiements EUR/USD en ligne ne sont pas pris en charge ; la réservation internationale est prévue avec règlement sur place. La couverture des langues reste partielle. Aucune migration internationale ni donnée de recette appliquée à Production pendant cette reprise.
