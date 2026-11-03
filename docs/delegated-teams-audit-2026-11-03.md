# Mata Beauty — livraison des équipes déléguées et audit

Date : 3 novembre 2026. Périmètre : PR #37, commerciale/CRM, finance, service client, délégation et protection des dossiers. Ce document décrit des contrôles de développement ; il ne constitue pas une certification de toute l’application.

## Fonctionnement livré dans le code

| Acteur | Gestion des accès | Données accessibles |
| --- | --- | --- |
| Super Admin | Crée plusieurs équipes par service, nomme/remplace les responsables, désactive une équipe | Ensemble des équipes et activités autorisées |
| Responsable commercial | Recrute/invite, suspend/réactive/retire ses agents, répartit les dossiers et prospects de ses équipes | CRM et historique de ses équipes, visites déclarées, appels, relances et dossiers attribués |
| Commercial | Aucun pouvoir de délégation | Ses prospects et dossiers attribués ; notes, visites déclarées, relances et validation des dossiers complets |
| Responsable financier | Gère ses équipes et répartit leurs dossiers | Vues financières globales autorisées, comptabilité enregistrée, commissions, remboursements et versements en lecture ; suivi des agents |
| Agent financier | Aucun pouvoir de délégation | Ses dossiers attribués et contexte de paiement limité ; aucun accès global aux transactions ni remboursement/versement |
| Responsable service client | Gère ses équipes et affecte les réclamations | Dossiers, messages, notes internes et suivi de ses équipes |
| Agent service client | Aucun pouvoir de délégation | Ses réclamations attribuées ; réponse client, note interne, suivi et résolution |

Les responsables ne peuvent ni créer d’autres responsables, ni se promouvoir, ni administrer une équipe voisine. Les rôles d’agents sont déterminés en SQL à partir du service, jamais à partir d’un champ envoyé par le navigateur. Un agent appartient à une seule équipe active ou suspendue. Un responsable peut superviser plusieurs équipes de son service. Les rôles historiques larges demeurent gérés explicitement par le Super Admin ; ils ne sont pas utilisés pour les nouvelles délégations.

Le responsable doit disposer d’un compte confirmé actif avant sa nomination. Pour un agent existant, l’ajout exige un compte confirmé actif sans autre rôle interne. Pour un nouveau compte : invitation par email ou lien personnel à partager, acceptation, mot de passe puis MFA avant accès à l’espace. Le lien peut être renouvelé, masqué ou l’invitation retirée. Les jetons ne sont ni journalisés ni conservés dans le stockage local du navigateur. Aucun email réel n’a été envoyé pendant cette recette.

Les visites sont déclaratives, sans preuve GPS. Le journal email/WhatsApp du CRM n’envoie pas de message. Un prospect gagné n’approuve jamais automatiquement un professionnel. Un lien CRM ne confère pas un droit KYC : l’affectation du dossier est requise et sa réaffectation retire l’accès à l’ancien agent même si celui-ci garde le prospect.

## Vérifications réellement exécutées

- `pnpm test` : **404 tests réussis, 71 fichiers**, dont 19 scénarios SQL de délégation dans PGlite, les 10 scénarios SQL CRM existants, les contrôles de navigation/permissions, les routes API et l’envoi simulé d’invitations.
- PostgreSQL local : migration réelle, RLS, droits par colonne, fonctions et protections de profils/documents existantes copiées de Test. Identités et claims Auth synthétiques ; aucune identité réelle copiée.
- Scénarios SQL : Super+MFA, interdiction de promotion par responsable, équipes isolées, historique/visites, rôles financiers restreints, remplacement de responsable, versions obsolètes, réaffectation, suspension/révocation, activation serveur idempotente et confirmée, retrait d’invitation, dossier incomplet refusé, quatre documents requis, correction d’une pièce, brouillons vidéo privés, impossibilité de réactiver un ancien rôle après transfert par Super Admin, retrait KYC après réaffectation et désactivation conservant les données.
- API : origine contrôlée, session vérifiée, autorisation SQL indépendante, champs d’élévation rejetés, destinataire issu de la base, réautorisation après génération Auth, partage sans fournisseur email, HTML échappé, idempotence, accusé d’envoi et erreurs sans fuite de jeton. Fournisseur email simulé.
- Navigateur : **10 scénarios réussis** ; recette de l’application Next en mode production, données/API Auth simulées, Chromium 153 sur bureau et largeur mobile 390 px. Parcours : responsable commercial/recrutement/lien conservé, agent finance/suivi/refus des routes administratives, service client/réponse publique et note interne, Super Admin/création de branche, responsable finance/remboursements en lecture seule. Cette recette ne valide pas Supabase Auth/MFA hébergé ni la réception email réelle.
- TypeScript : vérification stricte réussie. Lint : aucune erreur, six avertissements de navigation préexistants.
- Compilation de production : réussie ; compilation isolée Next/webpack de recette également réussie.
- Vérifications Supabase en lecture seule : fonctions d’activation, attribution et cinq fonctions de dossiers identiques entre Test et Production. Les quatre protections de profils/documents sont également identiques après normalisation des fins de ligne. Le contexte administrateur ne diffère que par les fins de ligne. La fonction d’annulation historique reste différente : cette livraison ne la modifie pas.

Les tests navigateur utilisent des sessions et services locaux simulés. Les tests SQL exercent PostgreSQL/RLS avec claims simulés. Leur combinaison ne doit pas être présentée comme une recette réelle complète de Supabase Auth, Storage, PostgREST et email.

## Statut hébergé et limites bloquantes

**Les trois migrations sont appliquées et vérifiées sur Test** (`skrrfronlhoddtgxvezu`). Le blocage de transport précédent est résolu. Les sept tables CRM/équipes/dossiers ont toutes RLS et des politiques actives.

La recette `tests/integration/delegated-teams-rollback.sql` a réussi sur PostgreSQL Test hébergé : refus AAL1, nomination de responsables, isolation des équipes, recrutement, CRM/visites, refus KYC incomplet, réaffectation/retrait des accès, finance restreinte, réponse publique/note privée, remplacement du responsable et révocation. Elle emploie des identités et claims JWT synthétiques dans une transaction annulée ; ce n’est pas un test de connexion Supabase Auth. Une lecture après rollback confirme zéro profil et zéro équipe de recette restants.

La sauvegarde quotidienne de Production du **2 novembre 2026 à 23:09:01 UTC**, type PHYSICAL, a été vérifiée dans le tableau de bord Supabase authentifié du projet `qjdwxdbvrxedyfolnpol`. Aucune restauration n’a été lancée et la restauration n’a pas été testée. Les sauvegardes de base ne contiennent pas les objets Storage ; cette livraison ne les modifie pas. Les définitions actuelles des fonctions de Production ont également été relues avant toute migration.

**Recette Auth/MFA réelle exécutée après autorisation explicite.** Un outil temporaire limité au projet Test, protégé par JWT, capacité aléatoire et expiration d’une heure, a permis la création de comptes synthétiques. Le premier lot a révélé un statut de profil `email_unverified` malgré la confirmation administrative Auth ; le jeu de recette a été corrigé sans modifier les règles applicatives. L’invitation utilise bien le RPC applicatif `synchronize_account_status`.

Les **35 contrôles Auth/API** ont réussi : connexion par mot de passe de dix comptes, enrôlement/challenge/vérification TOTP réelle des neuf comptes internes, refus AAL1, nomination des quatre responsables, recrutement dans les trois services, isolation par JWT réels et PostgREST/RLS, interdiction de gestion par agent et de promotion par responsable, finance restreinte, suspension immédiatement effective avec un jeton existant. **Six contrôles d’invitation** ont aussi réussi : jeton Auth accepté une fois et rejeu refusé, définition du mot de passe/synchronisation du statut, activation directe interdite, activation serveur idempotente, accès interne refusé à AAL1. Ces contrôles n’établissent pas la réception d’un email réel ni un parcours navigateur complet sur Vercel.

Nettoyage : les deux lots de comptes synthétiques ont été bannis et leurs mots de passe rendus inutilisables ; rôles révoqués, équipes désactivées, invitations en attente révoquées. Lecture de contrôle : zéro rôle de recette actif, zéro équipe de recette active et zéro invitation de recette en attente. Les enregistrements et journaux de Test sont conservés, pas présentés comme supprimés. La fonction temporaire a d’abord été neutralisée, puis supprimée définitivement après autorisation explicite ; le connecteur confirme une liste de fonctions Test vide.

**Accès à la recette Vercel débloqué après autorisation explicite.** Le déploiement `dpl_GH7Hwmf4iZ5Kg1vJ7acqkyBsK5HD`, commit `08ecd9c72be07cf20f46dae9fe6730e229aa5648`, est READY, cible `staging`, configuration `codex/global-test-preview-20261031`. Un lien de partage limité à 23 heures a été autorisé. Le connecteur de lecture vérifie `/api/health/server` à 200 avec `ok:true`, une CSP ciblant Supabase Test, les pages `/commercial`, `/finance`, `/admin/teams` à 200 et l’API `/api/department-teams` à 403 sans session. Ces réponses ne sont pas une recette navigateur connectée des composants ; les dix parcours navigateur précédents restent à services Auth simulés.

## Intégration Production du 3 novembre 2026

Les migrations espaces et CRM ont réussi. La première tentative de migration des équipes a échoué sur l’absence en Production de `public.is_public_social_post(uuid)` ; la transaction des équipes a été annulée et l’absence de `department_teams` a été vérifiée. La migration additionnelle `20261103153611_delegated_visibility_compatibility.sql` reprend le prédicat de visibilité déjà versionné dans le dépôt : professionnel approuvé et non suspendu, publication publique publiée à une date passée, prestation principale active, contrôle des signalements. Elle ajoute le helper seulement s’il est absent, révoque PUBLIC/anon et permet authenticated/service_role ; elle ne remplace aucune définition existante et ne modifie aucune politique Storage. Elle a réussi sur Test (sans changement de la définition existante), puis en Production. La migration des équipes a ensuite réussi en Production.

Deux tests PostgreSQL supplémentaires vérifient ce schéma sans helper, les refus de visibilité et la conservation d’un helper existant. Suite finale : 404 tests / 71 fichiers ; TypeScript et compilation réussis, lint sans erreur et six avertissements préexistants.

**Contrôle d’intégrité après migrations : 11 réservations et 1 paiement, nombres et empreintes intégrales identiques avant/après.** Les sept tables CRM/équipes/dossiers ont RLS. `anon` ne peut pas exécuter le contexte des équipes et `authenticated` ne peut pas activer directement une invitation. Aucun rôle n’a été attribué à une personne réelle et aucun mouvement financier n’a été déclenché. Le paiement reste en mode mock. La publication du code officiel et ses contrôles après déploiement suivent cette étape.


Les conseillers sécurité de Test, consultés avant application, signalent des éléments préexistants : 8 tables avec RLS sans politique (accès fermé), une extension dans `public`, 16 fonctions SECURITY DEFINER exécutables par `anon`, 115 par `authenticated`, et la protection contre les mots de passe compromis désactivée. La présence d’un RPC SECURITY DEFINER n’établit pas seule une faille ; ses gardes et privilèges doivent être revus. Ces alertes ne sont pas déclarées résolues par cette livraison. Références : [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [extensions](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [RPC anonymes](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RPC authentifiés](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Ordre d’intégration et limites de recette

Sur une installation où le helper de visibilité manque : espaces, CRM, migration de compatibilité, puis équipes. Sur Test déjà migré, la compatibilité est sans effet. Ne jamais rejouer une migration inscrite. Le code doit être compilé avec les variables Production, sans promouvoir le build utilisant Test. Conserver le déploiement précédent `dpl_8gnhzu4hiYtL9nt3PPd3K3GGM3pH` pour retour arrière.

Les scénarios réels Auth/API et invitation ont été vérifiés sur Test, et les composants au navigateur avec Auth simulé. La réception email réelle et le parcours complet navigateur connecté à Vercel ne sont pas présentés comme vérifiés. Les responsables réels doivent être nommés par le Super Admin avec un compte confirmé actif et MFA ; aucune nomination réelle n’est incluse automatiquement dans la migration.

## Retour arrière conservant les données

Avant publication, conserver le déploiement précédent et une sauvegarde exploitable. Si une migration échoue avant commit, sa transaction annule ses changements. Si une régression apparaît après publication, restaurer le déploiement précédent et exécuter, par opérateur autorisé dans le bon projet, `docs/operations/delegated-teams-disable-preserve-data.sql`.

Ce script désactive les équipes, suspend les adhésions, révoque les nouveaux rôles actifs et les invitations en attente. Il conserve prospects, dossiers, notes et journaux. Son comportement est testé localement. Aucun `DROP`, aucune purge de l’historique et aucune restauration de droits globaux aux agents. La reprise se fait explicitement par le Super Admin, équipe puis agents ; aucun rétablissement massif automatique.

## Reproduction locale

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Pour la recette navigateur : installer les navigateurs Playwright, puis `node scripts/test-e2e.mjs tests/e2e/departments.spec.ts --project=desktop --project=mobile-390 --workers=1`.

Le build de recette est isolé dans `outputs/playwright-stabilization-prod` pour ne pas être effacé par un build `.next`. `MATA_E2E_SKIP_BUILD=true` réutilise uniquement un build local déjà validé, pour relancer des scénarios sans changement applicatif. Un exécutable Chromium disponible peut être fourni via `MATA_PLAYWRIGHT_CHROMIUM_PATH` et ses arguments JSON via `MATA_PLAYWRIGHT_CHROMIUM_ARGS`. Le binaire utilisé ici est un outil de recette externe au dépôt et n’est pas une dépendance de l’application.
