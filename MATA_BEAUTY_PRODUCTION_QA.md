# MATA Beauty — audit de production en cours

Date : 5 octobre 2026. Domaine confirmé explicitement par le propriétaire : **https://mata-beauty.com/**. La mention initiale `matasbeauty.com` était incorrecte ; aucune modification de ses DNS n'a été effectuée.

## État de validation

**Audit exhaustif incomplet ; ouverture au grand public non certifiée.** Dernier commit applicatif déployé : `e7821ef60b2c1088e89399a9d5d5bab298695893`, déploiement `dpl_2Wvq3CmXb6CbGbRM8M3iusHdJMUV`. Version réellement servie par mata-beauty.com vérifiée (15 assets identiques au déploiement). Le dernier correctif résout une prestation publiée après le chargement du catalogue : régression locale desktop/mobile 2/2 PASS et Preview réelle 3/3 PASS. Retest métier production 3/3 PASS sur mata-beauty.com : publication MP4, photo/avant-après, interactions et réservation ; démarrage vidéo 1 102 ms, données temporaires nettoyées. Recette étendue précédente 2d705be : Preview 14/14 PASS ; production 13 PASS, un échec de fixture de messagerie, puis messagerie retestée 1/1 PASS. Lecture, réservation persistée, pagination et WebKit passent dans ce passage ; aucune réapparition de record_video_view. Google réel reconnecté sur le bon domaine, session conservée, compte unique ; réservation fictive créée, visible puis annulée et nettoyée. Détails, réserves et matrice : [MATA_BEAUTY_FINAL_RECIPE.md](MATA_BEAUTY_FINAL_RECIPE.md).

Les sections ci-dessous décrivent aussi des passages antérieurs ; leurs échecs ne doivent pas être confondus avec le dernier état. Le GPS réel sur téléphone, l'exhaustivité de tous les contrôles et plusieurs cas limites restent à valider. Une lenteur vidéo intermittente supérieure au seuil initial de cinq secondes a été conservée dans l'historique, malgré des démarrages ultérieurs mesurés à 468 ms en Preview et 2 027 ms en production.

Déploiement intermédiaire historique : `dpl_EFM2XkmCSBAPwCwiLpFowcWYgL6n`, https://mata-beauty-i1niaksq6-africrm.vercel.app/, alias https://mata-beauty.com/. Preuve de ce passage : HTTP 200 sur les deux destinations, 15 fichiers JavaScript référencés sur chacune, zéro différence entre leurs chemins, navigation Messages présente et ancien splash absent sur le domaine public. Interface également vérifiée dans le navigateur après actualisation.

Production au début de l'audit : `dpl_D2M73dHwwTLtc34QzPHcotooEpSS`, `mata-beauty-p48ihaevn-africrm.vercel.app`, Vercel READY. Le champ Git SHA interrogé est absent ; ce déploiement ne peut pas être assimilé au dernier commit. Son interface contient encore l'ancienne navigation et le splash.

Preview de référence : https://mata-beauty-cdcgpyt24-africrm.vercel.app/ (`dpl_2frcJJCJ1of23Jhnm3Z5iPKiPvYf`, code applicatif `b3f5962`). Voir les réserves du rapport `MATA_BEAUTY_ULTRA_SIMPLE_FINAL_ACCEPTANCE.md` : les anciens résultats ne prouvent pas une validation intégrale de production.

| Zone | Action testée | Résultat attendu | Résultat observé | Statut | Correction |
|---|---|---|---|---|---|
| Production | GET HTTPS domaine principal | Application et version attendue accessibles | HTTP 200 ; 15 assets JavaScript identiques au déploiement 7aab68d ; nouvelle navigation vérifiée | PASS version | Déploiement effectué |
| Production | GET HTTPS www | HTTPS accessible | HTTP 200 | PASS accès | Redirection canonique à approfondir |
| Configuration | URL publique de production | Domaine confirmé | NEXT_PUBLIC_APP_URL = https://mata-beauty.com | PASS | Aucune |
| Configuration | Backend de production | Projet de production | qjdwxdbvrxedyfolnpol.supabase.co | PASS identification | Aucune |
| Paiement | Variables et API capabilities | Pas de paiement réel | Mode mock ; onlineCheckoutEnabled=false | PASS | Aucune |
| Google | API providers | Google activé | HTTP 200, google=true | PASS activation | Aucune |
| Google | Profil → Continuer avec Google | Retour domaine officiel et session active | Avant : mauvais domaine vercel.app ; après correction : mata-beauty.com/app, profil connecté | PASS production après déploiement | QA-AUTH-002 |
| Google | Refresh, logout, route protégée, reconnexion | Session conservée puis accès refusé hors session ; retour au profil après reconnexion | Parcours réellement cliqué ; /app/profile connecté, refus connexion=requise après logout, reconnexion au profil ; aucune erreur console relevée | PASS production après déploiement | QA-AUTH-002 |
| Vidéo | Feed actuel de production | Contenu ou état vide clair | État « Les premières inspirations arrivent » | PASS état vide uniquement | Lecture impossible à qualifier sans vidéo |
| Réservation | Disponibilités HTTP 503 | Erreur distincte de zéro créneau, reprise possible | Avant : faux état vide ; après : erreur, Réessayer, créneaux rechargés | PASS local desktop/mobile 390 | QA-BOOK-001 |
| Réservation | Parcours classiques et vidéo, reprise du brouillon | Confirmation et contexte conservés | 8 tests existants PASS desktop/mobile ; API simulée | PASS local, portée limitée | Aucune |
| Auth locale | Faux jeton vers route protégée | Refus serveur et redirection | 4 tests dépassent 15 s ; échec reproduit isolément | À INVESTIGUER | Ne pas assimiler à un test RLS réel |
| Production | Publication réelle MP4, photo et avant/après | Upload et publication persistants | Tests réels PASS sur mata-beauty.com | PASS | Données temporaires nettoyées |
| Production | Feed → lecture → réservation | Lecture puis réservation | Dernier passage : parcours complet PASS ; deux essais antérieurs dépassent 5 s au démarrage | PASS parcours, réserve de stabilité | Aucun changement du lecteur |

## QA-BOOK-001

**Écran :** réservation, choix du créneau.

**Étapes de reproduction :** ouvrir une vidéo, cliquer Réserver, répondre HTTP 503 à `get_available_slots`.

**Résultat observé avant correction :** « Aucun créneau publié ce jour », sans mention de panne ni possibilité explicite de relance.

**Résultat attendu :** distinguer une indisponibilité technique d'une réponse valide vide ; permettre une nouvelle tentative ; borner l'attente réseau.

**Cause technique :** la réponse en erreur était convertie en tableau vide, puis rendue par la branche « aucun créneau » ; pas de délai maximal explicite.

**Fichiers concernés :** `app/mata-beauty-app.tsx`, `tests/e2e/booking-audit.spec.ts`.

**Correction effectuée :** état d'erreur dédié, bouton Réessayer, annulation après 15 secondes et à la fermeture/changement de date. Le module vidéo n'est pas modifié.

**Test après correction :** reproduction échouant avant correction ; test HTTP 503 → message → relance → créneau 10:00 PASS sur desktop et mobile 390. Le délai maximal est implémenté mais son scénario chronométré n'est pas encore testé.

**Statut Preview :** déployé sur https://mata-beauty-12o3aa0ta-africrm.vercel.app/ (`dpl_24qZiFWbo7FBKmFKYwSVWqZVrbgb`). Suite réelle vidéo/réservation : 10/10 PASS en 5,8 minutes, avec nettoyage contrôlé des comptes et médias QA. L'erreur intermittente `record_video_view` n'a pas été reproduite dans cette exécution ; cela ne démontre pas sa disparition définitive.

**Statut production / mata-beauty.com :** correctif déployé dans 7aab68d ; parcours réel feed → lecture → réservation → confirmation → messages → historique → prestation terminée → avis PASS dans le dernier passage complet. Les cas limites ne sont pas tous couverts.

## QA-AUTH-002

**Écran :** connexion Google depuis le domaine officiel.

**Étapes de reproduction :** Profil → Continuer avec Google → connexion/autorisation effectuée par le propriétaire.

**Résultat observé :** retour vers `mata-beauty.vercel.app/` avec un code OAuth, hors de la route callback du domaine de départ ; session non établie sur le domaine officiel.

**Résultat attendu :** callback sur `mata-beauty.com/auth/callback`, échange PKCE et session active sur le même domaine.

**Cause technique :** configuration Supabase distante `auth.site_url=https://mata-beauty.vercel.app` et absence des callbacks du domaine personnalisé dans `auth.additional_redirect_urls`.

**Fichiers concernés :** aucun code applicatif modifié pour OAuth. Configuration distante Supabase production `qjdwxdbvrxedyfolnpol`.

**Correction effectuée :** URL principale `https://mata-beauty.com` ; ajout des chemins exacts `/auth/callback` et `/auth/update-password` pour domaine principal et www. Anciennes redirections conservées. Configuration minimale préparée dans `work/oauth-production/supabase/config.toml` ; diff inspecté ; seulement deux propriétés déclarées poussées. Aucun secret modifié. Relecture distante : zéro différence sur ces propriétés.

**Test après correction :** connexion réelle → `/app?auth=google&intent=client&profile=complete` ; refresh conservant la session ; profil protégé accessible ; logout ; accès direct `/app/profile` refusé avec `connexion=requise` ; reconnexion Google vers `/app/profile` ; zéro erreur console relevée sur ce parcours.

**Statut Preview :** backend QA distinct, non concerné par cette correction de configuration.

**Statut production / mata-beauty.com :** connexion, refresh, logout, refus de route protégée et reconnexion retestés après déploiement. Un seul compte utilisateur correspondant au compte Google testé en base après plusieurs connexions. Aucune erreur console relevée sur ce parcours. La déconnexion n'a pas été instantanée ; l'interface ne montre pas d'état d'attente. Nouvel utilisateur, refus de consentement, expiration et fermeture/réouverture du navigateur restent à tester.

## QA-API-003 — dépendances SQL absentes en production

**Écrans :** catalogue et espace professionnel.

**Reproduction :** chargement du catalogue puis connexion professionnelle pendant la recette réelle de production.

**Observé :** HTTP 400 sur la sélection `categories.image_position` et HTTP 404 sur `get_provider_launch_checklist`. La fonction et la colonne sont absentes en production, présentes en QA.

**Cause :** décalage entre les migrations applicatives et celles appliquées sur le backend de production.

**Correction :** migration ciblée `supabase/migrations/20261005163809_restore_production_launch_dependencies.sql` : une colonne nullable, les deux fonctions de calcul/checklist déjà existantes en QA et leurs permissions explicites. Aucune nouvelle table, aucun déclencheur, aucune tâche planifiée, aucune mise à jour des catégories existantes. Appliquée d'abord en QA puis en production ; existence des objets et refus d'EXECUTE anonyme vérifiés.

**Limite de déploiement :** le regroupement complet des anciennes migrations a été refusé par le contrôle automatique pour son périmètre trop large (tables, triggers, RLS, données et cron). Il n'a été appliqué nulle part. La migration ciblée ci-dessus constitue l'alternative acceptée ; les autres dépendances historiques restent à auditer, sans prétendre à une parité complète des bases.

**Advisors :** exécutés après migration. Avertissements sur des fonctions SECURITY DEFINER accessibles aux rôles API, l'extension btree_gist en public et la protection des mots de passe compromis désactivée. Ces signalements demandent un examen fonction par fonction ; ils ne démontrent pas à eux seuls un accès indu. [Guide des fonctions exposées](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

**Nettoyage du premier passage production :** zéro compte temporaire restant pour l'identifiant de suite `1791217797752-6eb2fe`, confirmé en base après afterAll.

## Contrôles restant à terminer

- Google : parcours après déploiement et unicité du compte vérifiés ; restent nouvel utilisateur, refus/annulation, expiration et réouverture navigateur.
- Vidéo : reproduire et diagnostiquer l'erreur intermittente `record_video_view` du précédent audit ; tester erreurs, mémoire, lecteurs concurrents et mobile.
- Réservation : concurrence et rejouage réels, annulation, notifications, adresse exacte du salon, cohérence prix/durée et historique des deux parties.
- Inventaire complet des interactions de tous les espaces réellement accessibles ; recherche et filtres ; publication et services professionnels ; états de panne.
- Retester chaque prochain correctif sur Preview puis sur le domaine public ; le déploiement 7aab68d et sa preuve de version sont déjà réalisés.

## Complément de recette — passage 1791219364631-eba3e0

Suite réelle sur mata-beauty.com : 9 PASS / 1 échec, durée 5,8 minutes. Publication MP4, photo, avant/après, RLS des posts, renouvellement des liens signés, lecture/pause/son/scroll, réservation complète, modération, filtres/pagination et cinq largeurs mobiles passent. Le parcours WebKit passe ses assertions d'interface, mais produit une erreur JavaScript sur `record_video_view` lors des navigations ; le contrôle global de fin reste donc rouge. Deux HTTP 404 concernent `launch_feed_selection` dans l'administration. Zéro compte temporaire restant pour ce passage, confirmé par requête après nettoyage.

### QA-API-004 — endpoint d'événements absent

**Écran / reproduction :** terminer une réservation réelle ; appel `record_product_event`.
**Observé / attendu :** HTTP 404 au lieu d'un enregistrement d'événement.
**Cause :** dépendance SQL non déployée en production.
**Correction :** migration ciblée `20261005165335_restore_product_event_endpoint.sql`, table `product_events`, RLS, lecture administrateur et RPC existante avec validations. Aucun déclencheur ni cron. Lecture anonyme et insertion directe authentifiée interdites ; RPC anonyme volontairement permise avec restrictions.
**Tests :** application QA puis production ; contrôle des permissions ; appel anonyme QA dans une transaction annulée, zéro ligne de test persistante. Aucun 404 sur cet endpoint dans le passage complet suivant.
**Preview / production / domaine :** migration appliquée aux deux bases ; dernier parcours réel production PASS sur cette dépendance.

### Fixtures et nettoyage

Le message de test contenant l'identifiant numérique du passage était refusé par la protection anti-partage de coordonnées (`MATA_ANTI_CIRCUMVENTION:contact_details`). Le nonce du message utilise désormais des lettres. La protection applicative est conservée. Le nettoyage des réservations utilise désormais les deux identifiants exacts du client et du professionnel temporaires, même si un échec survient avant l'affectation de `bookingId`. Les résidus du passage 1791218723967-8a4c22 ont été supprimés de manière ciblée ; zéro compte de ce passage restant, vérifié en base.

### Réinitialisation de mot de passe

Le formulaire public affiche « Un lien de réinitialisation vient d'être envoyé ». Réception de l'e-mail, ouverture du lien et saisie du nouveau mot de passe en attente de l'utilisateur. Ce message d'interface seul ne prouve pas la livraison.

### QA-API-005 — sélection éditoriale

**Écran / reproduction :** administration, chargement des contenus.
**Observé / attendu :** HTTP 404 sur `launch_feed_selection` au lieu de la liste des sélections.
**Cause :** table absente en production, confirmée par `to_regclass`.
**Correction en cours :** migration ciblée `20261005170418_restore_launch_feed_selection.sql`, table et permissions uniquement. RLS pour lecture des publications actives et gestion réservée aux administrateurs ayant `content.manage`.
**Statut Preview :** migration appliquée ; 3/3 tests ciblés PASS en 2,1 minutes, incluant lecture publique, brouillon masqué, sélection inactive masquée, écritures ordinaires refusées et gestion administrateur.
**Statut production / domaine :** migration appliquée ; RLS activée confirmée ; advisors exécutés sans signalement pour cette table. Retest réel directement sur mata-beauty.com : **3/3 PASS en 1,7 minute**, publication MP4, photo/avant-après et RLS incluant la sélection éditoriale. Nettoyage de fin sans erreur. Le parcours visuel de sélection dans l'administration reste à retester.

**Contrôles du dépôt après modifications :** `pnpm lint`, `pnpm typecheck`, `pnpm test` (14 fichiers, 64 tests), `pnpm build` PASS ; `git diff --check` sans erreur. Aucun code du lecteur vidéo modifié dans ce lot.

Les comptes Google et secrets ne sont pas consignés dans ce rapport. Le document utilisateur `docs/PRODUCTION_READINESS_2026-08-16.md` est laissé intact.
