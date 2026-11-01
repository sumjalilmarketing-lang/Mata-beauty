# MATA Beauty — images et carrousels des catégories

## Périmètre et état de livraison

Domaine vérifié : https://mata-beauty.com. La correction est déployée au commit **106b2dd72ea1f6fa2a116cdbfa6d8c4125174d55**. Ce rapport concerne la correction visuelle demandée et ses non-régressions. Il ne remplace pas le rapport des blocages de lancement.

## Inventaire réel et anomalie initiale

Les 11 catégories actives ont été lues dans la base de production. Leurs champs image_url et image_position sont vides. L'ancien affichage découpait une planche de dix images selon l'index de la catégorie : l'ajout de catégories décalait la correspondance. La source était public/images/categories/mata-category-atlas.webp, sans provenance documentaire retrouvée. Elle reste utilisée par les métadonnées sociales, mais plus par ces cartes.

Les sous-catégories visibles sont les titres des prestations publiées, pas une nouvelle taxonomie. Aucun service publié par un professionnel approuvé n'était disponible lors de l'inventaire initial ; il ne faut donc pas présenter les nouvelles illustrations comme des réalisations de professionnels inscrits. Massage et Spa, cités à titre d'exemple dans la demande, ne sont pas des catégories actives : aucune catégorie artificielle n'a été ajoutée.

| Catégorie / slug | Image initiale | Initial | Prestation de référence en base | Nouveaux sujets, images 1 et 2 | Contrôle visuel local |
|---|---|---|---|---|---|
| Coiffure femme / coiffure-femme | Coiffure tressée | PASS | Coiffure signature | Coiffage naturel ; brushing | PASS |
| Tresses africaines / tresses-africaines | Tresses collées | PASS | Tresses africaines | Knotless ; tresses collées en réalisation | PASS |
| Coiffure homme / coiffure-homme | Perruque femme | FAIL | Coiffure homme | Dégradé tondeuse ; coupe aux ciseaux | PASS |
| Locks / locks | Maquillage | FAIL | Entretien de locks | Locks attachées ; entretien des racines | PASS |
| Perruques et lace wigs / perruques-lace-wigs | Ongles | FAIL | Pose de perruque | Pose de lace wig ; ajustement de perruque | PASS |
| Maquillage / maquillage | Extensions de cils | FAIL | Maquillage événement | Pinceau et palette ; maquillage des yeux | PASS |
| Onglerie / onglerie | Masque visage | FAIL | Manucure complète | Pose de vernis ; nail art | PASS |
| Cils et sourcils / cils-sourcils | Barbier | FAIL | Mise en beauté du regard | Extensions de cils ; sourcils | PASS |
| Barbier / barbier | Épilation jambe | FAIL | Coupe et barbe | Taille de barbe ; contours | PASS |
| Soins du visage / soins-visage | Massage | FAIL | Soin du visage | Masque ; serviettes chaudes | PASS |
| Beauté à domicile / beaute-domicile | Extensions de cils | FAIL | Prestation beauté à domicile | Maquillage dans un salon domestique ; manucure à domicile | PASS |

Chaque paire est enregistrée sous public/images/categories/{slug}-1.webp et {slug}-2.webp. Les 22 fichiers sont en WebP 640 × 640, total 781 994 octets (environ 764 Kio), chacun entre 24 et 49 Ko. Les images ont été générées pour MATA Beauty avec l'outil intégré, puis inspectées individuellement sur des planches de contrôle. Aucune photographie de portfolio n'a été copiée. La provenance, les noms des sources et les descriptions de génération figurent dans CATEGORY_IMAGE_PROVENANCE_2026-10-06.json ; ce fichier ne constitue pas un audit juridique indépendant des droits.

## Comportement et cohérence

- Association explicite par slug, sans calcul de position dans une planche. Les alias QA « Tresses » et « Make-up » rejoignent les mêmes catégories.
- Priorité à la couverture de la prestation exacte, puis à une publication publique du même professionnel explicitement liée à cette prestation, puis à l'illustration de sa catégorie. Le portrait ou la couverture générale du salon ne représente plus arbitrairement une prestation.
- Les références professionnel/prestation/publication sont conservées avec le média. Les objets Storage existants sont lus via leur URL signée, sans duplication ; une image manquante revient à la bonne catégorie.
- Les listes Explorer, recherche, proximité et recommandations partagent le même catalogue. Les écrans profil et réservation emploient le même composant d'image de prestation. Les favoris et certaines listes de services sont textuels : pas d'image supplémentaire inventée.
- Une horloge commune échelonne les transitions. Chaque carte attend au moins huit secondes ; seules les cartes visibles et hors interaction participent. Pause globale, arrêt lorsque l'onglet est masqué, respect de prefers-reduced-motion, flèches clavier et swipe manuel.
- La prochaine image utile est chargée avant le fondu. En cas d'échec ou après dix secondes sans chargement, l'image actuelle reste affichée. Une carte déjà vue conserve son image chargée après un aller-retour dans la page. Dimensions fixes, images recadrées sans étirement.
- Cache des images : un jour, avec revalidation différée pendant sept jours. Les illustrations de prestation sont identifiées dans les cartes par « Illustration » et dans leur texte alternatif.

## Anomalies rencontrées pendant cette recette

| ID | Reproduction / cause | Correction | Retest |
|---|---|---|---|
| IMG-01 | L'index dans la planche attribuait une image d'une autre activité à neuf catégories. | Catalogue explicite par slug et 22 images dédiées. | PASS : inspection des deux images de chaque catégorie. |
| IMG-02 | Après transition hors écran, le nouveau nœud image en lazy loading pouvait laisser le fond visible au retour. | Mémoriser qu'une carte a déjà été vue et conserver le chargement immédiat de son image courante. | PASS : scroll aller-retour, images chargées et captures du quadrillage. |
| IMG-03 | Dans Chromium tactile émulé, le swipe fonctionnait, mais le tap suivant produisait pointerup sans clic de compatibilité. | Traiter explicitement un tap tactile sans déplacement et empêcher le clic synthétique en double ; conserver le clic souris et clavier. | PASS : vrai flux d'événements tactiles CDP, swipe puis tap vers la catégorie. Appareil physique : NOT TESTED. |

## Vérifications exécutées

| Zone | Action | Résultat attendu | Résultat observé local | Statut |
|---|---|---|---|---|
| Visuels | 11 catégories × deux images | Sujet exact | 22 images inspectées | PASS |
| Responsive | 390×844, 768×1024, 1366×768, 1440×900, 1920×1080 | Image entière dans son cadre, texte lisible, aucun débordement | Captures inspectées aux cinq tailles, hauteur inchangée | PASS |
| Navigation | Clic, retour navigateur, clic pendant le fondu | Bonne catégorie | URL et écran vérifiés | PASS |
| Accessibilité | Mouvement réduit, pause, flèches | Pas d'animation automatique imposée | Contrôles exécutés | PASS |
| Défilement | Rapide, retour, carte hors écran | Pas de carte blanche, arrêt hors écran | Sources et opacité contrôlées | PASS |
| Réseau | Retard et 404 de l'image suivante | Image précédente conservée | Image courante encore visible | PASS |
| Mobile | Swipe et tap tactiles émulés | Changer l'image puis ouvrir la catégorie | Parcours exécuté après IMG-03 | PASS |
| Mobile physique | Téléphone / trackpad réel | Gestes matériels | Aucun matériel pilotable dans cette recette | NOT TESTED |
| Médias professionnels | Publication réelle → miniature liée dans Explorer | Bon professionnel et bonne prestation | Upload réel sur QA puis production, origine professionnelle affichée, identifiants et miniature contrôlés | PASS |
| Déploiement | Preview puis mata-beauty.com | Version vérifiée et parcours rejoués | 13 scénarios Preview et 19 scénarios production PASS ; version comparée | PASS |

Les tests visuels éditoriaux isolent volontairement le catalogue professionnel (réponse vide) afin de vérifier les 22 illustrations. Ils ne prouvent pas seuls l'intégration professionnelle : celle-ci est contrôlée séparément par la publication réelle dans Studio, la lecture du catalogue et la carte Explorer. Les captures et traces sont conservées dans work/category-audit/ (dossier local ignoré par Git).

La suite vidéo locale a exécuté publication MP4, photo/avant-après, interactions et réservation. Ses assertions métier passent ; son bilan global reste FAIL car l'appel de bienvenue retourne 403 sur localhost : la configuration locale conserve l'origine officielle alors que le navigateur utilise localhost. Le contrôle d'origine n'a pas été affaibli pour faire passer ce test. La même suite a ensuite été rejouée intégralement avec succès sur Preview puis sur le domaine officiel, sans ces erreurs inattendues. Ce contrôle API ne prouve pas la réception du message par une boîte humaine.

## Preuves de livraison

- Pré-commit : pnpm lint, pnpm typecheck, pnpm test (**85 tests / 20 fichiers**) et pnpm build PASS.
- Preview : https://mata-beauty-90ivsle1z-africrm.vercel.app, déploiement dpl_4kV6EMgj6ScfZrYM5hajuQMgzcH8, même commit source ; **13 PASS** : visuels 5, publication/feed/réservation/modération 4, catalogue/salon 2, candidature/MFA 2.
- Production : https://mata-beauty-6ihufgbic-africrm.vercel.app, déploiement dpl_A44Nb4cukirEBbR2WFNbS3BozGPt. Le 6 octobre 2026 à 12:24:48 UTC, https://mata-beauty.com répond HTTP 200 et sert les **15 mêmes scripts** que ce déploiement. Backend production présent, backend QA absent. Preuve : work/final-audit/production-version-106b2dd.json.
- Après bascule sur mata-beauty.com : **19 PASS** = visuels 5 + publication/feed/réservation/modération 4 + catalogue/salon 2 + candidature/MFA 2 + localisation simulée/panne feed 6. Aucune relance automatique pour transformer un échec en succès (retries 0).
- Reprise de sécurité après cette recette : **24 contrôles API PASS** sur la base production, séparés des 19 scénarios navigateur. Refus d'auto-attribution Client/Pro et de métadonnées privilégiées, auto-approbation refusée, MFA AAL1 refusée, révocation effective sur une session déjà ouverte, protection du Super Admin face à la suspension via modération. Preuve : work/final-audit/final-role-security.json. Les champs de rôle inconnus sont aussi refusés par le type SQL ; ce refus ne remplace pas le contrôle des rôles valides. Cette passe ne qualifie pas les 87 fonctions exposées ni toute la matrice inter-rôles.
- Les réservations ont réellement été créées puis vues côté client et professionnel. Les comptes, prestations, publications, documents et réservations sont des fixtures de recette nettoyées en fin de suite. Contrôle indépendant : zéro compte récent restant pour les préfixes de cette recette.
- Les captures de production sont work/category-audit/grid-{390,768,1366,1440,1920}.png et les captures de chaque carte {largeur}-{slug}.png. Toutes ont été produites après bascule. Les cinq grilles et les détails nécessaires ont été inspectés ; une capture de grille entière peut inclure la barre de navigation fixe, tandis que les captures de carte vérifient son accessibilité après défilement.
- Aucun changement de moteur vidéo, d'authentification, de migration SQL ni de paiement dans ce commit. Le paiement reste mock. Les corrections antérieures demeurent dans l'historique et les circuits affectés ont été rejoués.

## Matrice visuelle finale sur mata-beauty.com

Les noms d'images ci-dessous sont relatifs à public/images/categories/. PASS mobile signifie navigateur avec viewport mobile et gestes tactiles émulés, pas validation d'un téléphone physique.

| Catégorie | Images | Correspondance | Mobile 390 | Tablette 768 | Desktop 1366/1440/1920 | Statut |
|---|---|---|---|---|---|---|
| Coiffure femme | coiffure-femme-1.webp / -2.webp | Coiffage / brushing | PASS | PASS | PASS | PASS |
| Tresses africaines | tresses-africaines-1.webp / -2.webp | Tresses knotless / collées | PASS | PASS | PASS | PASS |
| Coiffure homme | coiffure-homme-1.webp / -2.webp | Coupe tondeuse / ciseaux | PASS | PASS | PASS | PASS |
| Locks | locks-1.webp / -2.webp | Locks / retwist | PASS | PASS | PASS | PASS |
| Perruques et lace wigs | perruques-lace-wigs-1.webp / -2.webp | Pose / ajustement de perruque | PASS | PASS | PASS | PASS |
| Maquillage | maquillage-1.webp / -2.webp | Maquillage professionnel | PASS | PASS | PASS | PASS |
| Onglerie | onglerie-1.webp / -2.webp | Manucure / nail art | PASS | PASS | PASS | PASS |
| Cils et sourcils | cils-sourcils-1.webp / -2.webp | Extensions / sourcils | PASS | PASS | PASS | PASS |
| Barbier | barbier-1.webp / -2.webp | Taille / contours de barbe | PASS | PASS | PASS | PASS |
| Soins du visage | soins-visage-1.webp / -2.webp | Masque / soin chaud | PASS | PASS | PASS | PASS |
| Beauté à domicile | beaute-domicile-1.webp / -2.webp | Maquillage / manucure à domicile | PASS | PASS | PASS | PASS |

## Réserves de lancement conservées

La correction d'images ne lève pas les réserves du rapport MATA_BEAUTY_LAUNCH_BLOCKERS_2026-10-06.md : première inscription Google et boîte de réception humaine, contrôles matériels GPS/trackpad, qualification des RPC et droits inter-rôles encore non testés, et modules administratifs non raccordés. Aucun de ces contrôles n'est requalifié PASS par un build ou un test unitaire. La décision globale précédente reste C — NON PRÊT tant que les blocages documentés ne sont pas levés.
