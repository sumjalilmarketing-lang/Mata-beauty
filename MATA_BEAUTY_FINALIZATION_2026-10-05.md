# Finalisation MATA Beauty — 5 et 6 octobre 2026

État : DÉPLOYÉ, PARCOURS CRITIQUES RETESTÉS ; ACCEPTATION EXHAUSTIVE ENCORE OUVERTE. Production actuelle : 7710c29505ee6641a2daafbc77d551ec5908ea1c sur mata-beauty.com, déploiement dpl_GY8BYvW6YS59CEMe47dpadaRHbNn. Les sections suivantes conservent l'historique des corrections ; leurs mentions « non déployé » décrivent l'étape datée, pas cet état courant. Aucun PASS global de tous les écrans n'est revendiqué.

## Vérification réelle après déploiement

| Zone | Action testée | Résultat attendu | Résultat observé | Statut | Correction |
|---|---|---|---|---|---|
| Production | Version du domaine | Dernier build et backend production | HTTP 200 ; 15 scripts identiques au déploiement immuable ; backend production présent, QA absent | PASS | Déploiement --prod, aucune promotion de build QA |
| Google Auth | Connexion compte existant | Retour et session active | Retour sur /app/profile, nouveau profil affiché ; un seul compte Google en base | PASS | Synchronisation du statut et callback existant conservés |
| Session | Refresh, logout, route protégée, reconnexion | Persistance, refus sans session, reconnexion | Profil conservé au refresh ; /app/profile redirige vers connexion après logout ; Google rétablit la session | PASS | Contrôle serveur conservé |
| Bienvenue | Envoi API puis répétition | Un seul message | Boîte officielle Resend : sent puis skipped, une tentative et un reçu fournisseur | PASS transport/API | File privée et clé d'idempotence |
| Bienvenue | Réception dans boîte humaine | E-mail consultable | Adresse de test exacte toujours à confirmer ; pas d'envoi supposé | NOT TESTED | Aucune livraison humaine inventée |
| Rôles Pro | Réconciliation historique | Aucun rôle sans approbation | 4 retraits journalisés, 0 rôle prématuré restant ; comptes et contenus conservés | PASS | Migration versionnée |
| Sécurité bienvenue | Lecture anonyme/client | Refus | RLS active, aucun privilège SELECT anon/authenticated | PASS | Table réservée au service |
| Vidéo production | Publier MP4, photo et avant/après | Médias publiés et lisibles | Parcours Studio réels et nettoyage PASS sur le domaine | PASS | Workflow Pro validé avec quatre pièces dans la fixture |
| Vidéo → réservation | Lecture, pause, scroll, interactions, réserver | Bon contexte et création réelle | Test navigateur complet PASS, contrôles console/réseau finaux PASS | PASS | Défilement desktop et générations de chargement |
| Profil production | Identité, préférences, support, confidentialité | Sauvegarde réelle et compte isolé | Test navigateur et contrôles en base PASS ; compte synthétique nettoyé | PASS | Profil séparé des paramètres |
| Google → réservation | Vidéo, réservation, historique, annulation | Même compte, prestation, prix et créneau | Lecture observée à 4,11 s ; réservation pending de 09:00 à 09:30 UTC, 1000 XOF, compte Google correct ; historique et annulation réels | PASS | Paiement sur place, aucun débit |
| Salon production | Catalogue, CRUD, réservation, échange, avis, statistiques | Données et échanges cohérents | Deux tests navigateur PASS, réponse reçue même avec WebSocket coupé ; nettoyage PASS | PASS | Rattrapage des messages, fixture alphabétique |
| Rôles production | Six profils, droits et audit | Autorisations granulaires et isolation | client/provider/support/onboarding/finance/super_admin : contexte, RLS allow/deny, audit connexion et action sensible PASS | PASS | Contrôles serveur et migration d'approbation |
| Horaire du feed | Navigateur Paris, prestation Dakar | 09:00 dans le feed comme dans la réservation | Après dernier déploiement : 09:00 dans les deux vues, lecture active à 4,14 s, console sans erreur | PASS | Fuseau Africa/Dakar explicite |

Preuves locales : work/final-audit/production-version-7710c29.json, welcome-production.json, production-profile-213c274.png, production-feed-timezone-7710c29.png. Domaine immuable final : https://mata-beauty-gwxpdtz5x-africrm.vercel.app/. Vérification HTTP 200, quinze scripts identiques, backend production présent et QA absent.

### Limites de l'acceptation

- Aucun professionnel réel approuvé ni publication réelle visible hors comptes synthétiques à la vérification finale. Le feed vide après nettoyage est l'état des données, pas une preuve de panne vidéo. La mise en service commerciale exige de vrais dossiers complets, vérifiés par un agent, puis leurs publications.
- Réception dans une boîte humaine, nouveau compte Google avec premier consentement, matrice complète des refus/annulations OAuth et GPS sur téléphone physique : non validés par ce lot. La connexion Google existante et le transport Resend réel sont validés séparément.
- Les parcours critiques ci-dessus et les contrôles Preview sont testés ; l'inventaire antérieur de chaque contrôle de chaque écran et tous les scénarios d'injection de panne ne sont pas entièrement clos. Ne pas transformer les cas non exécutés en PASS.
- Avertissements préexistants de l'advisor Supabase conservés dans l'audit ; cette livraison ne revendique pas leur résolution générale. Paiements toujours mock/sur place.
- Tous les correctifs applicatifs sont commités et déployés. Derniers contrôles locaux : lint, typecheck, 73 tests, build PASS. Les preuves techniques et captures sont dans work/final-audit (ignoré de Git) ; aucun secret committé.

## Audit préalable

- Next.js 16 App Router, React 19, TypeScript strict ; Supabase Auth (Google et e-mail), Postgres/RLS, Storage privé pour les justificatifs et médias sociaux. Paiement mock conservé.
- Routes publiques : /, /discover, /professional/[username], /service/[id], /video/[id], /posts/[id], /legal/[slug], /auth/callback, /auth/update-password.
- Espaces protégés côté serveur : /app, /pro, /salon, /staff, /onboarding, /support-agent, /moderation, /finance, /operations ; /admin dispose aussi de son centre de contrôle.
- APIs Next : auth/providers, health/server, professionals/wallet, payments/{capabilities,create,status,refund,confirm-service,webhook}. Les autres actions passent par Supabase REST/RPC avec RLS.
- Rôles applicatifs : client/provider/admin ; account_roles customer/professional ; rôles internes et permissions dans admin_roles/admin_user_roles. requireWorkspace lit les droits serveur, pas les métadonnées modifiables du client.
- QA Supabase : kazlvtxkbsdhbfvtqqdp ; production : qjdwxdbvrxedyfolnpol. Projet Vercel mata-beauty, domaine mata-beauty.com. Ne pas promouvoir un build configuré sur la base QA vers la production.
- Fonctionnalités déjà testées avant ce lot : publication automatique, lecture/scroll, réservation avec attribution vidéo, Google compte existant, paramètres client, messagerie. Conserver ces implémentations hors régression démontrée.

## Écarts initiaux

| Élément | Preuve | État |
|---|---|---|
| Profil client | UI production : identité, préférences, paiements, avis, support et confidentialité sur une page | FAIL UX demandé |
| Menus internes depuis profil | Sélecteur visible dans l'espace client de la session interne actuelle | FAIL séparation visuelle ; ne prouve pas une élévation de droits |
| Candidature professionnelle | RPC request_provider_onboarding insère immédiatement account_roles professional | FAIL workflow demandé |
| Envoi dossier | submit_provider_for_review et trigger protect_provider_review_fields semblent incompatibles pour le propriétaire | À reproduire en QA |
| Complément | UI insère document_reviews sans mettre à jour le dossier ni notifier le candidat | FAIL inspection ; à reproduire |
| Onboarding dédié | /onboarding utilise une liste générique, le vrai détail existe dans le centre admin | FAIL UX demandé |
| E-mail de bienvenue | Aucun transport d'e-mail identifié à ce stade | NOT TESTED |
| GPS réel | Aucune publication commerciale géolocalisée lors de la recette précédente | NOT TESTED pour distance réelle |

La partie 2 reçue s'arrête au point 37 après « Il ne doit pas rester bloqué ». Toute exigence ultérieure non reçue reste hors inventaire.

## Matrice d'accès à vérifier réellement

| Action | Client | Professionnel approuvé | Agent onboarding | Admin autorisé | Super admin |
|---|---|---|---|---|---|
| Réserver en tant que client | Propre compte | Avec rôle client | Avec rôle client | Avec rôle client | Avec rôle client |
| Publier prestation/vidéo | Non | Son activité | Non | Selon permission explicite | Selon permission explicite |
| Lire candidature/documents | Son dossier | Son dossier | documents.review | documents.review | Oui |
| Approuver/refuser | Non | Non | providers.verify | providers.verify | Oui |
| Attribuer rôles internes | Non | Non | Non | Selon modèle existant à vérifier | Oui, contrôle serveur requis |

Statut des lignes : NOT TESTED dans ce nouveau lot tant que les requêtes et clics ne sont pas exécutés.

## Résultats du lot — 5 octobre 2026

Les quatre documents sont obligatoires, sur confirmation explicite du propriétaire : identité, immatriculation, qualification, justificatif d'adresse.

| Zone | Action testée | Résultat attendu | Résultat observé | Statut | Correction |
|---|---|---|---|---|---|
| Profil | Identité, préférences, support, confidentialité | Données persistées | Parcours navigateur QA complet ; contrôles en base et nettoyage | PASS local + QA | Profil personnel séparé des paramètres |
| Profil mobile | 390 et 1366 px | Raccourcis visibles sans débordement | Mes favoris dans le viewport, largeur vérifiée | PASS local | Nouvelle page profil |
| Candidature | Demande professionnelle | Aucun droit avant approbation | Métadonnées forgées et demande sans rôle professionnel | PASS API QA | Attribution au moment de l'approbation |
| Candidature | Envoi incomplet | Refus si une pièce manque | Zéro puis trois documents refusés | PASS API QA | Quatre pièces réellement stockées exigées côté serveur |
| Candidature | Envoi complet répété | Un dossier sans activation prématurée | Deux soumissions idempotentes | PASS API QA | Transition autorisée et contrôlée |
| Documents | Autre client / anonyme | Lecture et URL signée refusées | Refus effectifs | PASS API QA | Storage privé et RLS conservés |
| Documents | Agent ouvre les quatre pièces | Fichiers réellement accessibles | Quatre nouveaux onglets, URL signée et HTTP 200 | PASS navigateur QA | Liste explicite des pièces |
| Complément | Demande, remplacement, renvoi | Statut, notification et nouvelle pièce | Ancienne pièce rejetée bloque ; remplacement autorise le renvoi | PASS API QA | RPC de complément transactionnel |
| Validation | Agent approuve puis candidat ouvre /pro | Droits après décision, aucun paiement | Parcours navigateur et API réussis | PASS local + QA | Queue dédiée et décision serveur |
| Resend | Installation et domaine | Expéditeur mata-beauty.com vérifié | Forfait gratuit, région eu-west-1, domaine Verified | PASS fournisseur | Intégration liée à la production |
| Resend | Envoi technique réel et répétition | Acceptation unique | Même ID pour deux requêtes identiques vers delivered@resend.dev | PASS transport | Clé d'idempotence |
| Bienvenue | RLS et concurrence | Client ne modifie pas les envois ; un seul claim | Accès refusés et un seul claim concurrent | PASS API QA | Table privée, service uniquement |
| Bienvenue | Compte déjà envoyé / retry trop ancien | Pas de nouvel envoi automatique | Sent ignoré ; ambiguïté après 23 h placée en needs_review | PASS API QA | Protection persistante au-delà de la déduplication Resend |

Le test technique Resend ne prouve pas la réception dans une boîte utilisateur. Identifiant de test : 01a10dde-6ae7-7845-bc30-6971d82a91f4. Preuve locale : work/final-audit/resend-domain-verified.png.

Le suivi de bienvenue ne reprend aucun ancien compte. Les demandes sont déclenchées après authentification classique et callback Google ; les échecs ne bloquent pas la session et restent traçables. Une nouvelle connexion peut relancer une tentative dans la fenêtre de sécurité. Aucun planificateur de reprise automatique n'est encore configuré.

Tests ajoutés : scripts/verify-professional-application-remote.mjs (9 contrôles), scripts/verify-welcome-email-remote.mjs, tests/remote/professional-application-remote-ui.spec.ts, tests/domain/welcome-email.test.ts. Suite unitaire : 70 tests PASS avant build final. Deux tests navigateur locaux avec backend QA PASS. Deux migrations appliquées uniquement en QA à ce stade.

La validation globale reste ouverte : nouvelle Preview, production et domaine réel non encore testés pour ce lot ; GPS physique non validé ; inventaire exhaustif et avertissements préexistants de l'advisor Supabase à poursuivre. Aucun PASS global implicite.

### BUG-ONBOARDING-01 — activation prématurée et envoi bloqué

- Écran : candidature professionnelle.
- Reproduction initiale : appeler request_provider_onboarding puis submit_provider_for_review avec un compte QA.
- Observé : rôle professional créé avant validation ; soumission rejetée par le trigger de protection des champs administrés.
- Attendu : candidature soumise sans droits professionnels, décision réservée à l'agent autorisé.
- Cause : attribution de rôle dans les RPC de demande et conflit entre mise à jour du statut et trigger.
- Fichiers : migration 20261005202610, lib/auth/profile.ts, lib/auth/workspace-server.ts, app/professional-application.tsx.
- Correction : transition serveur contrôlée, quatre pièces obligatoires, approbation seule activatrice du rôle ; contrôle du statut approuvé dans les espaces.
- Retest : neuf contrôles API et parcours navigateur complet PASS en QA.
- Preview / production / mata-beauty.com : en attente pour ce lot.

### BUG-ONBOARDING-02 — complément sans effet sur le dossier

- Écran : documents professionnels / revue.
- Reproduction : action de complément qui insérait seulement un document_reviews.
- Observé : absence de transition et de notification dans cette action.
- Attendu : candidat informé, pièce à remplacer, renvoi contrôlé.
- Cause : mutation UI isolée hors workflow transactionnel.
- Fichiers : app/professional-documents.tsx, app/onboarding-queue.tsx, migration 20261005202610.
- Correction : RPC autorisée et transactionnelle, statut et notification en base.
- Retest : complément, rejet de l'ancienne pièce, remplacement puis approbation PASS API QA.
- Preview / production / mata-beauty.com : en attente pour ce lot.

### BUG-PROFILE-01 — profil et réglages mélangés

- Écran : /app/profile.
- Observé : formulaire et toutes les rubriques de réglages concentrés dans le profil.
- Attendu : identité et activité, puis accès séparé aux paramètres.
- Cause : ClientControlCenter réutilisé comme profil principal.
- Fichiers : app/client-profile.tsx, app/client-control-center.tsx, app/workspace-module.tsx.
- Correction : page personnelle et routes distinctes ; menus internes cachés dans les espaces externes.
- Retest : navigation, sauvegardes et confidentialité PASS navigateur QA ; largeurs 390 et 1366 px.
- Preview / production / mata-beauty.com : en attente pour ce lot.

### EMAIL-01 — bienvenue absente

- Déclencheur : nouvelle inscription confirmée.
- Observé initial : aucun transport applicatif configuré.
- Attendu : un message de bienvenue unique.
- Fichiers : lib/email/welcome.ts, app/api/auth/welcome/route.ts, chemins d'authentification et migration 20261005205325.
- Correction : Resend réel, domaine vérifié, file privée créée uniquement pour les nouveaux comptes, claim sérialisé et reçu durable.
- Retest : quatre tests unitaires, isolation/concurrence en QA et transport Resend réel PASS. Envoi produit de bout en bout et réception utilisateur encore à tester.
- Preview : transport non configuré volontairement. Production / mata-beauty.com : code non encore déployé.

### Stabilisation après première Preview

- Commit applicatif initial : 5464f401da9cba6dd09e0191d6e5ffee0214d908 ; Preview https://mata-beauty-apcowco5n-africrm.vercel.app/ (dpl_BcjvAhsKvXMJB9StvvYxo4ZjcWbU).
- Profil et santé publique PASS. Candidature complète PASS après correction du cookie de protection Vercel du test ; l'échec initial portait sur le service worker redirigé vers cette protection.
- BUG-ONBOARDING-03 : la première transition de revue bloquait aussi la réactivation d'un professionnel suspendu. La migration 20261005211600 autorise uniquement une réactivation avec providers.verify, documents.review et providers.suspend, explication et dossier complet. Suspension, invisibilité du feed, réactivation et visibilité restaurée PASS API dans la recette vidéo Preview.
- Matrice API des six rôles PASS : contexte, permissions granulaires, RLS allow/deny, journalisation connexion et attribution sensible de rôle. L'agent ne peut pas approuver un dossier incomplet non soumis.
- Nouveau compte Google : synchronisation du statut confirmé pour toutes les intentions, avant tentative de bienvenue.
- Les comptes synthétiques des tests navigateur sont exclus explicitement des envois de bienvenue par leur fixture serveur ; aucun e-mail réel à example.test.
- Dernière vérification locale de stabilisation : lint, typecheck, 70 tests et build PASS. Recette vidéo/mobile complète encore en cours à cet instant.

### Recherche et gestes desktop

- BUG-SEARCH-01 : Barber/Barbier, Coiffeur/Coiffure et Onglerie/Ongles ne correspondaient pas dans la recherche multi-termes. Normalisation d'un vocabulaire limité, sans supprimer les contraintes de lieu ou de public. Les cinq exemples demandés et leurs contre-exemples passent ; suite portée à 72 tests. Fichiers : lib/domain/location.ts, tests/domain/location.test.ts.
- Molette descendante/montante et séries de petits deltas vérifiées sur Preview aux résolutions 1366×768, 1440×900 et 1920×1080. Aucun changement du moteur vidéo dans ce lot.
- Deux hypothèses du test vidéo corrigées : fin d'un geste après changement de viewport, puis index DOM supposé fixe après une nouvelle publication. Les contrôles ciblent maintenant l'identité de la vidéo quittée. Lecture/pause/reprise/son déjà observés PASS ; séquence complète en cours de reprise.
- Les contrôles de candidature incluent maintenant les accès directs d'un client à six espaces internes. Leur résultat final doit être enregistré après exécution.

### Compléments de recette et anomalie desktop

- Preview d7f02423b0ebaa860902157c651fbac82cf8972c : profil client, santé publique, candidature avec quatre pièces consultées et six URL internes refusées PASS. Catalogue des onze catégories, CRUD salon et messagerie réelle PASS séparément.
- BUG-FEED-WHEEL-01 : les petits deltas de molette peuvent revenir continuellement à zéro avec `scroll-snap-type: mandatory`, notamment sur grand écran. Reproduction indépendante dans Chromium avec vingt deltas de 70 px : mandatory = 0, proximity = 1285 px. La première hypothèse d'une distance insuffisante n'expliquait donc pas tout. Correction CSS limitée aux périphériques avec survol et pointeur fin ; accroche mobile inchangée. Retest complet en attente, aucun PASS global.
- Une erreur Storage 400 provenait de l'ancienne publication synthétique QA « Publication Salon 1791236045824-dfd2bb », dont le fichier n'existait plus. Cette seule publication orpheline a été supprimée après contrôle du compte example.test et du chemin manquant. Le nettoyage du test salon supprime désormais ses publications explicitement et vérifie les erreurs de suppression des comptes.
- Le dossier agent affiche maintenant aussi l'identité du candidat, son expérience, ses langues et ses conditions d'annulation, sous les politiques de lecture existantes. Retest navigateur requis.
- Resend installé et domaine mata-beauty.com vérifié après les autorisations explicites de l'utilisateur pour les conditions et le report de la configuration 2FA. Transport réel et idempotence validés sur l'adresse officielle de test Resend. Réception dans une boîte utilisateur encore non vérifiée ; adresse exacte demandée.
- Les nouveaux changements applicatifs et les trois migrations restent hors production à cet instant.

### BUG-MESSAGES-01 — message enregistré mais non reçu en direct

- Écran : conversation privée client / salon.
- Reproduction : répondre côté salon alors que la conversation cliente est ouverte.
- Observé sur Preview bc7c3aa : INSERT du message HTTP 201 dans la trace, absence du message chez le client après 30 secondes.
- Cause : chargement initial suivi d'un abonnement Realtime sans rattrapage des événements manqués ni resynchronisation lors d'une reconnexion.
- Correction : lecture incrémentale paginée à la souscription, au retour réseau/focus et toutes les dix secondes, fusion par identifiant ; nettoyage de l'abonnement, des événements et du timer à la fermeture. Erreur de synchronisation explicitement affichée et effacée après récupération.
- Test : le parcours salon coupe maintenant volontairement le WebSocket côté client pour vérifier la récupération réelle de la réponse en base. Résultat du retest à enregistrer.
- Nettoyage QA : les messages référencent leur auteur avec ON DELETE RESTRICT ; suppression explicite des conversations synthétiques avant suppression des comptes. Les quatre comptes résiduels des deux exécutions concernées ont été supprimés après vérification de leurs identifiants de recette.
- Production / mata-beauty.com : non déployé à ce stade.

### Recette Preview bc7c3aa et pagination

- Dossier agent complet PASS ; publication vidéo/photo/avant-après, RLS, renouvellement de lien signé, lecture/pause/son, molette aux trois résolutions, interactions, réservation et modération PASS.
- BUG-FEED-PAGINATION-01 : deux requêtes HTTP 200 de pagination au même curseur observées après des chargements initiaux anonyme/authentifié qui se chevauchent. Les anciennes réponses peuvent rétablir un curseur périmé. Ajout d'une génération de chargement ; seuls les résultats du chargement courant peuvent modifier les publications, le curseur et les interactions. Test conservé avec exigence d'une seule requête.
- Incident externe consigné : HTTP 502 de Storage lors de la signature d'une miniature pendant la publication, qui a néanmoins abouti. Aucun masquage de cette erreur dans la recette.
- Les tests mobiles situés après la pagination n'ont pas été exécutés dans ce run en mode séquentiel ; restent à reprendre.

- Retest du 6 octobre sur Preview 44caba9 (https://mata-beauty-bkxoh6g71-africrm.vercel.app/, dpl_C3uAjgSYbTUVNsNgo2wPsVx86q2s) : les deux tests catalogue/salon PASS, dont la réception de la réponse avec WebSocket client coupé, confirmation/démarrage/fin du rendez-vous, avis et statistiques. Nettoyage des comptes sans erreur. BUG-MESSAGES-01 validé sur Preview ; production toujours en attente.

### Recette Preview 0888be0 — navigation WebKit

- Pagination et filtres PASS (une seule requête), cinq largeurs mobiles PASS, lecture WebKit iPhone PASS et navigation professionnelle mobile effectuée. La suite reste FAIL à cause de sa vérification console finale : exception Fetch pendant le retour navigateur WebKit, sur le chargement du catalogue provider_profiles annulé lors du départ de page. Aucune erreur HTTP 400/502 observée dans ce run.
- BUG-NAV-WEBKIT-01 : annulation explicite du catalogue avec AbortController au départ/à la destruction, relance au retour depuis le cache navigateur. Le lecteur vidéo n'est pas modifié.
- La trace montrait aussi l'annulation par WebKit du POST bienvenue lancé sans attente malgré keepalive. L'authentification attend maintenant cet appel avant redirection, avec timeout de douze secondes et poursuite de connexion en cas d'échec de transport. La file durable permet la reprise, sans faux succès de livraison.
- Retest navigateur requis pour ces deux corrections. Production non modifiée.

### Préparation de production du 6 octobre

- Preview a3766a9 (https://mata-beauty-dgzbz1zro-africrm.vercel.app/, dpl_6Lp1ggU9BuVRDNzKLvyZ7E5RoFgn) : publication réelle et parcours WebKit iPhone avec retour/avance PASS, sans erreur applicative console/réseau dans la vérification finale. L'appel bienvenue n'est plus annulé par la redirection.
- Contrôle des données existantes en production : quatre rôles professional sans profil approuvé (trois dossiers draft, un profil professionnel absent), aucune prestation pour ces comptes. Migration 20261006002500 retire seulement ces autorisations prématurées et écrit un audit par retrait ; comptes, dossiers et publications conservés. L'approbation ultérieure réattribue le rôle par le workflow.
- Migration de réconciliation appliquée en QA et testée en transaction annulée avec deux comptes synthétiques : rôle approuvé conservé, rôle non approuvé retiré, audit présent. Aucun compte synthétique de ce contrôle conservé.
- Le lot comporte désormais quatre migrations. Déploiement production et retest du domaine encore à exécuter à ce point du rapport.

### Deux ajustements après contrôle du domaine

- BUG-TIMEZONE-01 : depuis un navigateur réglé sur Paris, le feed indiquait 11:00 alors que le récapitulatif et la base utilisaient correctement 09:00 à Dakar. Cause : toLocaleString sans timeZone dans le prochain créneau du feed. Correction : Africa/Dakar, comme le parcours de réservation. Retest visuel après publication à enregistrer.
- Le premier test salon en production a reçu MATA_ANTI_CIRCUMVENTION:contact_details : son identifiant numérique long ressemblait à un numéro de téléphone. L'identifiant du message de test devient alphabétique, comme dans la recette vidéo ; la règle de production n'est pas désactivée. L'interface explique maintenant ce refus au lieu d'un échec générique, avec test unitaire dédié.
- Preuves Google supplémentaires : work/final-audit/google-booking-production-213c274.png et google-history-production-213c274.png. La réservation fictive a été annulée par le bouton du compte client avant nettoyage.
