# MATA Beauty — recette Partie 3

Date : 6 octobre 2026. Domaine confirmé : https://mata-beauty.com.

Ce document distingue les actions exécutées, les limites de recette et les fonctions absentes. Un menu visible n’est pas une preuve de gestion fonctionnelle.

## Périmètre et version

Lot : lisibilité des dossiers professionnels et du back-office, aperçu privé des documents, notifications centralisées, transport transactionnel, guides par profil. Le moteur de lecture vidéo n’a pas été modifié. Les paiements restent mock/désactivés ; aucun paiement réel n’a été effectué.

Commits du lot : `b45084e`, `c10ad92`, `0688e43`, `29fb01a`, `4f9eaf2`, `90296f9` (synchronisation upload). Les guides, ce rapport et les assertions de recette complémentaires font l’objet d’un commit distinct.

## Recette exécutée

| Zone | Action testée | Résultat attendu | Résultat observé | Statut | Correction |
|---|---|---|---|---|---|
| Candidature | Tentative sans les quatre documents | Refus explicite | Le dossier ne part pas | PASS QA | Validation serveur existante conservée |
| Candidature | Envoi de quatre fichiers privés | Dossier soumis, accès Pro encore fermé | Parcours complet exécuté | PASS QA | Présentation et retour d’état |
| Onboarding | Notification de nouveau dossier → Ouvrir | Bon dossier et notification lue | Identifiant du dossier conservé, `read_at` vérifié en base | PASS QA | Destination interne + historique |
| Documents | Images, zoom, ouverture privée | Fichiers accessibles uniquement par lien temporaire | Zoom 125 %, quatre liens HTTP 200 | PASS QA | Modale et liens signés |
| Documents | PDF intégré | Aperçu utilisable | Blocage CSP corrigé, lecteur PDF intégré chargé et document privé HTTP 200 | PASS QA | `frame-src` limité au stockage de documents du projet |
| Onboarding | Complément → nouvelle pièce → nouvel envoi → approbation | Notifications cohérentes et accès Pro uniquement à la fin | Parcours final PASS sur Preview `90296f9`, 1,7 minute | PASS QA | Confirmation, historique, liens, absence de doublon |
| Notifications | Lire un autre destinataire ou réécrire le contenu | Refus | Lecture étrangère vide, écriture du contenu refusée | PASS API QA | RLS propriétaire et seule colonne `read_at` modifiable |
| Notifications | Marquer comme lue | Modification limitée au propriétaire | Lecture et état lu contrôlés en base | PASS API/UI QA | Centre commun |
| Transport | Deux traitements concurrents | Une seule prise en charge | Une seule attribution de la livraison | PASS API QA | Verrouillage SQL `SKIP LOCKED` |
| Transport | Reprise ambiguë après 23 h | Pas de renvoi aveugle | État `needs_review` | PASS API QA | Limite avant expiration de la fenêtre d’idempotence |
| Préférences | E-mails réservation/rappel désactivés | Aucune livraison mise en file | Vérifié sur deux événements synthétiques | PASS API QA | Préférences respectées par le trigger |
| Transport | Appel sans authentification, signature périmée ou erronée | Refus | HTTP 401 / tests unitaires PASS | PASS | HMAC horodaté, secret jamais placé dans la file HTTP |
| E-mail | Envoi réel sur la boîte officielle Resend | Acceptation et pas de doublon | Référence Resend réelle, une tentative, second appel sans nouvel envoi | PASS transport QA | Transport Resend serveur |
| Visiteur | Navigation Explorer et largeur 390 px | Page utilisable | Test navigateur PASS | PASS QA | Contrôle de non-régression |
| Sept profils | Menus, notifications, refresh, logout, route protégée | Navigation correspondant au rôle | 7 tests PASS | PASS navigation QA | Navigation et centre de notifications commun |
| Super Admin | Santé plateforme | Compteurs globaux sans lecture des boîtes privées | RPC agrégée et cartes e-mails affichées | PASS QA | Compteurs réservés au Super Admin |
| Super Admin | Validation professionnelle | Contrôles lisibles et dossier hors tableau compact | Styles partagés corrigés, retest Super Admin PASS | PASS QA | Typographie, espacements, contrôles 44 px |
| Vidéo | Publication MP4 depuis Studio | Vidéo réellement stockée et publiée | PASS navigateur | PASS Preview | Lecteur conservé |
| Publications | Photo et avant/après | Stockage et apparition dans le feed | PASS navigateur | PASS Preview | Non-régression |
| Feed | Lecture, pause, reprise, son, scroll, retour | Un lecteur actif, arrêt hors écran | PASS ; démarrage mesuré à 516 ms dans ce run | PASS Preview | Non-régression |
| Feed → réservation | Bonne prestation, confirmation, historique, message | Réservation créée avec contexte vidéo | PASS ; liens client/prestataire/post vérifiés en base | PASS Preview | Destinations de notifications cohérentes |
| Guides | Guide complet et prises en main | Décrire les fonctions réelles et leurs limites | Deux fichiers produits | PRODUIT | Documentation par profil |

Les tests des sept profils couvrent client, professionnel, agent Onboarding, support, modérateur, administrateur et Super Admin. Ils vérifient les menus effectivement présents et la session ; ils ne prouvent pas toutes les mutations de tous les modules. Les contrôles des dossiers couvrent 1366×768, 1440×900, 1920×1080 et 390×844. Les espaces admin sont vérifiés aux trois tailles desktop.

### Synthèse UX demandée

| Rubrique | Statut sur le périmètre testé | Limite précise |
|---|---|---|
| PROFIL CLIENT | PASS | Navigation/session QA ; candidature, notifications et réservation en production |
| VALIDATION PRO | PASS | Parcours complet avec quatre pièces, complément, approbation et accès Pro |
| VISUALISATION DOCUMENTS | PASS | PNG zoomé, PDF réellement rendu en production, liens privés HTTP 200 |
| ONBOARDING | PASS | Nouveau dossier, lecture, complément, historique, nouvelle soumission, décision |
| SUPER ADMIN UX | PASS | Menus, responsive desktop, dossier partagé et santé en QA ; les modules non connectés restent non opérationnels |
| NOTIFICATIONS CLIENT | PASS | Destinataire, lien dossier, lecture et accès privé vérifiés |
| NOTIFICATIONS PRO | PASS | Publication unique, réservation unique, accès au bon contexte |
| NOTIFICATIONS ONBOARDING | PASS | Nouvelle candidature et complément dirigés vers le bon dossier |
| EMAILS | PASS transport | Ordonnanceur et Resend réels ; réception/lecture humaine NON TESTÉE |
| RESPONSIVE | PASS | Dossier aux quatre dimensions et espaces admin aux trois dimensions desktop indiquées |
| PERMISSIONS | PASS ciblé | RLS inbox, dossier, fonctions de traitement, Vault ; pas une certification de tous les RPC historiques |
| MODE D’EMPLOI | PRODUIT | Guide complet et prise en main rapide |

Cette synthèse valide le lot livré et ses parcours de recette. Elle ne constitue pas un « tout fonctionne » ni une certification exhaustive des fonctions explicitement absentes.

## Défauts corrigés

### BUG-UX-01 — dossier difficile à examiner

- Écran : validation professionnelle, Onboarding et Super Admin.
- Reproduction : ouvrir un prestataire dans l’ancienne présentation compacte/tableau.
- Observé : hiérarchie insuffisante, mélange informations/actions, documents peu exploitables.
- Attendu : identité, activité, pièces, historique et décision clairement séparés.
- Cause : rendu compact partagé avec les listes, styles du workspace non appliqués à l’espace admin.
- Fichiers : `app/provider-review.tsx`, `app/onboarding-queue.tsx`, `app/super-admin.tsx`, `app/dossier.css`.
- Correction : dossier pleine largeur, sections, dates Dakar, statut lisible, actions contextualisées, confirmation avec message, historique avec acteur ; contrôles admin explicitement stylés.
- Test : dossier réel avec quatre fichiers, compléments et approbation ; trois tailles desktop et mobile. Preview PASS. Production : voir livraison finale.

### BUG-DOC-01 — aperçu privé et PDF bloqué

- Écran : documents professionnels.
- Reproduction : ouvrir la qualification PDF dans la modale.
- Observé : PDF bloqué par `default-src 'self'` faute de directive pour le cadre externe. Une première assertion de visibilité de l’iframe ne détectait pas le défaut ; l’inspection de capture l’a révélé.
- Attendu : aperçu réel ou ouverture privée explicite, sans rendre le bucket public.
- Cause : CSP du parent interdisant le stockage signé en iframe.
- Fichiers : `app/professional-documents.tsx`, `next.config.ts`, `app/dossier.css`.
- Correction : modale, images et zoom, précédent/suivant, renouvellement du lien, fallback nouvel onglet, `frame-src` limité à l’origine configurée et au chemin des documents signés. `object-src 'none'` et protection contre l’encadrement du site conservés.
- Test : fichiers privés HTTP 200, images zoomées, PDF testé avec Chromium complet. Le shell headless sans lecteur PDF n’est pas utilisé comme preuve de rendu.
- Statut final Preview : PASS sur `90296f9`. Production : voir livraison finale.

### BUG-NOTIF-01 — décisions en double et mauvais contexte

- Écrans : notifications client/professionnel/Onboarding/admin.
- Reproduction : approuver un dossier ou ouvrir une notification de réservation/publication.
- Observé : plusieurs producteurs pour certaines décisions ; destination absente ou incorrecte pour le rôle et les contenus retirés.
- Cause : ancien trigger de statut redondant avec la RPC de décision ; destinations non normalisées.
- Fichiers : centre de notifications, `lib/domain/notifications.ts`, workspace messagerie, dashboard, migrations du lot.
- Correction : producteur unique par décision, destinataire Onboarding ciblé, liens internes autorisés, réservation/conversation identifiée, contenu privé vers Studio. Badge, lu/non lu, actualisation et pagination dans le même système.
- Test : une notification d’approbation en base, ouverture marquée lue, dossier correct, contexte réservation conservé ; isolation entre deux utilisateurs. Preview PASS. Production : voir livraison finale.

### BUG-MAIL-01 — transport transactionnel à finaliser

- Écran : événements candidature/réservation et Santé plateforme.
- Reproduction : produire un événement métier devant donner lieu à un e-mail.
- Attendu : file durable, préférences respectées, envoi serveur et suivi des échecs sans doublons.
- Fichiers : `lib/email/transactional.ts`, `lib/email/dispatch-auth.ts`, `app/api/cron/notifications/route.ts`, migrations.
- Correction : extension de `notification_deliveries` existante, aucune seconde boîte de notifications ; clé d’idempotence stable, destinataire figé à la première tentative, reprise bornée, état à vérifier après ambiguïté prolongée ; traitement pg_cron et Resend.
- Sécurité : le pg_net hébergé appartient à `supabase_admin`. Le rôle de migration ne peut pas révoquer ses droits PUBLIC par un simple REVOKE. Ce contrôle a été vérifié, pas supposé. Le dispatch transmet donc une signature valable 90 secondes, jamais le secret Vault réutilisable. Vault et RPC de configuration restent interdits aux utilisateurs ; les réponses HTTP ne contiennent que des compteurs.
- Test : concurrence, confidentialité, signature falsifiée/périmée, envoi Resend réel, répétition sans doublon. Activation et recette planifiée sur le domaine : PASS, preuve dans la section livraison.

### BUG-UX-02 — états et indicateurs trompeurs

- Écrans : modules admin non connectés, Santé plateforme, Studio, aide Pro.
- Observé : « aucune tâche » sans requête métier ; compteur notifications limité par la RLS à la seule boîte admin ; labels techniques ; aide suggérant un accès Pro prématuré.
- Fichiers : `app/super-admin.tsx`, `app/launch-admin.tsx`, `lib/ui/status-label.ts`, `app/product-help.tsx` et consommateurs.
- Correction : état honnête pour les fonctions non connectées, RPC de statistiques agrégées Super Admin, statuts français, parcours candidat jusqu’à approbation.
- Test : navigation réelle de tous les menus présents, carte e-mails Super Admin, refus de la RPC à un client. PASS QA. Cela ne transforme pas un module non connecté en fonctionnalité opérationnelle.

### ROBUSTESSE-DOC-02 — envoi du dossier pendant un upload

- Écran : candidature professionnelle, nouveau document ou complément.
- Risque constaté à la lecture du flux : bouton d’envoi indépendant du traitement du fichier.
- Correction : le parent reçoit l’état occupé du formulaire document et interdit l’envoi pendant l’upload et son rafraîchissement.
- Fichiers : `app/professional-application.tsx`, `app/professional-documents.tsx`.
- Précision de diagnostic : le dernier échec de recette après complément provenait du délai de cinq secondes du test. La trace confirme un POST réussi puis un GET `submitted`, arrivé trop tard pour cette assertion. L’attente a été portée à vingt secondes. Il ne s’agissait pas d’une perte du complément en base.

## Contrôles techniques et limites

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` exécutés avant chaque commit applicatif ; 78 tests unitaires PASS dans 18 fichiers.
- Contrôle API réel : contenu d’une notification non réécrivable, lecture étrangère refusée, dossier privé et appels de traitement refusés à un client, concurrence sans double prise en charge, arrêt des reprises ambiguës.
- Compte de recette MFA simplifié pour la matrice de navigation : ce run ne constitue pas une validation complète du MFA.
- Le script de feedback Vercel de Preview est bloqué par la CSP. Il est distingué des erreurs applicatives et n’est pas autorisé pour masquer son avertissement.
- Des pannes réseau transitoires et des assertions trop courtes ont interrompu des runs ; ces runs ne sont pas comptés PASS. Les tests de feed dépendent des publications créées par les tests précédents : le run tronqué sans photo a été relancé avec ces prérequis.
- La livraison Resend prouve l’acceptation technique sur `delivered@resend.dev`, boîte officielle de test. Elle ne prouve ni la lecture humaine ni le classement dans la boîte principale d’un utilisateur.
- Google OAuth, GPS physique et réception humaine d’e-mail ne sont pas requalifiés PASS par ce lot. Les preuves précédentes sont dans le rapport du lot antérieur ; aucun nouveau consentement Google complet n’est simulé ici.
- Les modules de rôles/permissions/sécurité et certains outils support/modération qui signalent une gestion non connectée restent des limites fonctionnelles. Le guide ne décrit pas de boutons absents.
- Paiements réels, virements et actions globales de maintenance sur les utilisateurs réels : non exécutés.
- Les preuves de navigateur, traces contenant des liens privés temporaires et secrets de transport restent dans `work/final-audit`, ignoré par Git. Aucun secret n’est inclus dans ce rapport.
- Advisor Supabase production après migrations : aucun avis de niveau ERROR, mais des WARN restent ouverts. Ils comprennent deux extensions déclarées dans `public` (`btree_gist`, `pg_net`), 40 fonctions SECURITY DEFINER exécutables par `anon`, 99 par `authenticated`, et la protection contre les mots de passe compromis désactivée. Les comptes se recouvrent ; ce ne sont pas 139 fuites prouvées. Certaines fonctions sont volontairement publiques (catalogue/disponibilités) ou protégées par un contrôle interne. Ce lot vérifie les droits des nouvelles fonctions, pas une requalification exhaustive de chaque RPC historique. Quatre tables techniques ont RLS sans politique et restent fermées à l’accès direct. Références : [fonctions accessibles anonymement](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [extensions](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Le rapport ne présente donc pas la sécurité globale comme entièrement soldée.

## Livraison finale

- Commit applicatif : **`90296f9e4f19063273694c412e5264fde1249939`**.
- Preview du dernier correctif : https://mata-beauty-kvtn37v2k-africrm.vercel.app/ (`dpl_2BVvAyRJFSZwGM1zeEY5UTu92g2S`).
- Production : **`dpl_AArFNRSim7Y3GZJPaJLXQK9rRVg9`**, URL immutable https://mata-beauty-r3qqdqc49-africrm.vercel.app/.
- Domaine public contrôlé à **00:33:59 UTC** : HTTPS 200 ; listes des 15 scripts identiques entre domaine et déploiement immutable ; backend production présent, backend QA absent. Preuve : `work/final-audit/production-version-90296f9.json`.
- `http://mata-beauty.com` et `https://www.mata-beauty.com` aboutissent à `https://mata-beauty.com/`, HTTP 200. Résolution A : `64.29.17.65`, `64.29.17.1`. La politique d’aperçu cible le stockage du projet production.
- Les cinq migrations du lot sont appliquées. Le secret du traitement est dans Vercel et Vault ; aucun secret dans Git ni secret réutilisable dans les requêtes de la file pg_net. Configuration interdite aux utilisateurs.
- **Transport production PASS à 00:35:01 UTC** : le planificateur automatique a traité la notification, Resend a accepté le message sur sa boîte officielle de test, référence `01a10ea2-a0db-78a5-8e07-1a987d7f7f69`, une tentative. Un appel signé supplémentaire n’a pas créé de nouvelle tentative. Appel non authentifié HTTP 401. Le compte technique a été supprimé. Preuve : `work/final-audit/part3-production-email.json`.
- **Recette navigateur directe production : 4 tests PASS en 4,5 minutes**, sans retry nécessaire : dossier et quatre documents → complément → approbation → accès Pro ; publication MP4 ; photo/avant-après ; feed et réservation. Capture PDF inspectée : page synthétique réellement rendue, pas seulement une iframe visible. Le test de feed contrôle aussi l’historique, la conversation, les statuts de rendez-vous, l’avis et la cohérence du montant `18 000 XOF`.
- Lecture production : démarrage observé à **4 098 ms** dans ce run ; lecture/pause/reprise/son, arrêt hors écran et un lecteur actif PASS. Ce chiffre isolé n’est pas un benchmark réseau. Aucun correctif du lecteur introduit dans ce lot.
- Vérification console/réseau du scénario vidéo, exécutée en fin de suite : PASS. Les comptes, contenus, documents et réservations synthétiques de ce run ont été supprimés ; contrôle SQL : zéro compte `codex-feed-*`, file transactionnelle vide après nettoyage. Les traces d’audit des actions restent volontairement conservées.
- **Contrôles complémentaires production : 1 test PASS en 1,6 minute**, sans retry : document précédent/suivant, renouvellement du lien, fermeture avec Échap et bouton, marquage individuel, tout marquer comme lu, filtre non lu, actualisation et retour à la liste. Le parcours dossier complet a été rejoué dans ce contrôle. Les captures et sorties sont dans `work/final-audit/part3-production-controls` et `work/final-audit/part3-document-pdf.png`.
- Contrôles de clôture : lint, TypeScript, 78 tests unitaires et build PASS. Les modifications restantes du commit de recette concernent uniquement les tests et les documents ; le commit applicatif servi reste `90296f9`.
- Nettoyage final vérifié en SQL : zéro compte de recette candidature, zéro compte de recette feed, compte de boîte Resend supprimé et zéro livraison transactionnelle en attente/en cours/en échec. Le fichier utilisateur `docs/PRODUCTION_READINESS_2026-08-16.md` est conservé sans modification ni ajout au commit.

## Modes d’emploi

- `docs/MATA_BEAUTY_GUIDE_COMPLET.md` — visiteur, client, professionnel, Salon, Onboarding, support, modération, administration et Super Admin.
- `docs/MATA_BEAUTY_PRISE_EN_MAIN_RAPIDE.md` — gestes essentiels par profil.

Ces documents utilisent les libellés réels, rappellent les limites de permissions et distinguent rendez-vous créé et confirmé. Aucun identifiant ou mot de passe de compte n’y figure.
