# MATA Beauty — recette finale en cours

## Complément FINAL-010 — catalogue antérieur à une publication

- Écran : feed, bouton Réserver.
- Reproduction réelle : garder la page ouverte, publier la vidéo d'un nouveau professionnel, revenir dans Inspiration puis Réserver.
- Observé sur 2d705be : prestation annoncée indisponible ; un refresh complet permet la réservation.
- Attendu : charger la prestation nouvellement publiée sans imposer de refresh.
- Cause : bookSocialService dépendait uniquement du catalogue initial en mémoire, malgré un feed actualisé.
- Fichiers : app/mata-beauty-app.tsx ; tests/e2e/booking-audit.spec.ts.
- Correction e7821ef : résolution ciblée du professionnel et de la prestation exacte absents du catalogue ; erreur réseau explicite ; abandon des réponses obsolètes.
- Tests : régression simulée desktop et mobile 390 px 2/2 PASS ; lint, typecheck, 66 tests unitaires et build PASS.
- Preview : 3/3 PASS (MP4, photo/avant-après, interactions/réservation), après correction de la sélection de tests qui omettait la préparation photo. Aucun code produit modifié pour cet échec de préparation.
- Production / mata-beauty.com : 3/3 PASS (MP4 publié, photo/avant-après publiés, interactions → lecture/pause/son/scroll → réservation → compte client/pro et base). Démarrage vidéo mesuré à 1 102 ms. Console/API surveillées par la suite, sans erreur finale relevée. Données temporaires nettoyées.
- Version : e7821ef déployé, 15 assets JavaScript identiques entre domaine et URL immuable ; backend production présent, QA absent ; métadonnée Vercel du commit, alias et READY lus après déploiement. Preuves : work/final-audit/production-version-e7821ef.json, work/final-audit/production-e7821ef, work/final-audit/preview-e7821ef-complete.
- Google : session toujours active sur /app/profile après ce déploiement ; le parcours complet Google avec création/annulation a été réalisé juste avant sur 2d705be. Aucun nouveau consentement Google n'a été sollicité.

5 octobre 2026. Domaine confirmé à nouveau : **https://mata-beauty.com/**. Les mentions de matasbeauty.com dans les consignes jointes sont remplacées par cette confirmation explicite.

## Portée et état

**AUDIT EXHAUSTIF NON TERMINÉ ; CORRECTIFS DÉPLOYÉS ET PARCOURS CRITIQUES RETESTÉS.** Production actuelle : commit `e7821ef60b2c1088e89399a9d5d5bab298695893`, déploiement `dpl_2Wvq3CmXb6CbGbRM8M3iusHdJMUV`, domaine **https://mata-beauty.com/**. Les 15 fichiers JavaScript servis par le domaine sont identiques à ceux du déploiement immuable `https://mata-beauty-prvlx9fjk-africrm.vercel.app/`. Backend production confirmé, backend QA absent du document servi. Le lecteur vidéo et son mécanisme de lecture n'ont pas été réécrits. Les résultats étendus ci-dessous ont été obtenus sur 2d705be ; le complément FINAL-010 précise les retests sur e7821ef.

Recette étendue 2d705be — Preview : 14/14 PASS. Production : 13 PASS et un échec de préparation de données de messagerie (réservation sans disponibilité, correctement refusée). Après déclaration du créneau de test, messagerie isolée 1/1 PASS. Ne pas présenter cela comme une unique exécution de 14/14 PASS. Comptes temporaires vérifiés après nettoyage de ce passage : zéro restant en production et en QA.

Google réel après déploiement : déconnexion, route protégée refusée, bouton Google, retour sur le domaine officiel, session active et conservée après actualisation. Consentement Google déjà accordé, sans nouvelle saisie de mot de passe. Un seul compte correspondant, relié à Google, vérifié en base. Le parcours Google → vidéo → réservation fictive → confirmation → historique → annulation a ensuite réussi dans cette session. La base confirme le service, la vidéo source et le statut cancelled_by_client. Fixture et notifications supprimées, zéro restant vérifié. Première inscription Google et refus de consentement restent NOT TESTED.

Retour utilisateur téléphone : le panneau s’ouvre, mais aucun résultat. Vérification production : aucune publication liée à un établissement géolocalisé ; feed public vide après nettoyage QA. Ceci explique l’absence de résultats sans prouver l’obtention des coordonnées GPS. GPS réel accepté reste NOT TESTED. Le navigateur de ce poste retourne une position indisponible. L'inventaire public courant contient 86 contrôles : 28 PASS et 58 NOT TESTED dans cette matrice ; les parcours connectés sont consignés séparément. Réseau dégradé exhaustif, concurrence de réservations, mémoire prolongée, tous les boutons de tous les rôles et livraison complète des e-mails ne sont pas certifiés.

| Zone | Action testée | Résultat attendu | Résultat observé après déploiement | Statut | Correction |
|---|---|---|---|---|---|
| Feed vidéo | Publication puis lecture | Média réel lisible | MP4 publié, vidéo en lecture ; démarrage mesuré à 2 027 ms sur production | PASS automatisé réel | Moteur de lecture conservé |
| Feed vidéo | Scroll, pagination, retour WebKit | Une vidéo active, suite chargée, retour sans erreur | Parcours distant réussi, contrôle console/API réussi | PASS automatisé réel | Curseur initial requis ; annulation avant navigation |
| Desktop | Molette dans les marges | Le feed défile | Vérifié réellement sur Preview et géométrie responsive retestée en production | PASS Preview ; production responsive PASS | Zone défilante pleine largeur |
| Connexion | Sept tailles | Carte centrée, bouton Google contenu | Champs et boutons accessibles | PASS automatisé réel | Grille et contraste |
| Réservation | Vidéo → créneau → confirmation | Bon prestataire/service/prix, création persistée | Réservation réelle confirmée en UI et vérifiée en base, visible dans le parcours compte/pro | PASS automatisé réel | Gestion d'erreur de disponibilités antérieure conservée |
| Messagerie | Message, réponse, statut Lu | Échange client/pro | Échange et notification vérifiés | PASS automatisé réel après réparation de fixture | Repères du test actualisés, contraste notifications |
| Compte | Identité, préférences, support, confidentialité | Changements persistés | Valeurs vérifiées en base | PASS automatisé réel | Pas de réécriture du module |
| Google | Logout → route protégée → Google → refresh | Session retrouvée sur domaine officiel | Compte existant actif, pas de doublon | PASS navigateur réel | Configuration OAuth précédente conservée |
| Proximité manuelle | GPS indisponible → Dakar → Explorer → refresh | Alternative utilisable, zone conservée | Message explicite, champ et bouton accessibles, Dakar conservé après actualisation sur /discover | PASS navigateur réel en production | Panneau à hauteur automatique et zone conservée dans l'onglet |
| Proximité | GPS réel accepté et distances | Position réelle et classement exact | Téléphone : panneau ouvert, aucun résultat ; aucune publication géolocalisée en base. Position indisponible sur ce poste | NOT TESTED pour GPS accepté | GPS, alternative manuelle et distances implémentés ; preuves simulées séparées |
| Production | Version de mata-beauty.com | Dernier build attendu | HTTPS 200, commit et 15 assets identiques ; www redirige vers domaine canonique | PASS réel | Déploiement production 2d705be |

Les sections suivantes conservent l'historique de diagnostic, y compris les échecs et états avant déploiement.

Le premier inventaire public réel recense **117 couples écran/contrôle**, dont **9 PASS** et **108 NOT TESTED** dans cette matrice. Ce n'est pas le total de l'application entière. Aucun échec console/réseau n'a été relevé dans ce passage anonyme réussi. Voir `MATA_BEAUTY_FINAL_INTERACTION_MATRIX.md`. Les anciens parcours vidéo/professionnel/réservation restent consignés séparément dans `MATA_BEAUTY_PRODUCTION_QA.md` ; leurs résultats ne sont pas additionnés artificiellement à ce nouvel inventaire.

## Historique des anomalies avant déploiement

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

### Preview e91afa9 et pagination — FINAL-007

URL : https://mata-beauty-7y1rfk0nw-africrm.vercel.app/ (`dpl_J4Prv5purd58ksJ12w51WK4ZTHTz`). Contraste auth vérifié visuellement dans le navigateur : liens et surtitre lisibles.

Suite distante : **8 PASS, 1 FAIL, 3 non exécutés**. Publication MP4/photo, RLS, renouvellement des médias, interactions/réservation et modération passent. La pagination échoue : huit cartes restent affichées après scroll. La série étant séquentielle, le retest WebKit n'a pas été exécuté ; il ne peut pas être déclaré PASS.

Trace réseau : plusieurs requêtes `social_feed` sans curseur après retour au feed. Le cache permet de scroller avant que la requête initiale ait installé son curseur ; `loadMore` relance alors la première page. Correction locale : interdire la pagination tant que la première page fraîche n'est pas prête. Test dédié avec cache navigateur et première réponse ralentie de 1,5 s : **2/2 PASS**, desktop 1366 px et mobile 390 px, exactement une première page puis une page avec curseur, neuf publications distinctes. API simulée ; retest distant requis.

### Profil, messagerie et contraste — FINAL-008

Profil client réel sur Preview : **PASS**, identité/préférences/confidentialité/support vérifiés en base et fixtures nettoyées. Le test de messagerie nécessitait de remplacer un ancien texte de diagnostic supprimé, l'entrée de connexion professionnelle et un repère de notification trop strict. La notification est présente dans la capture réelle, mais son texte est trop sombre sur le fond de l'espace compte. Correction CSS locale du titre, du corps et du badge ; retest visuel déployé requis. Les échanges de ce test séparé restent NON VALIDÉS jusqu'à sa fin (le parcours messagerie inclus dans la réservation vidéo a déjà passé).

### Dernière Preview 7160465 — résultats complémentaires

URL : https://mata-beauty-gz0jzk6a5-africrm.vercel.app/ (`dpl_3XrJPL9fNjXhSZnkawtdhy2L7kEd`).

- Messagerie isolée : **1/1 PASS** après correction du test d'URL qui exigeait à tort `/pro/` au lieu de reconnaître `/pro`. Connexions distinctes, notification, message client, réponse professionnelle, réception et statut Lu testés réellement. Aucune modification du transport de messagerie.
- Navigateur réel desktop : scroll depuis la marge latérale, `scrollTop` passe de 0 à 814 ; une seule vidéo en lecture, deux sources vidéo affectées aux lecteurs. Pas une mesure de fuite mémoire.
- Suite groupée : **6 PASS, 2 FAIL, 5 non exécutés**. Le premier échec de messagerie a été retesté PASS isolément. Le second concerne un démarrage vidéo ne progressant pas dans les cinq secondes du test ; requêtes média HTTP 206, aucune erreur native du lecteur, test Range indépendant 206 en 575 ms. Cela ne prouve pas un blocage infini ; la lenteur reste une réserve. Le prochain test observe jusqu'à 15 secondes et journalise la latence réelle, sans déclarer la performance bonne sur cette seule base.
- WebKit est retesté séparément à partir de la vidéo réellement publiée par le premier test, afin qu'un échec d'un autre parcours ne masque plus son résultat.
- Les comptes temporaires des tests précédents ont été contrôlés en base : zéro restant avant le nouveau passage.

### Panneau de localisation tronqué — FINAL-009

Reproduction dans le navigateur réel : ouvrir Près de moi sur desktop. Le panneau est presque entièrement tronqué, malgré des contrôles présents dans le DOM. Cause : hauteur fixe de 108 px de la grille d'en-tête ; la ligne contenant le panneau avec overflow se contracte. Correction : hauteur automatique de l'en-tête quand le panneau est ouvert, hauteur maximale limitée à la fenêtre et défilement interne disponible. Test renforcé : champ, bouton Voir les résultats et filtres simultanément dans la zone visible, puis changement de zone et conservation dans Explorer. **7/7 PASS locaux** sur les tailles demandées, GPS/API simulés. Retest visuel en Preview encore requis.

Retest FINAL-006 sur Preview 7160465 : **2/2 PASS** (publication réelle puis WebKit iPhone 390 px). Lecture, retour vers le compte et avance vers le feed réussis ; aucune erreur `record_video_view`, aucune erreur API dans ce passage. L'injection Vercel Live reste refusée par la CSP et est distinguée depuis l'origine des erreurs applicatives. Le correctif `beforeunload` est validé sur ce passage ; production non modifiée.

## Recette regroupée du commit 2d705be

Preview : https://mata-beauty-1gu7rehti-africrm.vercel.app/ — `dpl_78q8ASBgvZcoQnuL4y8urXVud8Nn`.

**14/14 PASS en 7,2 minutes**, application et API QA réelles : profil client, échanges avec statut Lu, navigation publique, auth sur sept tailles, publication MP4/photo/avant-après, RLS, renouvellement des liens signés, interactions vidéo et réservation persistée, modération, pagination, parcours responsive, WebKit et navigation professionnelle mobile. Latence mesurée de démarrage vidéo : **468 ms** sur ce passage ; l'échec antérieur au seuil de cinq secondes reste conservé comme réserve de performance intermittente.

Contrôles locaux obligatoires avant commit : lint, TypeScript, 66 tests unitaires et build PASS. Le document utilisateur non suivi `docs/PRODUCTION_READINESS_2026-08-16.md` reste exclu des commits.

Vérifications visuelles réelles complémentaires : panneau de localisation intégralement visible, saisie Dakar puis bouton Voir les résultats utilisables ; notifications lisibles dans leur espace sombre (capture : `work/final-audit/notifications-preview.jpg`). GPS réel accepté toujours NON VALIDÉ ; indisponibilité avec alternative manuelle validée.

Contrôles domaine avant déploiement : `mata-beauty.com` résout vers Vercel et répond HTTPS 200 ; `www.mata-beauty.com` aboutit à `https://mata-beauty.com/`. Aucun changement DNS effectué.

Déploiement de production du même commit lancé après ces résultats. Vérification du build servi et recette sur le domaine officiel EN ATTENTE ; ne pas confondre les 14 PASS de Preview avec des PASS de production.

## Clôture de ce lot de déploiement

Production READY : https://mata-beauty-h6p3o4ng2-africrm.vercel.app/, alias https://mata-beauty.com/, commit `2d705bec76b731b842ab4f5bae842a709454d862`. Comparaison des assets et environnement enregistrée dans `work/final-audit/production-version.json`. La première comparaison sans bypass portait sur la page de connexion Vercel du déploiement immuable ; la comparaison corrigée utilise son accès autorisé et laisse le domaine public sans bypass. Résultat : **15/15 assets identiques**, HTTP 200, environnement production confirmé.

Suite de production : **13 PASS, 1 échec de préparation de fixture** en 6,2 minutes. La protection de créneau a rejeté la réservation du test de messagerie, dont le prestataire n'avait pas d'horaire déclaré. La fixture crée désormais cet horaire ; retest isolé directement sur mata-beauty.com : **1/1 PASS**. Aucun assouplissement de disponibilité ni migration de production pour faire passer ce test.

Les dix tests sociaux passent sur le domaine officiel, y compris publication, réservation, pagination, responsive, WebKit et navigation professionnelle. Les contrôles de console/API applicatifs de cette suite passent. Les tests de profil, messagerie et inventaire public ne constituent pas une preuve exhaustive de tous les rôles ni de tous les cas limites.

Google réel et localisation manuelle ont également été utilisés dans le navigateur utilisateur après déploiement (voir synthèse en tête). Retour téléphone reçu : panneau ouvert, aucun résultat. Aucune publication géolocalisée disponible en production pour comparer des distances réelles. Aucun mot de passe fourni dans la conversation n'a été utilisé pour ce passage Google.

Après nettoyage, requête en base production : **zéro compte temporaire de recette restant**. La session réelle de l'utilisateur est conservée. Le parcours supplémentaire Google a créé puis annulé une réservation fictive, vérifiée dans l'historique et en base ; fixture, réservation et notifications ont ensuite été nettoyées. Les rapports restent marqués audit incomplet tant que les contrôles listés comme NOT TESTED n'ont pas été réalisés.
