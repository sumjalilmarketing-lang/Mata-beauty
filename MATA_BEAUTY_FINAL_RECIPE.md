# MATA Beauty — recette finale en cours

5 octobre 2026. Domaine confirmé à nouveau : **https://mata-beauty.com/**. Les mentions de matasbeauty.com dans les consignes jointes sont remplacées par cette confirmation explicite.

## Portée et état

**NON TERMINÉ.** Ce rapport distingue tests réels de production, automatisation du navigateur et données/position simulées. Les corrections de ce lot sont locales tant qu'un déploiement et son retest ne sont pas mentionnés ci-dessous. Le lecteur vidéo et son mécanisme de lecture n'ont pas été réécrits.

Le premier inventaire public réel recense **117 couples écran/contrôle**, dont **9 PASS** et **108 NOT TESTED** dans cette matrice. Ce n'est pas le total de l'application entière. Aucun échec console/réseau n'a été relevé dans ce passage anonyme réussi. Voir `MATA_BEAUTY_FINAL_INTERACTION_MATRIX.md`. Les anciens parcours vidéo/professionnel/réservation restent consignés séparément dans `MATA_BEAUTY_PRODUCTION_QA.md` ; leurs résultats ne sont pas additionnés artificiellement à ce nouvel inventaire.

## Anomalies reproduites et corrections

| ID | Page | Cause observée | Correction locale | Vérification | Production vérifiée |
|---|---|---|---|---|---|
| FINAL-001 | Inspiration desktop | La zone défilante reste limitée à 500 px ; une molette dans la marge latérale ne change pas scrollTop (0 après 5 s), alors qu'elle fonctionne sur le contenu | Zone de scroll sur toute la largeur desktop, cartes centrées de même largeur, scrollbar native accessible | Échec avant correction ; molette aller/retour sur contenu et marges, puis redimensionnement PASS | NON |
| FINAL-002 | Connexion desktop | Bouton Google largeur 100 % + marge gauche 43 %, dépassant la carte de 201,5 px ; overflow hidden coupe le contenu | Grille avec colonne de formulaire bornée, retrait de la marge, scroll interne disponible, bouton Fermer absolu ; mobile conservé en une colonne | Échec avant correction ; carte centrée et champs/boutons accessibles sur sept tailles PASS avant intégration localisation | NON |
| FINAL-003 | Explorer | Changement d'écran uniquement en état React, URL inchangée ; actualiser renvoie à Inspiration | Historique et URL reflètent Explorer/recherche ; restauration sur refresh et popstate | Échec avant correction ; refresh puis retour navigateur PASS | NON |
| FINAL-004 | Près de moi | Filtre Dakar codé par défaut, sans position réelle | Demande GPS au clic, délai borné, refus avec saisie manuelle, suggestions issues des établissements, rayon 25 km sur coordonnées commerciales disponibles, zone commune avec Explorer | GPS accepté et refusé testés avec données simulées ; aucun PASS de géolocalisation réelle déclaré | NON |
| FINAL-005 | Recherche | Recherche de toute la phrase comme une sous-chaîne ; « Tresses à Dakar » ne correspond pas à « Dakar · Tresses collées » | Normalisation accents/casse et recherche par mots pertinents | Tests unitaires PASS | NON |

Fichiers : `app/globals.css`, `app/mata-beauty-app.tsx`, `app/social-feed.tsx`, `app/location-picker.tsx`, `lib/domain/location.ts`, `lib/domain/social-feed.ts`, `lib/supabase/catalog.ts`, tests associés.

## Localisation et confidentialité

- Les coordonnées proviennent des adresses commerciales `businesses` déjà rattachées aux prestations. Aucune position personnelle du prestataire n'est ajoutée à l'affichage public.
- La position GPS du client reste en mémoire ; elle n'est ni envoyée au backend ni persistée. Seule la zone saisie manuellement est conservée dans sessionStorage pour cet onglet.
- Un établissement sans coordonnées n'obtient aucune distance inventée et reste recherchable par zone manuelle. Sans adresse commerciale rattachée, le récapitulatif indique que l'adresse doit être confirmée.
- Le modèle de professionnels mobiles/domicile existant est conservé ; aucune nouvelle offre de déplacement n'est créée.
- La relation API des adresses commerciales a été interrogée réellement avec le rôle anonyme en production : requête réussie, zéro professionnel public retourné lors du contrôle. Cela valide l'accès technique, pas la qualité des coordonnées ni un résultat GPS réel.
- La limite fixe des 24 professionnels du catalogue est remplacée par une pagination ; le filtre de proximité du feed charge les pages suivantes pour ne pas conclure à tort à zéro résultat sur le seul premier lot.

## Contrôles encore ouverts

Géolocalisation réelle dans le navigateur de l'utilisateur, précision/timeout/indisponibilité, distances réelles, cohérence adresse jusqu'à une réservation réelle, inventaire connecté complet et clic de chaque contrôle, parcours Google après prochain déploiement, réinitialisation puis connexion explicitement confirmées, WebKit intermittent, réseau lent/coupé, mémoire et lecteurs, concurrence/double réservation, tests métier professionnels restants. Tous ces éléments restent NOT TESTED ou sous réserve selon le rapport précédent.

Les tests initiaux ont identifié un cache CSS local Turbopack servant encore les anciennes règles. Le cache de développement a été déplacé dans `work/dev-cache-before-final-audit`, sans suppression ; les mêmes tests passent après compilation fraîche. Le code des contrôles n'a pas été affaibli.

## Derniers contrôles locaux

- `desktop-final-audit.spec.ts` : **31 PASS, 4 non applicables** (molette desktop sur mobile/tablette), sept tailles demandées. Catalogue et GPS simulés, vrais clics et événements de molette dans Chromium.
- `public-flows.spec.ts` : **22 PASS** sur 390 px et 1366 px. Données/API simulées, parcours UI réels ; ne vaut pas consentement Google réel.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (66 tests) et `pnpm build` : PASS au dernier contrôle, répétition après les derniers ajustements avant commit.
- L'inventaire public de production passe avec zéro erreur réseau/JavaScript capturée ; il ne soumet aucune création de compte ni réinitialisation.

## Recette de la Preview du commit 7837cf8

Preview : https://mata-beauty-1d0ftxdtg-africrm.vercel.app/ — déploiement `dpl_ACaJzLYnWtpfqXmXpjfrgZDpJi7A`. Base QA distincte de la production. Le domaine final reste **https://mata-beauty.com/**, reconfirmé par l'utilisateur.

- TEST AUTOMATISÉ sur application/API réelles : navigation publique étendue aux catégories et documents légaux, puis auth sur sept tailles : **2/2 PASS**. Le premier passage échouait sur l'accès du service worker à la Preview protégée ; ajout du cookie de bypass dans le test, puis réussite. Aucun changement du service worker de l'application pour masquer cette erreur.
- Nouvelle collecte publique avec occurrence séparée pour chaque bouton homonyme : PASS, zéro erreur JavaScript/HTTP capturée. Matrice Preview annexée séparément, sans remplacer les preuves du domaine de production.
- TEST RÉEL dans le navigateur : localisation indisponible, puis saisie manuelle Dakar et affichage de la zone choisie sans blocage. Cela ne valide ni l'autorisation GPS réussie ni les distances réelles.
- Suite distante initiale : **10 PASS, 2 FAIL** sur douze tests. Un échec provient du cookie de Preview et a été retesté PASS ci-dessus. L'autre est le contrôle global de console : WebKit signale `record_video_view` avec « access control checks ». Les assertions de lecture et de navigation passent, mais la recette WebKit reste FAIL tant que cette erreur n'est pas expliquée/corrigée.
- Un essai de diagnostic réduit a omis la fixture photo nécessaire : un test de publication PASS, un test d'interactions FAIL sur photo absente, WebKit non exécuté. Ce résultat est un problème de sélection des tests, pas une nouvelle régression produit. Relance avec les dépendances photo et vidéo incluses.
- Inspection visuelle réelle : les liens Créer un compte/Mot de passe oublié et le surtitre manquent de contraste dans le thème sombre. Correction CSS locale en couleur claire ; vérification de non-régression du formulaire sur 390 et 1366 px : **2/2 PASS**. Cette dernière correction n'est pas encore déployée.

La production n'a pas été remplacée par cette Preview. La validation finale reste **NON TERMINÉE**.

### Diagnostic WebKit — FINAL-006

- Écran : feed, retour navigateur vers le compte après lecture.
- Reproduction réelle automatisée sur Preview : publication MP4, photo, interactions et réservation PASS ; WebKit échoue au contrôle console, malgré des assertions de lecture/retour/avance réussies.
- Trace : `work/final-audit/webkit-trace/social-feed-remote-ui-le-f-0c55f-nne-en-WebKit-iPhone-390-px/trace.zip` (privée, hors Git).
- Chronologie monotone : `goBack` à 181809,524 ms ; erreur native fetch à 183134,720 ms ; `pagehide` à 183476,700 ms. Une requête de vues antérieure reçoit HTTP 204. Aucun rejet de promesse non géré n'est capturé.
- Cause probable étayée : une nouvelle requête analytics est initiée pendant la navigation, avant que l'annulation sur `pagehide` ne se produise. Ce résultat ne démontre pas une mauvaise configuration CORS du serveur.
- Correction ciblée dans `app/social-feed.tsx` : annuler aussi le contrôleur sur `beforeunload`, sans modifier le lecteur, sans supprimer l'erreur du collecteur de tests et sans affaiblir CORS.
- Retest du correctif : EN ATTENTE de nouvelle Preview. Production et domaine officiel : NON DÉPLOYÉ.
- Le diagnostic précédent avait essayé de démarrer une trace déjà activée par Playwright ; cette erreur de configuration du test a été retirée. La trace utilisée ci-dessus vient ensuite du passage réellement exécuté.
