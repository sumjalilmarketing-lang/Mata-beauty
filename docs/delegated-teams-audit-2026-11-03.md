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

- `pnpm test` : **402 tests réussis, 70 fichiers**, dont 19 scénarios SQL de délégation dans PGlite, les 10 scénarios SQL CRM existants, les contrôles de navigation/permissions, les routes API et l’envoi simulé d’invitations.
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

**La validation de production reste suspendue à la recette Auth/MFA réelle.** La revue automatique de sécurité a refusé le déploiement d’un outil temporaire de recette privilégié sur Test, car il aurait créé un point d’accès capable de gérer des comptes et attribuer des droits. Cet outil n’a pas été déployé. Le test transactionnel ci-dessus ne crée aucun point d’accès persistant et ne remplace pas cette recette Auth.

Aucune nouvelle migration en Production, fusion de PR, nomination réelle, import de prospects ou modification des réservations/paiements existants n’a été effectuée. Le code ne déclenche aucun paiement réel et conserve le mode mock.

Les conseillers sécurité de Test, consultés avant application, signalent des éléments préexistants : 8 tables avec RLS sans politique (accès fermé), une extension dans `public`, 16 fonctions SECURITY DEFINER exécutables par `anon`, 115 par `authenticated`, et la protection contre les mots de passe compromis désactivée. La présence d’un RPC SECURITY DEFINER n’établit pas seule une faille ; ses gardes et privilèges doivent être revus. Ces alertes ne sont pas déclarées résolues par cette livraison. Références : [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [extensions](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [RPC anonymes](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RPC authentifiés](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Intégration restante, dans l’ordre

1. Terminé : appliquer les migrations sur Test via le connecteur et contrôler leur résultat.
2. Terminé : `20261103103837_department_workspaces.sql`, `20261103112737_commercial_crm.sql`, `20261103120014_delegated_department_teams.sql` appliquées dans cet ordre. Ne pas les relancer. Recette SQL hébergée réussie, sans données de recette persistantes.
3. Raccorder une prévisualisation au projet Test avec les secrets exclusivement serveur et l’URL de confirmation autorisée par Supabase. Vérifier Auth, PostgREST, Storage et conseillers sécurité après application.
4. Recette réelle avec comptes de recette contrôlés : deux équipes commerciales, responsables/agents des trois services, AAL1/AAL2, ajout existant, invitation/lien consommé une seule fois, remplacement du responsable pendant une invitation, réaffectation et révocation. Tester aussi les URL directes et RPC interdits. Pour les emails, utiliser uniquement des boîtes de recette explicitement autorisées ; confirmer la réception et non seulement l’acceptation fournisseur.
5. Comparer avant/après les réservations et paiements existants et tester les fonctions publiques essentielles. Les nouveaux scripts n’effectuent aucune mise à jour de réservation ni mouvement financier.
6. Lorsque cette recette est positive : vérifier la sauvegarde et les définitions actuelles de Production, appliquer les mêmes trois migrations, déployer exactement le commit validé, puis contrôler les routes et permissions. Ne pas inclure implicitement les autres PR de correction dans cette publication.

## Retour arrière conservant les données

Avant publication, conserver le déploiement précédent et une sauvegarde exploitable. Si une migration échoue avant commit, sa transaction annule ses changements. Si une régression apparaît après publication, restaurer le déploiement précédent et exécuter, par opérateur autorisé dans le bon projet, `docs/operations/delegated-teams-disable-preserve-data.sql`.

Ce script désactive les équipes, suspend les adhésions, révoque les nouveaux rôles actifs et les invitations en attente. Il conserve prospects, dossiers, notes et journaux. Son comportement est testé localement. Aucun `DROP`, aucune purge de l’historique et aucune restauration de droits globaux aux agents. La reprise se fait explicitement par le Super Admin, équipe puis agents ; aucun rétablissement massif automatique.

## Reproduction locale

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Pour la recette navigateur : installer les navigateurs Playwright, puis `node scripts/test-e2e.mjs tests/e2e/departments.spec.ts --project=desktop --project=mobile-390 --workers=1`.

Le build de recette est isolé dans `outputs/playwright-stabilization-prod` pour ne pas être effacé par un build `.next`. `MATA_E2E_SKIP_BUILD=true` réutilise uniquement un build local déjà validé, pour relancer des scénarios sans changement applicatif. Un exécutable Chromium disponible peut être fourni via `MATA_PLAYWRIGHT_CHROMIUM_PATH` et ses arguments JSON via `MATA_PLAYWRIGHT_CHROMIUM_ARGS`. Le binaire utilisé ici est un outil de recette externe au dépôt et n’est pas une dépendance de l’application.
