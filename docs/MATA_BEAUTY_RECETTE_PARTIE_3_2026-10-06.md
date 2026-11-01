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

---

# Recette finale de production — 6 octobre 2026

**Conclusion : C — NON PRÊT pour une ouverture générale.** Cette conclusion remplace toute interprétation des tableaux historiques ci-dessus comme une validation exhaustive de production. Les fonctions non exécutées restent NOT TESTED. La recette a révélé deux failles bloquantes, corrigées et retestées, ainsi que des fonctions administratives indisponibles et une couverture encore incomplète.

## Versions réellement observées

- Au début de cette recette : `90296f9e4f19063273694c412e5264fde1249939`, déploiement `dpl_AArFNRSim7Y3GZJPaJLXQK9rRVg9`. La référence demandée `b029619` est introuvable dans le dépôt et ne correspond pas aux métadonnées de production : **FAIL** pour cette affirmation de version.
- Après correction des deux failles : **`822ea0818196cec5c555337c1ca4b545e49f59dd`**, déploiement **`dpl_G6egT7kdrnZXkRG3J8dMy5mwBe34`**. Domaine **https://mata-beauty.com**.
- Vérification du domaine le 6 octobre à **01:23:15 UTC** : HTTP 200, 15 fichiers JavaScript identiques au déploiement immuable `mata-beauty-2jovyazhn-africrm.vercel.app`, base production présente, base QA absente. Le SHA vient des métadonnées Vercel, pas d’une valeur supposée.
- Migration `20261006010731_enforce_professional_approval_and_admin_mfa.sql` appliquée en QA puis en production. Preview du correctif : `https://mata-beauty-5o01g08ik-africrm.vercel.app`.
- Seul code applicatif modifié : contrôle MFA du centre administratif. La seconde correction est en base. **Aucun changement du lecteur vidéo**, aucun nouveau module métier, paiements toujours mock.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (**78 tests, 18 fichiers**) et `pnpm build` passent. Ces contrôles ne remplacent aucun résultat utilisateur ci-dessous.

## Actions réellement exécutées sur le domaine public

Les données métier créées pour les scénarios sont synthétiques. Les comptes de recette, publications, documents et réservations sont nettoyés par les suites. La connexion Google utilise le compte existant de l’utilisateur, sans modification de son profil ni création d’un nouveau compte Google.

| Zone / profil | Action testée | Résultat attendu | Résultat observé | Statut | Correction / limite |
|---|---|---|---|---|---|
| Visiteur | Inspiration → Rendez-vous, Messages, Profil | Demande de connexion | Modale de connexion ouverte à chaque clic | PASS | Parcours anonyme réel |
| Visiteur | Fermer, Créer un compte, Déjà inscrit, Mot de passe oublié | Bon écran ou fermeture | Transitions exécutées | PASS | Soumission inscription/réinitialisation non incluse dans ce contrôle |
| Visiteur | Explorer → chaque catégorie → Retour | Catégorie correcte | Navigation exécutée | PASS | Catalogue testé avec des offres de recette |
| Visiteur | Liens légaux présents | Document demandé | Documents ouverts puis retour navigateur | PASS | Pas un audit juridique du contenu |
| Recherche | Recherche sans correspondance, ouvrir Filtres | Écran et filtres accessibles | Actions exécutées | PASS | Toutes les combinaisons de filtres ne sont pas validées |
| Auth | Carte et bouton Google à 375, 390, 430, 768, 1366, 1440, 1920 px | Carte centrée, bouton accessible | Bornes du bouton dans la carte, centrage et accès vérifiés | PASS | Chromium ; ne prouve pas tous les appareils physiques |
| Google existant | Profil → Continuer avec Google → callback | Session Client active | Retour sur `/app/profile?auth=google&intent=client&profile=complete`, photo et profil existants | PASS | Exécuté avant le correctif de sécurité ; OAuth Client inchangé |
| Google nouveau | Première inscription avec compte Google inédit | Création unique + bienvenue | Aucun nouveau compte disponible | NOT TESTED | L’utilisateur dispose uniquement de son compte existant |
| Google | Refus, popup bloquée, callback interrompu, expiration | Gestion cohérente | Non exécutés dans cette recette finale | NOT TESTED | Les résultats historiques ne sont pas réutilisés comme PASS |
| Client | Profil distinct des paramètres | Identité visible, formulaire séparé | Profil puis Modifier mon profil exécutés | PASS | Compte de recette |
| Client | Prénom, nom, pseudo, téléphone, ville, quartier, bio → Enregistrer | Persistance | Message de succès et valeurs en base contrôlés | PASS | Profil de recette uniquement |
| Client | Budget / catégories favorites | Préférences persistées | Enregistrement et lecture serveur concordants | PASS | Ne couvre pas toutes les combinaisons invalides |
| Client | Aide → envoyer demande | Ticket créé | Confirmation et ticket réel en base | PASS | Traitement de ce ticket par un agent non exécuté |
| Client | Confidentialité → enregistrer | Valeur persistée | Valeur contrôlée en base | PASS | Une préférence testée, pas chaque option |
| Client | Demander suppression du compte | Demande enregistrée | Statut `requested` vérifié | PASS | Ce n’est pas une suppression effective ni une validation du traitement RGPD |
| Client | Photo existante | Photo affichée | Photo Google visible | PASS | Remplacement/upload de photo NOT TESTED dans cette recette |
| Localisation | Près de moi → Utiliser ma position, permission refusée | Message et repli manuel | « Localisation refusée. Vous pouvez choisir une ville ou un quartier. » | PASS | Refus navigateur réel, pas GPS physique réussi |
| Localisation | Ville ou quartier = Dakar → Voir les résultats | Zone sélectionnée | « Dakar · Modifier » visible ; test feed local avec contenu de recette réussi | PASS | Le navigateur resté sur son ancien feed vide n’est pas une preuve d’absence d’offres serveur |
| Localisation | GPS réel et distances physiques | Résultats géographiques exacts | Pas de position réelle disponible et vérifiée | NOT TESTED | À effectuer sur téléphone |
| Professionnel | Connexion, menus principaux, notifications, refresh, logout | Accès au bon espace | Scénarios exécutés avec rôle provider approuvé | PASS | Ne signifie pas que chaque formulaire a été soumis |
| Client / Pro | Menus, session conservée au refresh puis route protégée après logout | Session fiable et accès fermé après logout | Test exécuté ; attente de la fin de déconnexion avant nouvelle navigation | PASS | Expiration temporelle et révocation de session volée non testées |
| Pro | Studio → MP4 réelle → publier | Upload Storage et publication | Publication réelle, données serveur contrôlées | PASS | Compte et contenu de recette |
| Pro | Photo puis avant/après → publier | Deux formats publiables | Fichiers réels envoyés et publications vérifiées | PASS | Pas un test de fichier très lourd |
| Feed | Chargement, lecture, pause/reprise, son | Lecture utilisable | Interactions exécutées, progression vidéo contrôlée | PASS | Latence mesurée ponctuellement, pas un benchmark |
| Feed | Une seule vidéo active, sortie d’écran, retour | Arrêt hors écran et reprise correcte | Propriétés des lecteurs vérifiées | PASS | Pas de mesure prolongée de fuite mémoire |
| Feed desktop | Molette rapide et incréments de 70 px, descendre/remonter | Déplacement réel | `scrollTop` contrôlé à 1366×768, 1440×900, 1920×1080 | PASS | Ne prouve pas un trackpad matériel |
| Feed | Profil du Pro, prestation, prix, durée | Bon contexte | Contexte conservé jusqu’à la réservation | PASS | Prestation de recette à 18 000 FCFA |
| Feed | J’aime, Enregistrer, Suivre, Commentaires | Interaction persistée | Compteurs et lignes serveur vérifiés | PASS | Chaque variante de suppression n’est pas répertoriée comme exécutée ici |
| Feed | Partager | API de partage appelée | `navigator.share` remplacé dans le test | NOT TESTED | Partage natif et réception par un tiers non exécutés |
| Feed | Pagination et filtres | Chargement supplémentaire sans doublon | Un premier run a expiré après 5 s à 8 cartes ; retry puis run complet suivant réussis | PASS | Réserve de stabilité conservée, aucune modification vidéo sur cette seule occurrence |
| Feed | URL signée expirée | Nouveau lien depuis Storage | Renouvellement vérifié | PASS | Ne couvre pas tous les timeouts/fichiers corrompus |
| Feed | Contenu non publiable / écriture étrangère | Masquage et refus | RLS réellement testée | PASS | Scénario précis, pas audit exhaustif de toutes les fonctions SQL |
| Mobile | Feed et réservation sur 320, 360, 375, 390, 430, 768, 1024, 1440 px | Actions accessibles | Parcours réel et absence de débordement contrôlés | PASS | Émulation navigateur |
| WebKit | iPhone 390 px, lecture, retour/avance navigateur | Lecture et navigation | Scénario complet réussi après correction du canal du lanceur | PASS | Moteur WebKit, pas téléphone iOS physique |
| Pro mobile | Studio / navigation à 360, 375, 390, 430 px | Actions accessibles | Navigation et bouton publication contrôlés | PASS | Émulation navigateur |
| Réservation | Vidéo → Pro → prestation → date → heure → confirmer | Bonne prestation, prix, créneau, création | Réservation réelle et `source_post_id` vérifiés | PASS | Paiement mock, aucune charge réelle |
| Réservation | Compte Client puis Pro | Même réservation visible | Consultation des deux espaces exécutée | PASS | Modifications de statut de ce scénario effectuées par API, pas toutes par clic |
| Réservation | Concurrence de deux clients, double confirmation, annulation/reprise | Aucune réservation accidentellement doublée | Pas de nouvelle recette exhaustive de ces cas dans cette session | NOT TESTED | Nécessaire avant ouverture générale |
| Notifications | Publication et réservation | Notification créée, bon destinataire | Création et destination contrôlées en base | PASS | Clic de chaque événement réservation/publication non exhaustif |
| Modération | Client signale → équipe ouvre → masque → restaure | Décisions autorisées et audit | Scénario réellement exécuté ; action Pro non autorisée refusée | PASS | Module Contenu social opérationnel, distinct du menu Signalements générique |
| Candidature | Devenir Pro, informations, envoi sans quatre documents | Refus d’envoi incomplet | Dossier non soumis | PASS | Règle quatre documents conservée |
| Candidature | Quatre documents → envoyer → refresh | Dossier soumis, accès Pro fermé | Envoi réel, statut visible, `/pro` renvoie à la candidature | PASS | Fichiers synthétiques privés |
| Onboarding | Notification → Ouvrir | Bon dossier et notification lue | Identifiant de dossier et `read_at` vérifiés | PASS | Destinataire agent contrôlé |
| Dossier | Identité, activité, langues, conditions, historique | Informations lisibles | Valeurs et captures desktop/mobile contrôlées | PASS | Lisibilité observée, pas seulement présence d’un titre |
| Documents | Quatre aperçus privés, image/zoom, nouvel onglet | Fichiers accessibles au reviewer | Liens temporaires HTTP 200, zoom à 125 % | PASS | Accès utilisateur autorisé |
| PDF | Aperçu, précédent/suivant, renouveler, Échap | PDF exploitable et modale refermable | Chargement intégré et actions exécutés | PASS | Chromium complet, capture conservée |
| Onboarding | Demander complément → Client notifié → nouvelle pièce → renvoyer | Boucle de complément complète | Exécutée, nouvel événement agent | PASS | Pas une simple mise à jour manuelle en base |
| Onboarding | Examiner → approuver → Client notifié → accès Pro | Transition contrôlée et unique | Décision, notification et accès `/pro` vérifiés | PASS | Retest réussi après correctif en production |
| Notifications | Ouvrir approbation, marquer une/toutes lues, filtre, refresh | Bon lien et persistance de lecture | Actions exécutées | PASS | Le compte ne lit que sa boîte pour ces scénarios |
| Onboarding | Refuser puis nouvelle candidature | Reprise cohérente | Non exécuté dans cette recette | NOT TESTED | À compléter |
| Super Admin | Connexion, chaque menu principal | Bonne rubrique | Clics et titres exécutés | PASS | Navigation uniquement ; ne valide pas les modules non connectés |
| Super Admin | Santé plateforme | Indicateurs réels et e-mails visibles | Appels 404 aux objets Phase 2, indicateurs absents | FAIL | Voir BUG-PROD-003 |
| Admin / Onboarding / Support / Modérateur | Navigation autorisée, notifications, responsive, logout | Espace limité au rôle | Scénarios séparés exécutés | PASS | Mutations de chaque métier non exhaustives |
| Sécurité Client / Pro | URLs `/onboarding`, `/support-agent`, `/moderation`, `/finance`, `/operations`, `/staff` | Refus | Redirection `acces=refuse` | PASS | URLs réellement ouvertes |
| Sécurité Client / Pro | `/admin`, `/admin/users`, `/admin/roles` | Refus sans centre administratif | Page « Compte non autorisé » ou redirection serveur explicite | PASS | Deux comportements distincts testés |
| Sécurité API | Modifier `profiles.role`, insérer `account_roles`, RPC attribution Super Admin | Refus | Erreurs serveur, rôle inchangé | PASS | Test Client et Pro |
| Sécurité API | Métadonnées `role=super_admin`, `approvalStatus=approved` | Aucune permission accordée | Métadonnées modifiables mais contexte admin reste nul | PASS | Contrôle après refresh du token |
| Sécurité API | Client modifie son statut professionnel en approved | Refus | Autorisé avant correctif, désormais 42501 et statut draft | PASS | BUG-PROD-001 corrigé |
| Sécurité MFA | Permission administrative à AAL1 avec requires_mfa=true | Refus serveur | Accordée avant correctif, désormais refusée | PASS | BUG-PROD-002 corrigé |
| MFA UI | Enrôler, mauvais code, bon code, refresh, logout/reconnexion | Second facteur obligatoire | Scénario réel réussi en Preview puis production | PASS | Compte de recette ; secret non enregistré dans les traces |
| E-mail transactionnel | Notification → ordonnanceur → Resend → deuxième déclenchement | Un seul envoi | `sent`, attempts=1, deuxième passage sans doublon | PASS | Acceptation transport, pas réception humaine |
| Bienvenue | Endpoint authentifié → Resend → nouvel appel | Envoi unique | Premier `sent`, second `skipped`, attempts=1 | PASS | Compte de test créé par API ; ne prouve pas une première inscription Google |
| E-mails | Boîte personnelle : réception, contenu, liens | E-mail réellement reçu et exploitable | Aucune boîte humaine consultée dans cette recette | NOT TESTED | À compléter |
| Catalogue / Salon | Catégories → profil → prestation → prix → créneaux | Cohérence | Parcours distant exécuté | PASS | Retest sur 822ea08 |
| Salon | Profil, collaboratrice, prestation, image, réservation, messages, avis/statistiques | Données reliées entre espaces | CRUD et parcours réels exécutés | PASS | Ne remplace pas tous les formulaires Pro indépendant |
| Pro indépendant | CRUD exhaustif prestations, horaires, disponibilités, localisation | Toutes les modifications persistées | Navigation seulement et données préparées pour le feed | NOT TESTED | Ne pas confondre préparation API et clics de gestion |
| Trackpad matériel | Défilement physique sur l’ordinateur | Comportement réel validé | Contrôle non réalisé ; utilisateur a demandé l’automatisation | NOT TESTED | Molette automatisée ne prouve pas le trackpad |
| Desktop dossier | Molette, descendre/remonter le dossier long aux trois résolutions | Scroll effectif dans les pages débordantes | Positions de défilement mesurées, retour en haut vérifié | PASS | Run `dossier-scroll-822ea08` après déploiement |
| Desktop Super Admin | Paramètres à 1366×768, 1440×900, 1920×1080 | Scroll quand nécessaire, retour en haut | Contrôle de molette exécuté après validation MFA | PASS | Ne couvre pas chaque rubrique administrative longue |
| Desktop modales | Molette dans chaque modale et PDF | Toutes zones défilables | Actions des documents exécutées, matrice complète de molette non réalisée | NOT TESTED | Ne pas confondre clic automatique qui fait défiler et test de molette |
| Réseau / durée | Mode hors ligne, session expirée, stress, mémoire, vidéo lourde | Récupération fiable | Matrice complète non exécutée | NOT TESTED | À compléter avant lancement public |

## Anomalies et corrections

### BUG-PROD-001 — auto-approbation professionnelle

- **Écran / API :** candidature professionnelle / API `provider_profiles`.
- **Reproduction :** connecter un Client propriétaire d’un profil draft ; PATCH son profil avec `status=approved`.
- **Observé :** requête acceptée, statut approved ; le trigger de synchronisation attribue ensuite le rôle professional.
- **Attendu :** seul le circuit de décision autorisé peut approuver.
- **Cause :** RLS limitait la ligne au propriétaire, mais aucune protection ne limitait les colonnes de confiance.
- **Fichiers :** `supabase/migrations/20261006010731_enforce_professional_approval_and_admin_mfa.sql`, `scripts/verify-production-role-security.mjs`.
- **Correction :** trigger SECURITY INVOKER refuse les changements directs de statut, identité propriétaire, vérification et notes agrégées ; INSERT direct ne peut pas créer un profil déjà approuvé. Les RPC autorisées conservent leur exécution privilégiée contrôlée.
- **Après correction :** PATCH refusé 42501, statut draft ; parcours d’approbation normal toujours réussi.
- **Preview : PASS. Production : PASS. mata-beauty.com : PASS.**
- **Bloquant avant lancement : OUI, corrigé.** L’historique complet des approbations précédentes n’a pas été audité pour rechercher une exploitation antérieure.

### BUG-PROD-002 — MFA annoncé mais non imposé

- **Écran / API :** `/admin`, helpers de permissions et politiques RLS.
- **Reproduction :** rôle Super Admin de recette avec `requires_mfa=true`, connexion mot de passe seule, appel `has_admin_permission('roles.manage')`.
- **Observé :** true au niveau AAL1.
- **Attendu :** refus jusqu’à AAL2.
- **Cause :** indicateur MFA seulement exposé dans le contexte ; `is_admin`, `is_super_admin` et `has_admin_permission` ne contrôlaient pas l’AAL.
- **Fichiers :** migration ci-dessus, `app/super-admin.tsx`, tests de rôles et script sécurité.
- **Correction :** contrôle central du MFA dans les trois helpers et écran d’enrôlement/vérification TOTP avant accès administratif. Aucun contexte privilégié disponible avant validation.
- **Après correction :** permission refusée à AAL1 ; mauvais code rejeté ; bon code ouvre le centre ; refresh conserve AAL2 ; nouvelle connexion redemande le second facteur.
- **Preview : PASS. Production : PASS. mata-beauty.com : PASS.**
- **Bloquant avant lancement : OUI, corrigé pour les comptes marqués requires_mfa.** Audit de la politique MFA de tous les comptes internes et récupération de facteur perdu restent NOT TESTED.

### BUG-PROD-003 — données de pilotage absentes en production

- **Écran :** Super Admin → Lancement, Cohorte lancement, Santé plateforme.
- **Reproduction :** connexion Super Admin → clic Santé plateforme.
- **Observé :** 404 sur `get_launch_dashboard`, `launch_provider_cohort_overview`, `fraud_alerts` ; message « Les données lancement nécessitent la migration Phase 2 » ; indicateur Application Incident et compteurs par défaut. « E-mails à vérifier » absent.
- **Attendu :** indicateurs réels, ou états indisponibles distincts sans fausse valeur zéro.
- **Cause :** frontend utilise des objets de la migration `20260816180000_launch_commercial_foundation.sql` absents de la production. La charge groupée s’arrête sur l’erreur du dashboard avant de rendre les données de livraison disponibles.
- **Fichiers concernés :** `app/launch-admin.tsx`, migration de fondation commerciale.
- **Correction effectuée :** aucune dans cette recette. Appliquer aveuglément toute la fondation commerciale ajouterait un périmètre métier pendant le gel demandé. Il faut vérifier ses dépendances, politiques et conséquences, puis traiter ce décalage de déploiement.
- **Test après correction :** NOT TESTED. **Preview : NOT TESTED pour la parité de fondation. Production : FAIL. mata-beauty.com : FAIL.**
- **Bloquant avant lancement : OUI pour la validation opérationnelle annoncée.**

### OBS-PROD-004 — pagination et lanceur de tests

- **Écran :** feed, pagination.
- **Observé :** premier essai limité à 8 cartes au bout du délai de 5 s ; retry puis nouvelle suite complète réussis.
- **Cause technique :** non établie ; ne pas attribuer arbitrairement l’échec au réseau ou au lecteur.
- **Correction vidéo :** aucune. Réserve de stabilité à surveiller et à reproduire sous réseau lent.
- **Autre erreur de recette corrigée :** le test WebKit héritait du canal Chromium ; canal explicite réinitialisé dans le lanceur. Le test WebKit a ensuite réellement été exécuté et a réussi.
- **Statut production : PASS sur le dernier run, avec occurrence initiale conservée.** Test prolongé/réseau lent : NOT TESTED.

## Chaque réserve administrative encore ouverte

Les lignes FAIL désignent une gestion attendue par le menu mais indisponible. Elles ne signifient pas qu’un bouton absent a été inventé. Un circuit alternatif réellement testé est indiqué lorsqu’il existe.

| Problème | Risque | Fonction concernée | Bloquant avant lancement | Correction nécessaire | Statut |
|---|---|---|---|---|---|
| Gestion centrale salons non connectée | Pas de supervision complète équipes/incidents | Super Admin → Salons | OUI si lancement avec salons | Connecter le périmètre nécessaire ou formaliser un circuit opérateur testé | FAIL |
| Gestion des avis non connectée | Impossible de traiter tous les avis abusifs depuis ce menu | Avis | OUI | Brancher décisions et audit ; tester les permissions | FAIL |
| File générale des signalements non connectée | Des signalements non vidéo peuvent rester sans traitement | Signalements | OUI | Relier la file, assignation, décision et notification ; le circuit vidéo testé ne couvre pas tout | FAIL |
| Gestion des litiges non connectée | Incidents de réservation sans circuit démontré | Litiges | OUI | Définir et tester le traitement opérationnel complet | FAIL |
| Promotions non connectées | Campagnes non administrables | Promotions | NON si promotions exclues du lancement | Retirer de la promesse de lancement ou connecter dans un lot ultérieur | FAIL |
| Gestion centrale support non connectée | Tickets Client créés mais suivi interne non démontré | Support | OUI | Relier tickets, réponse et clôture, puis retester Client ↔ agent | FAIL |
| Gestion des administrateurs non connectée | Attribution/révocation dépend d’interventions techniques | Administrateurs | OUI sans procédure contrôlée documentée | Circuit restreint d’attribution/révocation audité et testé | FAIL |
| Matrice des rôles non administrable | Permissions difficiles à inspecter et maintenir | Rôles et permissions | OUI pour administration autonome ; sinon procédure technique obligatoire | Écran connecté ou procédure de moindre privilège testée | FAIL |
| Console de sécurité non connectée | Sessions et alertes non supervisées depuis cette rubrique | Sécurité | OUI sans contrôle opérateur alternatif | Superviser sessions/révocations/facteurs ; le correctif MFA ne connecte pas ce menu | FAIL |
| Objets de fondation commerciale absents | Dashboard Lancement et cohortes indisponibles | Lancement / Cohorte | NON si ces outils sont exclus ; OUI pour la validation annoncée | Traiter la parité schéma/frontend dans un lot contrôlé | FAIL |
| Santé charge des dépendances absentes | Pilotage défaillant, faux zéros possibles | Santé plateforme | OUI | Corriger dépendances et état des mesures ; retester les erreurs API | FAIL |
| Paiements mock | Aucun encaissement réel prouvé | Paiements / commissions / reversements | OUI pour encaissement ; NON pour réservation sans paiement explicitement annoncée | Maintenir désactivé jusqu’à validation d’un prestataire réel, conformément à AGENTS.md | NOT TESTED |

## Chaque réserve de sécurité historique

| Problème | Risque | Fonction concernée | Bloquant avant lancement | Correction nécessaire | Statut |
|---|---|---|---|---|---|
| 40 fonctions SECURITY DEFINER exécutables par anon | Privilège du propriétaire si garde interne incomplète | RPC publiques, dont fonctions administratives | OUI jusqu’à qualification complète | Révoquer accès inutiles ; éprouver chaque garde et accès légitime | NOT TESTED |
| 99 fonctions SECURITY DEFINER exécutables par authenticated, avec recouvrement des 40 | Contournement RLS potentiel | RPC métier et administratives | OUI jusqu’à qualification complète | Examen fonction par fonction ; tests d’isolation et d’autorisation | NOT TESTED |
| `btree_gist` dans public | Surface/organisation d’extension non durcie | Contraintes et index spécialisés | NON à lui seul | Migration de schéma d’extension préparée et testée ; ne pas déplacer à l’aveugle | NOT TESTED |
| `pg_net` dans public et droits de file détenus par Supabase | Exposition de requêtes réseau internes si grants inadaptés | Ordonnanceur d’e-mails | OUI pour clôturer la réserve historique | Vérifier droits effectifs avec le propriétaire plateforme ; contrôler contenu et accès à la file | NOT TESTED |
| Ancien secret réutilisable dans la file HTTP | Réutilisation d’un secret d’ordonnanceur | Dispatch e-mails | OUI historiquement | Correctif HMAC horodaté antérieur présent ; appel anonyme 401 et idempotence revalidés, revue résiduelle de file non refaite | PASS |
| Protection mots de passe compromis désactivée | Un mot de passe déjà divulgué peut être accepté | Auth e-mail/mot de passe | OUI pour clôturer la réserve d’authentification avant ouverture publique | Activer l’option ou établir une mesure compensatoire testée ; aucune modification de plan facturant implicite | FAIL |
| RLS sans politique sur `financial_rate_limits` | Aucune lecture/écriture directe ; risque surtout de mauvais futur grant | Limitation financière interne | NON si accès exclusivement serveur confirmé | Maintenir le refus par défaut et tester ses consommateurs | NOT TESTED |
| RLS sans politique sur `post_booking_clicks` | Écriture directe refusée ; suivi doit passer par RPC | Mesure clic Réserver | NON si RPC contrôlée | Vérifier le circuit RPC et les refus directs | NOT TESTED |
| RLS sans politique sur `post_shares` | Écriture directe refusée ; métriques potentiellement absentes | Mesure partage | NON si RPC contrôlée | Vérifier RPC et absence de fausse promesse de partage natif | NOT TESTED |
| RLS sans politique sur `video_views` | Écriture directe refusée ; métriques doivent passer par RPC | Vues vidéo | NON si RPC contrôlée | Vérifier consommateurs et limites anti-abus | NOT TESTED |
| MFA des comptes internes | Un indicateur seul ne protège rien | Administration | OUI | Deux failles serveur corrigées ; compléter inventaire des comptes et récupération de facteur | PASS |

L’inventaire **nominatif des 99 fonctions**, avec les grants anon/authenticated, est dans [MATA_BEAUTY_SECURITY_RESERVES_2026-10-06.md](MATA_BEAUTY_SECURITY_RESERVES_2026-10-06.md). Les tests ponctuels réussis ne sont pas présentés comme une qualification exhaustive. Aucun ERROR dans l’advisor n’équivaut à une certification de sécurité.

Le relevé refait après migration compte **40 fonctions anon et 100 authenticated** : l’unique ajout est `admin_mfa_required()`, qui ne retourne que l’exigence MFA de la session courante et dont l’accès anon est révoqué. Les autres familles restent identiques : deux extensions publiques, quatre tables RLS sans politique et protection des mots de passe compromis désactivée. Le nouvel helper est exercé par le parcours MFA ; il ne lève aucune des 99 réserves historiques.

## Couverture et preuves conservées

- `work/final-audit/production-version-90296f9.json` et `production-version-822ea08.json` : versions effectivement comparées.
- `work/final-audit/final-production-acceptance` : premier passage, y compris l’échec de pagination et la mauvaise configuration WebKit.
- `work/final-audit/final-video-webkit` : nouvelle suite vidéo, **10 tests réussis**, sans modification du lecteur. Le run a commencé avant la bascule et s’est terminé après ; les scénarios métier finaux ont été exécutés sur le domaine pendant cette fenêtre. Ce n’est pas une preuve de conservation d’un même build pour chaque seconde du run.
- `work/final-audit/postdeploy-video-stable-822ea08` : **3 tests réussis en 2,3 minutes, entièrement après déploiement sur 822ea08** : publication MP4, photo/avant-après, puis feed/interactions/profil/prestation/réservation et consultation des deux comptes. Un premier lancement au filtre mal encodé a été interrompu ; ses quatre comptes et documents ont été nettoyés séparément avant ce résultat final.
- `work/final-audit/catalog-dossier-822ea08` : **3 tests réussis après déploiement** (catégories, Salon, candidature complète).
- `work/final-audit/direct-routes-822ea08` : **6 scénarios réussis** (Client, Pro, Onboarding, Support, Modérateur, Admin), y compris URLs directes Client/Pro.
- `work/final-audit/mfa-preview`, `mfa-scroll-822ea08` : second facteur testé Preview et production, scénario de molette Super Admin.
- `work/final-audit/dossier-scroll-822ea08` : dossier complet et molette aux trois résolutions desktop, **1 test réussi** après déploiement.
- `work/final-audit/final-role-security.json` : refus API sur base production, dont les deux failles corrigées.
- `work/final-audit/part3-production-email.json` : ordonnanceur réel à 01:20:01 UTC, référence Resend `01a10ecb-d59a-7011-a6a1-a3229f88f722`.
- `work/final-audit/welcome-production.json` : bienvenue à 01:24:09 UTC, référence Resend `01a10ecf-a772-7199-abcd-41fdc8447345`.
- `work/final-audit/public-interactions.json` : inventaire public ; une entrée sans action exécutée reste NOT TESTED.
- Captures locales : auth par taille, dossiers par taille, PDF, profils, `nearby-manual-production.png`. Les preuves contenant des liens privés ne sont pas publiées.

Un incident du test de déconnexion a été identifié : le lanceur naviguait avant la fin de la requête de logout. Le scénario attend désormais le retour à l’accueil avant de vérifier la route protégée. Un autre échec de sélecteur attendait une page de refus sur `/admin/users`, alors que le serveur renvoie correctement `acces=refuse`. Les assertions ont été ajustées aux deux comportements légitimes, puis retestées ; aucune permission n’a été assouplie.

## Liste exacte des éléments restant avant ouverture générale

1. Terminer la qualification nominative des RPC SECURITY DEFINER, fermer les grants inutiles et prouver les accès/refus ; traiter la réserve pg_net et la protection des mots de passe compromis.
2. Revoir l’historique des approbations professionnelles antérieures au correctif et la politique MFA de tous les comptes internes ; tester récupération/révocation/expiration de session.
3. Rendre opérants les circuits nécessaires d’assistance, litiges, avis et signalements hors vidéo ; tester demande Client → agent → décision/réponse → notification Client. Conserver un circuit contrôlé pour les rôles et sessions.
4. Corriger le décalage de fondation commerciale et la page Santé plateforme, puis refaire les contrôles d’erreurs 404 et de valeurs affichées. Décider explicitement quelles rubriques non connectées sont exclues du lancement.
5. Tester une vraie première inscription Google avec un compte inédit ; vérifier la bienvenue dans une boîte humaine, son contenu et ses liens. Le compte existant et le transport Resend ne suffisent pas.
6. Finir les mutations non exécutées du Pro indépendant : création/modification/suppression prestation, horaires, disponibilité, localisation ; refus de candidature, suspension/réactivation selon permission ; upload de photo et variantes de favoris.
7. Exécuter concurrence de réservation, double clic, créneau occupé, annulation/modification/reprise, refresh et perte réseau ; retester les notifications de chaque événement jusqu’au clic et état lu des deux destinataires.
8. Compléter le réseau lent/hors ligne, timeout, fichiers vidéo lourds/invalides, session expirée, lecture prolongée/mémoire et partage natif. Reproduire ou lever la réserve de pagination du premier run.
9. Faire le GPS réel, le trackpad matériel et les essais sur téléphones physiques. Les émulations et la molette automatisée ne remplacent pas ces preuves.
10. Refaire une recette finale sans interruption de version, avec inventaire de chaque contrôle réellement visible et tous les NOT TESTED ci-dessus levés ou explicitement exclus du périmètre. Maintenir les paiements réels désactivés tant que le fournisseur n’est pas validé.

**Décision C — NON PRÊT.** Des parcours critiques réels fonctionnent et les deux failles reproduites sont corrigées. Cela ne suffit pas pour annoncer que l’application entière est prête, compte tenu du pilotage défaillant, des circuits administratifs incomplets et des réserves de sécurité et de recette non levées.
