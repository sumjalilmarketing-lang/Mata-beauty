# Audit des actions du feed

## Constats et corrections

| Parcours | Constat | Correction |
| --- | --- | --- |
| Profil depuis une vidéo | Le clic cherchait l’auteur dans le catalogue réservable ; un profil approuvé sans prestation publique était déclaré indisponible. | Navigation directe vers le profil public salon ou professionnel, indépendamment du catalogue. |
| Réserver | Le bouton disparaissait lorsque la prestation associée n’était pas publique. | Bouton visible dans les deux modes ; réservation directe pour une prestation admissible, sinon ouverture des prestations publiques du professionnel. Aucun brouillon n’est exposé ni réservé. |
| Partager le profil | Le feed ne proposait que le partage de la vidéo. Le profil pouvait partager son URL courante privée ou avec paramètres. | Action dédiée dans le menu de la vidéo et URL publique canonique sur la page du profil. |
| Prestation associée en brouillon | Une ancienne prestation active mais encore en brouillon rendait une vidéo visible sans réservation directe. | Action explicite du propriétaire dans Mes vidéos pour publier la prestation, RPC existante avec contrôle de propriété et vérification du résultat. Aucune publication automatique au chargement. |
| Nouvelles publications | Le Studio vérifiait le seul marqueur actif. | Il exige une prestation publiée, active, non archivée ; les créations de prestations annoncent clairement leur publication. |
| Likes | État renvoyé par le serveur, blocage des doubles clics et gestion d’erreur déjà présents. | Régression de l’ajout/retrait du like depuis un feed sans entrée de catalogue. |
| Commentaires | Une exception réseau pouvait laisser le chargement sans reprise ou rejeter le gestionnaire de publication. | État d’erreur et reprise ; texte conservé en cas d’échec. Régression publication après panne simulée. |

## Couverture

Tests de domaine : chemins de profils et encodage, priorité salon, service publié actif, ancienne incohérence brouillon actif, archives et pauses exclues de l’action de publication rapide.

Tests navigateur isolés, exécutés par les suites CI existantes : visibilité vidéo et choix des prestations sans service public ; ouverture du profil hors catalogue ; partage vidéo/profil ; ajout/retrait du like ; commentaire après erreur réseau avec texte conservé ; publication de prestation uniquement après clic du propriétaire ; lien canonique du profil et ouverture de l’onglet prestations ; refus du transfert vidéo pour un service brouillon même marqué actif. Les tests de réservation existants conservent la prestation et la publication sources et vérifient les vrais contrôles de disponibilité sur fixtures.

Aucun like, commentaire, réservation ou changement de statut d’une prestation réelle n’est écrit pour les tests. Les horaires, l’admissibilité du professionnel et du salon ainsi que les règles de réservation restent obligatoires. Une prestation en brouillon doit être publiée par son propriétaire ; une prestation publiée peut ne pas encore proposer de créneau.
