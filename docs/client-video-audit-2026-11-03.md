# Audit espace client et vidéos — 3 novembre 2026

## Corrections livrées

- Préchargement de la prochaine vidéo, limité aux métadonnées lorsque le navigateur signale une économie de données ou une connexion 2G.
- Conservation du clip et de sa position au retour dans l’onglet ; restauration de la position après renouvellement du lien signé ou remontage du lecteur.
- Reprise silencieuse lorsque le navigateur refuse la lecture automatique avec son.
- Nouvelle tentative sur retour du réseau pour le lecteur actif en erreur ou en chargement ; renouvellements dédupliqués et récupération bornée existante conservée.
- Réduction des mises à jour React de progression et arrêt des lecteurs hors écran ou pendant la recherche.
- Utilisation directe des miniatures disponibles dans les grilles, sans charger un décodeur vidéo par aperçu ; repli vidéo si la miniature échoue.

## Vérifications et portée

496 tests unitaires (82 fichiers), 117 tests de parcours bureau/mobile réussis, 1 cas réservé au bureau ignoré sur mobile, 26 contrôles smoke réussis. TypeScript et compilation Next.js réussis. Lint : 0 erreur, 7 avertissements préexistants. Un ancien contrôle smoke comparant littéralement l’attribut de préchargement a été adapté au nouvel appel de fonction ; les règles de préchargement sont testées séparément.

La recette couvre notamment navigation client, profil et réglages, réservations, favoris, assistance, restrictions de rôles, lecture unique, masquage/réaffichage de l’onglet et renouvellement des médias. Les tests utilisent des comptes et médias synthétiques ; ils ne constituent pas un essai de débit ni une certification matérielle sur chaque téléphone.

L’examen Production en lecture seule compte 8 vidéos publiques. Sur les 12 lignes vidéo de social_post_media, aucune ne possède simultanément largeur et hauteur renseignées : aucune certification 4K n’est possible avec ces métadonnées. Des objets MP4 et MOV du stockage atteignent respectivement environ 19 et 28 Mo. La diffusion actuelle utilise un fichier original par vidéo, sans renditions adaptatives ni transcodage.

Aucune conversion artificielle en 4K ni diminution de qualité des fichiers existants. La fluidité dépend encore du débit, du codec source et du terminal. Un streaming adaptatif jusqu’à la 4K nécessite un service de transcodage, des sources suffisantes et une intégration dédiée ; il n’est pas fourni par ces corrections. Aucun test de lecture réelle 4K ou de réseau mobile dégradé sur appareil physique n’a été effectué.

## Données et retour arrière

Aucune migration SQL, modification de rôle, suppression de média, réservation réelle ou paiement réel. Les corrections sont uniquement applicatives. Les installations distinctes par espace du commit 89b7fb180318a38715047fb9b2fb731c12e89c6b sont conservées.

En cas de régression, restaurer le déploiement Vercel dpl_8TWNVWHYKWgUmoDoe4GpqVG2EEjh, puis réconcilier le code avant une nouvelle publication. Aucun retour arrière de données requis.
