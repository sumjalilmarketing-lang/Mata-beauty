# MATA Beauty — recette de lisibilité du 8 octobre 2026

## Portée et conclusion

Cette recette porte sur la lisibilité et les interactions associées. Elle ne constitue pas une certification WCAG ni une validation exhaustive de toutes les permissions et fonctionnalités métier. Les contrôles axe sans violation ne sont pas assimilés à des pages fonctionnellement PASS. Les comptes de recette sont temporaires ; aucun rôle métier ni politique SQL n’a été modifié par les correctifs UI.

La version déployée est `fcc2f0587303574b3c3736f7e1d5a2cbd414ccfd`. Déploiement Vercel `dpl_3VTsX7behS5GZ24LjUmERtDpyFUv`, URL immuable `https://mata-beauty-ba3fu9zmz-africrm.vercel.app`. Vérification directe du domaine à 11:02:47 UTC : HTTP 200, 15 fichiers JavaScript et 2 feuilles CSS identiques au déploiement ; base de production présente, base QA absente. La passe complète était sur `250ac13`, puis les défauts et parcours critiques ont été retestés sur la version finale.

## Couverture et méthode

- Production de référence : 250ac13, contrôlée directement sur https://mata-beauty.com.
- 134 URLs distinctes, 208 couples rôle/URL et 2 500 captures/états : neuf profils, six résolutions, deux thèmes, plus fenêtres et erreurs ciblées.
- 75 117 occurrences DOM de contrôles relevées dans ces états. Ce nombre inclut répétitions et éléments cachés ; le nombre de composants uniques intégralement testés n’est pas établi.
- 2 454 états sans violation axe, 46 états avec violation avant les dernières corrections. Aucun débordement global de page sur ces 2 500 captures. Les cas indéterminés de contraste restent à apprécier visuellement.
- Employé : neuf URLs supplémentaires et 18 états en QA isolée ; aucun test Employé en production. Les comptes temporaires ont été supprimés après les tests.
- Les 32 routes Professionnel/Salon incluent des vues d’accueil sans salon rattaché. Le parcours Salon avec données a été testé séparément, mais chaque branche de chaque module Salon rempli ne l’a pas été.
- Les écrans publics de connexion, inscription, reset, feed et découverte sont contrôlés séparément ; ils ne sont pas 60 URLs différentes.

## Défauts et corrections

Les 26 lignes suivantes désignent des familles de défauts, et non le nombre de nœuds DOM ni de répétitions par rôle, thème ou résolution.

| ID | Page | Profil | Défaut | Cause | Correction | Test | Statut |
|---|---|---|---|---|---|---|---|
| UX-01 | Équipe & Accès, fenêtre de rôle | Super Admin | Texte presque blanc sur fond blanc, champs et actions difficiles à distinguer ; contraste observé 1,03:1 | Fond fixe blanc et couleurs héritées du thème sombre | Couleurs sémantiques de surface, texte, champs, bordures et boutons ; hauteur bornée | Fenêtre remplie, clair/sombre, six tailles, Tab/Maj+Tab/Échap | PASS sur le critère indiqué |
| UX-02 | Tableau de bord administratif | Super Admin | Légendes pâles sur cartes blanches, 1,92:1 | Thème sombre appliqué au texte sans adapter la surface | Couleurs de texte et de surface définies ensemble | axe et captures | PASS sur le critère indiqué |
| UX-03 | Indicateurs administratifs | Super Admin | Valeurs prune sur fond sombre, 1,28:1 | Couleurs codées en dur | Valeur liée au texte de la surface | axe et captures | PASS sur le critère indiqué |
| UX-04 | Statuts et indicateurs de sécurité | Interne | Vert trop sombre ou trop clair selon le fond, 3,42:1 et 4,09:1 | Une couleur commune à des surfaces différentes | Couleurs de succès distinctes par thème | axe | PASS sur le critère indiqué |
| UX-05 | En-têtes administratifs | Super Admin | Doré insuffisamment contrasté, dont 4,02:1 | Variables et règles de route concurrentes | Accent explicite par thème, sélecteurs adaptés | axe clair/sombre | PASS sur le critère indiqué |
| UX-06 | Santé plateforme | Super Admin | Version et valeurs illisibles sur cartes sombres | Texte hérité d’une surface claire | Texte clair des cartes et titres adaptés | axe et capture | PASS sur le critère indiqué |
| UX-07 | Tableaux de bord internes | Tous les espaces internes | Légendes à 3,78:1 | Gris codé en dur | Texte secondaire sémantique et taille renforcée | axe, six largeurs | PASS sur le critère indiqué |
| UX-08 | Tableau de bord Professionnel | Professionnel | En-tête et description trop sombres sur le dégradé | Couleur issue du composant partagé | Couleur adaptée à la surface sombre | Inspection visuelle avant/après ; axe ne détectait pas ce cas | PASS sur le critère indiqué |
| UX-09 | États vides, support et escalades | Client, Pro, interne | Texte « Aucune demande » ou équivalent à 3,29:1 | Style de route écrasant le texte du composant | Sélecteur et texte secondaire corrigés | axe, capture | PASS sur le critère indiqué |
| UX-10 | Actions Client/Pro et Support | Client, Pro, interne | Actualiser, suppression et liens d’action peu lisibles, jusqu’à 1,9:1 | Couleurs non adaptées au fond sombre ; boutons sans surface | Contrastes et surfaces d’action cohérents | axe et interactions des suites métier | PASS sur le critère indiqué |
| UX-11 | Support Client | Client | Catégorie et objet sans intitulé visible satisfaisant | Formulaire compact sans labels dédiés | Labels visibles, indication obligatoire | axe et capture du formulaire | PASS sur le critère indiqué |
| UX-12 | Filtre des utilisateurs | Super Admin | Sélecteur de rôle sans nom accessible | Select sans label | Label « Rôle » | axe | PASS sur le critère indiqué |
| UX-13 | Cartes des professionnels | Visiteur, Client | Boutons imbriqués dans un autre rôle button | Carte entière déclarée interactive | Bouton explicite sur le nom ; conservation des actions internes | axe et parcours catalogue/profil/réservation | PASS sur le critère indiqué |
| UX-14 | Chargements du feed, recherche et tableau de bord | Public, Pro | aria-label porté par un div sans rôle valide | Sémantique ARIA incomplète | role=status sur le chargement | Contrôle statique et axe des états observés ; tous les timings ne sont pas couverts | PASS sur le critère indiqué |
| UX-15 | Catalogue administratif | Interne | Case à cocher trop petite | Dimensions natives non adaptées | Cible 24 px | axe | PASS sur le critère indiqué |
| UX-16 | Appel à découvrir les inspirations | Public | Libellé insuffisamment contrasté | Couleurs de bouton | Paire de couleurs lisible | axe | PASS sur le critère indiqué |
| UX-17 | Connexion/inscription | Public | Séparateur e-mail à 4,28:1, très petit | Gris et taille codés en dur | Texte 13 px, couleur plus contrastée | axe aux six tailles, captures mobiles | PASS sur le critère indiqué |
| UX-18 | Liens légaux du pied de page | Public | Cibles de 15 px trop rapprochées | Liens inline compacts | Zone de clic agrandie | axe et clics des liens légaux | PASS sur le critère indiqué |
| UX-19 | Catalogue dans Opérations | Content Manager, Admin, Super Admin | Formulaire désorganisé et tableau débordant sur mobile | Styles du composant présents uniquement dans la route Super Admin | Styles partagés dans le contexte Opérations, tableau défilable et focalisable | Édition ouverte puis annulée, défilement clavier, six tailles | PASS sur le critère indiqué |
| UX-20 | Paramètres dans Opérations | Content Manager, Admin, Super Admin | Contenu élargissant la page à 375/390 px | Taille minimale implicite de la grille et longues valeurs sans retour à la ligne | min-width:0, minmax(0,1fr), retour à la ligne des valeurs | Contrôles de débordement | PASS sur le critère indiqué |
| UX-21 | Erreur dans la fenêtre de rôle | Super Admin | Erreur serveur cachée derrière la fenêtre | Feedback rendu hors de la modale | Message d’erreur dans la modale ; conservation du focus durant le chargement | Réponse 503 interceptée sans mutation, chargement désactivé, erreur visible, fermeture et retour de focus | PASS sur le critère indiqué |
| UX-22 | Sélecteur d’espace mobile | Client, Pro, Staff et interne | Nom accessible absent quand le label est masqué | display:none sur le label mobile | aria-label="Espace actif" | axe sur mobile | PASS sur le critère indiqué |

| UX-23 | Notifications | Client, Pro, Onboarding | Filtre trop petit sur mobile/tablette | Case native 13 px | Case 24 px et label 44 px ; bouton Actualiser | Filtrer, marquer lu, actualiser, ouvrir destination ; axe six tailles | PASS sur le critère indiqué |
| UX-24 | Aperçu PDF privé | Onboarding, Super Admin | Lien rose sur blanc à 3,29:1 | Style générique des liens plus prioritaire | Couleur explicite de l’aperçu | Ouverture PDF réelle, axe et capture | PASS sur le critère indiqué |
| UX-25 | Demande de complément | Onboarding | Confirmation disparaissant après le succès serveur | Remontage React lors du changement de statut | Identité stable du dossier, actualisation explicite sur statut | Message encore visible après statut actualisé, workflow complet | PASS sur le critère indiqué |
| UX-26 | Tableaux administratifs | Super Admin | Défilement horizontal inaccessible au clavier | Conteneur sans cible de focus | Région nommée, tabIndex, focus visible | Axe et flèche droite sur tableaux réellement débordants | PASS sur le critère indiqué |

## Limites à conserver explicitement

- Le contrôle de contraste automatisé laisse des cas `incomplete`, notamment sur les dégradés, images et vidéos. Un relevé sans violation n’est donc pas une conformité globale PASS.
- La capture de toutes les routes ne prouve pas l’exécution de chaque action de chaque module. Les boutons absents de l’inventaire fonctionnel validé restent NOT TESTED.
- Le rôle Employé a été préparé et testé uniquement en QA isolée, conformément à l’autorisation explicite. Sa recette en production reste NOT TESTED.
- Les simulations GPS et la molette automatisée ne constituent pas un nouveau test sur iPhone réel ni sur trackpad physique.
- Aucun nouveau consentement Google humain n’a été exécuté pendant cette recette UI. Les anciens résultats ne sont pas présentés comme un nouveau PASS.
- HaveIBeenPwned leaked-password protection : BLOCKED BY PLAN — activation possible après upgrade Pro. Aucune imitation ni contournement ; aucune activation revendiquée.
- Les réserves de qualification de sécurité et les limites métier antérieures ne sont pas levées par un correctif de lisibilité. Paiements toujours en mode mock.

## Preuves des parcours fonctionnels

Sur 250ac13 : 6 scénarios vidéo, 3 scénarios catalogue/Salon/candidature, 17 contrôles Équipe & Accès, 11 contrôles Auth/retours de liens ont réussi. Ces unités ne sont pas additionnées aux captures pour fabriquer un total de fonctionnalités. Les liens Auth ont été générés pour les comptes de recette : ce n’est pas une preuve de réception d’un e-mail ni un nouveau consentement Google. Le test d’invitation interne vérifie séparément son envoi au destinataire de test.

Les 97 tests unitaires, lint, typecheck et build passent. Ils ne remplacent pas les parcours réels. Les neuf rôles de la passe complète n’ont produit aucune erreur JavaScript et aucune réponse HTTP en erreur hors le 503 volontairement injecté sur /api/admin/team pour tester l’affichage de l’échec. Un ancien 500 isolé sur social_feed pendant la passe 82567c5 n’a pas été reproduit dans la passe complète ; sa cause n’a pas été établie et n’est pas présentée comme corrigée.

## Bilan après déploiement de fcc2f05

| Mesure | Résultat | Interprétation |
|---|---:|---|
| Familles de défauts identifiées / corrigées | 26 / 26 | Défauts listés UX-01 à UX-26 ; pas une promesse d’absence de tout défaut non découvert |
| États finaux ciblés sans violation axe | 196 PASS | 88 tableaux/modales, 36 notifications, 60 écrans publics, 12 aperçus PDF |
| État final ciblé en échec axe | 0 FAIL | Contrastes indéterminés non convertis en PASS |
| Interactions UI ciblées | 11 PASS | Défilement clavier, édition annulée, focus/modal/erreur, notifications |
| Contrôles Équipe & Accès | 17 PASS | Invitation, MFA, affectation/retrait des rôles, suspension, réactivation, révocation |
| Contrôles Auth par navigateur | 11 PASS | Retours de liens et sessions ; pas une nouvelle inscription Google humaine |
| Catalogue / Salon / candidature | 3 PASS | Données persistées, notifications et documents privés ; boucle complément/approbation |
| Vidéo | 6 PASS | MP4, photo/avant-après, feed vers réservation, modération, erreur réseau/timeout, uploads invalides/interrompus ; relance complète après correction de l’assertion |
| Navigation publique, GPS simulé et récupération réseau | 8 PASS | Tests navigateur après déploiement ; GPS physique non retesté |
| Tests unitaires | 97 PASS | Distincts des parcours utilisateur |
| Fonctionnalité premium indisponible | 1 BLOCKED | HaveIBeenPwned, abonnement fournisseur |
| Inventaire public non entièrement qualifié | 185 NOT TESTED | Dernier relevé : 212 occurrences, 27 PASS ; dépend des publications présentes et ne constitue pas un total global du produit |

Autres périmètres NOT TESTED, sans dénominateur exhaustif : toutes les branches internes restantes, tous les états Salon renseignés, nouveau consentement Google humain pendant cette recette, Employé en production, trackpad physique et nouveau contrôle tactile matériel. Le total global des actions NOT TESTED n’est donc pas établi. Il serait trompeur de le réduire à 185 ou de déclarer toutes les pages PASS.

Les 46 états en défaut de la passe complète ont été retestés dans le lot final sans retrouver leurs violations. Cette revalidation ciblée ne prétend pas que les 2 500 états ont tous été rejoués après le dernier déploiement.

## Réserves et verdict

**B — BÊTA CONTRÔLÉE.** Les corrections de lisibilité ne suffisent pas à certifier le lancement public. Le relevé public initial contenait 107 occurrences (27 PASS, 80 NOT TESTED). Le dernier relevé en contient 212 (27 PASS, 185 NOT TESTED), avec davantage de publications de recette présentes pendant le test. Cette hausse correspond au contenu affiché, pas à de nouvelles fonctionnalités ou à des régressions. Certaines fonctionnalités sont couvertes par d’autres suites, sans rapprochement occurrence par occurrence ; les occurrences non qualifiées ne sont donc pas transformées artificiellement en PASS. La couverture exhaustive de tous les boutons et branches demandée reste incomplète.

À terminer avant une déclaration exhaustive : qualifier les actions internes restantes et les états Salon renseignés, rapprocher l’inventaire des contrôles des preuves fonctionnelles, revoir les contrastes indéterminés, refaire Google avec intervention humaine, tester Employé en production avec autorisation adaptée et effectuer les gestes matériels. Le trackpad reste NOT TESTED — PHYSICAL TRACKPAD REQUIRED. Aucun nouveau test tactile physique n’est revendiqué.

Le blocage fournisseur reste distinct des défauts applicatifs : HaveIBeenPwned leaked-password protection — BLOCKED BY PLAN — activation possible après upgrade Pro. La présente recette ne prétend ni activer ce service ni clôturer l’audit exhaustif de sécurité. Les paiements restent mock.

## Captures locales avant / après

Ces fichiers restent dans le dossier de recette local ; les captures internes ne sont pas publiées sur le site.

| Défaut | Avant | Après |
|---|---|---|
| Modale sombre | [Avant](../work/ux-audit/before/role-dialog-dark-390.png) | [Après](../work/ux-audit/release-production-all/role-dialog-dark-390.png) |
| Erreur masquée | [Avant](../work/ux-audit/dialog-error-before/role-error-dark.png) | [Après](../work/ux-audit/release-production-all/role-error-dark.png) |
| Catalogue mobile | [Avant](../work/ux-audit/overflow-before/overflow--operations-categories-light-375.png) | [Après](../work/ux-audit/release-production-all/-operations-categories-dark-375.png) |
| Paramètres débordants | [Avant](../work/ux-audit/overflow-before/overflow--operations-settings-light-375.png) | [Après](../work/ux-audit/release-production-all/-operations-settings-dark-375.png) |
| Notifications | [Avant](../work/ux-audit/release-production-client-pro/-app-notifications-dark-375.png) | [Après production](../work/ux-audit/final-production-notifications/-app-notifications-dark-375.png) |
| Aperçu PDF | Violation chiffrée 3,29:1 reproduite en QA ; ancienne capture écrasée par le scénario suivant, donc pas de paire visuelle avant/après conservée pour ce cas | [Après](../work/final-audit/part3-document-pdf.png) |

Pour le catalogue et les paramètres, les images du tableau utilisent des thèmes différents ; les captures de chaque thème sont également conservées dans les mêmes dossiers. Une inspection visuelle a été effectuée sur les modales remplies, erreurs visibles, auth mobile, PDF, tableaux et espaces Client/Pro/Employé/interne. Toutes les 2 500 images n’ont pas été examinées manuellement une par une.

## Incidents de recette et portée des preuves

La première tentative d’authentification par lien sur une Preview QA a redirigé vers localhost, cette URL Preview n’étant pas autorisée dans la configuration Auth QA. Ce contrôle de Preview n’a pas été marqué PASS ; les retours ont ensuite été exécutés directement sur le domaine de production. La préparation Employé a initialement été refusée par le contrôle automatique d’approbation ; après votre autorisation explicite, elle a été limitée à la QA isolée, avec MFA et suppression des comptes temporaires.

Les libellés techniques de certaines anciennes suites mentionnent « Preview link » : le test Équipe contrôle en réalité que le lien appartient au domaine de base fourni, ici https://mata-beauty.com. Les captures et résultats conservés priment sur le nom historique du test.

La matrice de couverture par rôle et URL est conservée dans [MATA_BEAUTY_UX_ROUTES_2026-10-08.json](MATA_BEAUTY_UX_ROUTES_2026-10-08.json). Les nombres de cette annexe représentent des états rendus et contrôlés, jamais une autorisation d’action ou un PASS de toutes les fonctionnalités de la route.

Lors du dernier lot vidéo, une assertion initiale supposait à tort que la miniature de catégorie devait être celle du compte de recette. Elle a échoué quand un autre professionnel légitime de la même catégorie était affiché ; les cinq scénarios suivants ont été ignorés par la suite sérielle. Le test vérifie désormais l’appartenance du média au catalogue de cette catégorie, tout en conservant les assertions exactes sur la publication créée, sa prestation et son apparition dans le feed. Aucun code du lecteur vidéo n’a changé pour cette correction du test.

Des noms de données de recette sont visibles dans le catalogue de production (ex. QA actions). Leur inventaire et leur retrait éventuel doivent être qualifiés avant ouverture publique ; les tests de ce lot suppriment leurs propres comptes temporaires, sans supprimer arbitrairement les données héritées.

Les contrôles de scroll sur la version finale comptent 4 PASS molette et 2 cas sans débordement vertical ; les six contrôles de validation des mots de passe différents et les six contrôles de focus clavier passent. Ils ne prouvent pas le fonctionnement d’un trackpad matériel.

La relance vidéo complète se termine avec 6 PASS, 0 FAIL et aucun scénario ignoré. Sur les lots exécutés après déploiement : 0 FAIL applicatif non résolu identifié. Cela ne vaut pas qualification des actions NOT TESTED. Le rapport est un commit documentaire postérieur à la version applicative fcc2f05 ; il ne nécessite pas de nouveau déploiement.
