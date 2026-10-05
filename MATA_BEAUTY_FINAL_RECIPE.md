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
