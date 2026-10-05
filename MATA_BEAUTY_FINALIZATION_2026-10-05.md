# Finalisation MATA Beauty — 5 octobre 2026

État : EN COURS. Production de départ : e7821ef, mata-beauty.com. Aucun résultat de la recette précédente ne vaut automatiquement validation des nouveaux changements.

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
