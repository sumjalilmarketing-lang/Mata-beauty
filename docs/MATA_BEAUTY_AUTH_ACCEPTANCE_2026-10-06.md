# MATA Beauty — correctif Auth et recette du 6 octobre 2026

## Actualisation du 7 octobre 2026 — production c8331a7

Sur mata-beauty.com : inscription réelle par formulaire mobile, confirmation SMTP dans un autre navigateur, rôle Client, connexion/déconnexion, bienvenue unique et reset avec nouveau mot de passe puis reconnexion : **7 contrôles PASS**. Resend confirme ensuite `delivered` pour confirmation, bienvenue et reset (destinataire de simulation). Preuves : `work/team-audit/production-smtp.json`, `production-smtp-delivery.json`. Les deux demandes SMTP ont répondu sans 429 ; la limite Supabase avait été portée à 30/h, sans désactivation des protections.

Google : première inscription et réception de bienvenue confirmées par l’utilisateur le 6 octobre ; reconnexion confirmée par l’utilisateur le 7 octobre. Contrôle DB après son action : même identifiant créé le 6 octobre, nouvelle connexion le 7 octobre à 09:00:28 UTC, un seul utilisateur pour cette adresse, une identité Google, un profil Client actif, un seul envoi de bienvenue. Aucune duplication constatée. Le consentement a été effectué par l’utilisateur, pas automatisé.

Événements candidature, complément, nouvelle soumission, approbation, réservation et confirmation : sept e-mails de recette envoyés automatiquement via Resend, une tentative par événement/destinataire, liens canoniques. Les deux confirmations de dossier correspondent à deux soumissions distinctes ; les deux confirmations de réservation concernent deux destinataires. Ce ne sont pas des doublons d’un même événement. Preuve : `work/team-audit/production-transactional-emails.json`. Réception dans une boîte humaine de ces e-mails transactionnels : NOT TESTED.

Le premier essai transactionnel utilisait des adresses de fixture dont la partie locale dépassait 64 caractères ; Resend les a refusées (422). Après correction des seules adresses de test, le parcours passe sans modification de l’application. Ces comptes invalides et leurs données ont été nettoyés.

Le relevé de version et les blocages ci-dessous sont historiques ; le rapport du 7 octobre est la référence actuelle.

## Version réellement servie

- Domaine : https://mata-beauty.com.
- Commit applicatif : `494fefb022d047e39cf01a4a20467bd6b851bc6b`.
- Déploiement : `dpl_25N8x1sZi2o47z7NFV794WGXtzhW`, https://mata-beauty-jkix6stjn-africrm.vercel.app.
- Vérification du 6 octobre à 15:34:27 UTC : HTTP 200, 15 scripts identiques entre domaine et déploiement immuable, backend production présent, backend QA absent.
- Preview du correctif : https://mata-beauty-f27k60sab-africrm.vercel.app. Le dernier ajustement de libellé après refresh et le lien de reconnexion ont ensuite été vérifiés en production.
- Avant commit : `pnpm lint`, `pnpm typecheck`, `pnpm test` (90 tests), `pnpm build` PASS. Ces contrôles ne remplacent pas les parcours navigateur.

## Diagnostic reproduit et corrections

### AUTH-01 — invitation valide, session perdue sur « Nouveau mot de passe »

**Écran :** `/auth/update-password`.

**Reproduction :** invitation Supabase d’un compte de recette isolé ; ouvrir le lien dans un navigateur vierge ; saisir et confirmer un mot de passe ; valider.

**Avant :** message « La connexion n’a pas pu être finalisée… », aucun cookie de session et aucune requête de mise à jour Auth. Un client Supabase de contrôle acceptait pourtant les mêmes jetons : ils étaient valides. L’utilisateur a précisé que son lien provenait d’un e-mail de création de compte, mais ne connaît pas son objet ; ce test reproduit exactement le symptôme sans affirmer avoir retrouvé son e-mail particulier.

**Cause :** le client PKCE rejetait le retour implicite d’invitation contenant les jetons dans le fragment. La page tentait ensuite `updateUser` sans session et masquait `AuthSessionMissingError` derrière le message générique.

**Correction :** extraire le retour, retirer les jetons de l’URL avant initialisation, établir explicitement la session, la vérifier auprès d’Auth, puis seulement autoriser la validation. Conservation de PKCE pour Google. Distinction invitation/récupération, gestion d’erreurs utiles, verrou de soumission, reconnexion après mise à jour.

**Fichiers :** `lib/auth/password-session.ts`, `app/auth/update-password/page.tsx`, `lib/auth/errors.ts`.

**Preview : PASS. Production/mata-beauty.com : PASS.** Invitation et récupération valides, refresh avant modification, un PUT, reconnexion avec le nouveau mot de passe. Liens manquants/inutilisables bloqués avant soumission.

### AUTH-02 — confirmation d’inscription et réinitialisation insuffisamment séparées

**Cause :** inscription sans destination explicite ; callback existant destiné à Google ; dépendance au vérificateur PKCE lorsqu’un e-mail est ouvert ailleurs.

**Correction :** route serveur `/auth/confirm` séparée de Google, vérification Supabase du jeton à usage unique et du type ; création/synchronisation du profil existante côté serveur ; inscription vers le profil Client, invitation/récupération vers le choix de mot de passe. Confirmation de mot de passe, nom complet requis, liens légaux, consentement et garde contre double soumission dans le formulaire. L’inscription publique ne demande aucun rôle privilégié.

**Fichiers :** `app/auth/confirm/route.ts`, `app/auth-modal.tsx`, `app/mata-beauty-app.tsx`, `supabase/auth-templates/`.

**Preview : PASS. Production/mata-beauty.com : PASS** pour les trois types de liens ouverts dans un autre contexte navigateur, session vérifiée et rôle Client ; deuxième utilisation refusée. Une inscription réellement envoyée depuis le formulaire et son e-mail SMTP ont également ouvert le profil Client en production.

### AUTH-03 — transport des e-mails Auth non raccordé à Resend

**Cause :** Resend était configuré pour le bienvenue applicatif, mais Supabase Auth utilisait encore son transport par défaut.

**Correction appliquée :** SMTP `smtp.resend.com:465`, expéditeur `bonjour@mata-beauty.com`, clé existante côté service uniquement ; trois modèles français distincts ; ajout de `/auth/confirm` aux retours autorisés du domaine et de www. Paramètres Google, confirmation obligatoire et MFA conservés. Configuration appliquée par patch limité après examen du diff.

**Production : PASS pour l’envoi et le lien de confirmation.** Deux inscriptions de recette ont produit chacune une confirmation et un bienvenue, événement Resend `delivered`. Les destinataires sont les adresses officielles de simulation `delivered+…@resend.dev` : **cela ne prouve pas la réception dans Gmail/Outlook ni une lecture humaine**.

### AUTH-04 — plafond global résiduel de 2 e-mails/heure

**Reproduction :** après deux confirmations, une nouvelle inscription renvoie HTTP 429, `over_email_send_rate_limit`. Le tableau de bord affiche 2 e-mails/h.

**Impact :** inscriptions et récupérations suivantes bloquées jusqu’au renouvellement du quota. Bloquant pour lancement.

**Statut : FAIL.** Relèvement proposé à 30 e-mails/h ; confirmation demandée et encore attendue. Aucun changement de plafond effectué. Les limites par IP des connexions/vérifications ne sont pas concernées. La CLI marque ce réglage « unmanaged » : le diff CLI ne vaut pas application du réglage.

## Recette réelle du correctif

| Zone | Action réellement testée | Résultat observé | Statut |
|---|---|---|---|
| Invitation ancienne | Lien valide, navigateur vierge, refresh, création du mot de passe, reconnexion | Session restaurée, un PUT, identifiant utilisateur conservé | PASS |
| Récupération ancienne | Lien valide, changement du mot de passe, connexion | Nouveau mot de passe accepté | PASS |
| Confirmation serveur | Signup, invite et recovery dans un autre navigateur | Cookies créés, destination correcte, Client actif | PASS |
| Usage unique | Réouvrir les trois liens dans un contexte vierge | Retour invalide, aucune session créée | PASS |
| Session absente | Ouvrir directement la page de mot de passe | Bouton désactivé, nouveau lien proposé | PASS |
| Connexion | Mauvais puis bon mot de passe | Erreur utile puis vrai profil Client | PASS |
| Session | Refresh du profil puis révocation serveur | Profil conservé avant révocation, accès protégé refusé ensuite | PASS |
| Routes internes | Client ouvre Onboarding, Admin et Super Admin directement | Onboarding redirige ; portail Admin affiche « Compte non autorisé » | PASS |
| Rôles/API | 24 contrôles Client/Pro/Admin | Auto-attribution et auto-approbation refusées, MFA et révocation conservées | PASS |
| Inscription mobile | Nom/e-mail/mots de passe/consentement, double clic réel | Une requête signup, compte Client et confirmation SMTP | PASS |
| Google mobile | Position et largeur du bouton à 390 px | Bouton accessible, sans débordement horizontal | PASS |
| Bienvenue | Deux nouveaux comptes puis reconnexion de chacun | Un seul message de bienvenue par compte dans Resend | PASS |
| Réinitialisation complète par SMTP | Demande puis réception et ouverture du nouvel e-mail | Reste à exécuter après résolution du quota | BLOCKED |
| Téléphone physique | Android, iPhone, clavier natif | Aucun appareil physique contrôlé dans cette passe | NOT TESTED |

Les 11 contrôles du script `scripts/verify-auth-returns.mjs` ont passé en Preview puis sur le domaine. Le contrôle de session révoquée ne prouve pas une expiration naturelle attendue jusqu’au terme du JWT. Le portail `/admin` conserve son écran public d’authentification/refus ; le refus des données et opérations est testé séparément. Cette observation ne clôt pas la matrice RBAC historique entière.

## Matrice Auth des 17 cas demandés

| # | Cas | Statut | Portée exacte |
|---|---|---|---|
| 1 | Nouveau Client + e-mail | PASS | Formulaire, SMTP, confirmation ouverte dans un autre navigateur, Client actif ; destinataire Resend de simulation |
| 2 | Nouveau Client + Google | BLOCKED | Sélection/consentement du nouveau compte humain manquants |
| 3 | Client existant + e-mail | PASS | Connexion navigateur avec mot de passe, bon profil |
| 4 | Client existant + Google | NOT TESTED | Pas rejoué sur ce déploiement |
| 5 | Mauvais mot de passe | PASS | Refus réel d’Auth affiché utilement |
| 6 | Mot de passe oublié | BLOCKED | Transport configuré ; parcours SMTP complet bloqué par quota |
| 7 | Nouveau mot de passe | PASS | Invitation et récupération valides, mise à jour et reconnexion réelles |
| 8 | Lien reset expiré | NOT TESTED | Retour `otp_expired` simulé et liens consommés refusés ; expiration naturelle non attendue |
| 9 | Logout | PASS | Bouton de déconnexion réellement cliqué après inscription et reconnexion |
| 10 | Reconnexion | PASS | Même identifiant Client et données de profil |
| 11 | Refresh avec session | PASS | Profil Client et page de mot de passe conservés |
| 12 | Session expirée | NOT TESTED | Session révoquée testée PASS ; expiration naturelle non exercée |
| 13 | Google annulé | NOT TESTED | Aucun refus humain rejoué dans cette passe |
| 14 | Google première inscription | BLOCKED | Compte humain vierge requis |
| 15 | Même Google deuxième connexion | BLOCKED | Dépend du passage Google réel |
| 16 | E-mail existant + Google | BLOCKED | Identité Google vérifiée correspondante requise ; aucun rattachement artisanal ajouté |
| 17 | Double clic création compte | PASS | Double clic navigateur, une requête signup et un compte |

## Non-régression après déploiement

Sur `mata-beauty.com`, quatre scénarios navigateur PASS : publication MP4 réelle ; publication photo/avant-après ; feed, interactions, profil, prestation et réservation vérifiée des deux côtés ; signalement/modération/audit/restauration. Le scénario de réservation inclut une panne 503 puis reprise. Aucun code vidéo modifié.

Les 24 contrôles API de rôle passent également après déploiement. Ils incluent l’interdiction de l’auto-approbation, des rôles Admin/Super Admin et des métadonnées falsifiées, MFA à AAL1, révocation administrative et protection du Super Admin contre une suspension indirecte. Les réserves exhaustives SEC-R01 et SEC-R02 du rapport historique restent ouvertes.

Deux scénarios navigateur supplémentaires passent sur le domaine : candidature avec quatre documents, PDF, revue et approbation avant accès Pro ; MFA administratif avec mauvais code refusé, bon code accepté, refresh, déconnexion et nouveau défi à la reconnexion. Le contrôle MFA inclut la molette à 1366×768, 1440×900 et 1920×1080 ; ce n’est pas un test de trackpad physique.

Le parcours complet **inscription publique → Inspiration → Explorer → Près de moi → réservation → notification** n’a pas été exécuté d’un seul tenant avec le compte SMTP nouvellement inscrit : **NOT TESTED**. Les sous-parcours ci-dessus ne sont pas additionnés pour inventer ce PASS.

## Preuves et limites

- `work/auth-audit/invite-before.json` : reproduction initiale avec jetons valides, aucune session, erreur générique.
- `work/auth-audit/preview-returns-expanded/results.json` : 11 contrôles Preview PASS, nettoyage effectué.
- `work/auth-audit/production-returns/results.json` : 11 contrôles domaine PASS, nettoyage effectué.
- `work/auth-audit/mail-evidence.json` : confirmations et bienvenue des deux destinataires simulés, chacun un bienvenue.
- `work/auth-audit/smtp-flow.json` : dernier essai bloqué par HTTP 429 ; les essais précédents ont aussi rencontré des erreurs du script de recette (nom de colonne, nettoyage de cookie), corrigées sans modifier l’application.
- `work/auth-audit/config-push.log` : patch SMTP, modèles et redirections ; secrets masqués.
- `work/final-audit/production-version-494fefb.json` : identité du déploiement servi.
- `work/auth-audit/video-regression/` et `work/final-audit/final-role-security.json` : non-régression production.
- `work/auth-audit/mfa-application-regression/` : deux scénarios candidature et MFA PASS en production.

Les preuves de travail restent ignorées par Git. Aucun mot de passe, jeton, fichier `.env` ni clé serveur commis. Les comptes temporaires sont dédiés à la recette ; le compte utilisateur réel n’a pas été modifié.

Références : [sessions par e-mail Supabase](https://supabase.com/docs/guides/auth/auth-email-templates), [SMTP Resend pour Supabase](https://resend.com/docs/send-with-supabase-smtp), [destinataires de simulation Resend](https://resend.com/docs/dashboard/emails/send-test-emails), [quotas Auth](https://supabase.com/docs/guides/auth/rate-limits).

## Conclusion

**C — NON PRÊT. AUTH CLIENT reste FAIL pour la validation de lancement.** Le blocage de session signalé est corrigé et retesté en production. Restent : quota d’envoi à corriger après confirmation ; parcours complet SMTP de récupération ; réception humaine ; première et deuxième connexions Google et rattachement sûr ; parcours complet post-inscription ; expirations naturelles et mobile physique. Les réserves globales du rapport `MATA_BEAUTY_LAUNCH_BLOCKERS_2026-10-06.md` restent applicables.
