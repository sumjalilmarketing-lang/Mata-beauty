# MATA Beauty QA — plan de réconciliation des migrations

## Environnement inspecté

- Projet QA confirmé : `kazlvtxkbsdhbfvtqqdp` (`mata-beauty-video-qa-1171f9c`).
- La production connue est `qjdwxdbvrxedyfolnpol`; elle n’a pas été interrogée ni modifiée pendant cette intervention.
- Sauvegarde visible dans Supabase : 13 octobre 2026 à 02:44:13 UTC, sauvegarde physique. Aucun test de restauration n’a été lancé. La présence du bouton de restauration n’établit pas que le point est restaurable ; cela doit être confirmé dans la page de détail ou par le fournisseur avant une future migration.
- Supabase signalait des incidents en cours lors de l’inspection précédente ; vérifier son état opérationnel avant la recette QA.

## Comparaison

À la vérification de référence, QA contenait 106 migrations et le dossier local 111 fichiers. Les noms présents localement mais absents de QA étaient :

| Migration locale | État distant | Décision actuelle |
|---|---|---|
| `normalize_booking_slot_conflicts` | Absente | Ne pas appliquer avant comparaison du schéma et de l’effet attendu |
| `message_attachment_validation_leases` | Absente | Ne pas appliquer avant comparaison du schéma et de l’effet attendu |
| `fix_validated_media_object_path` | Absente | Ne pas appliquer avant comparaison du schéma et de l’effet attendu |
| `align_provider_profile_location_fields` | Absente | Ne pas appliquer avant comparaison du schéma et de l’effet attendu |
| `salon_collaborator_access` | Absente | Migration corrigée localement dans cette branche, non appliquée |

Aucun nom uniquement distant n’a été trouvé. Soixante migrations de même nom avaient des versions/horodatages divergents entre l’historique local et distant. Le contenu exact de ces migrations n’a pas encore été rapproché ; les noms seuls ne prouvent pas l’équivalence. Le résultat de la lecture Supabase de ce tour montre que l’historique distant s’arrête à `20261011103512 ensure_booking_conversation_trigger`; aucune nouvelle migration n’a été appliquée.

Les paires dont les SQL doivent être hashés et comparés avant toute réconciliation :

| Nom | Version locale | Version QA |
|---|---:|---:|
| `restore_production_launch_dependencies` | 20261005163809 | 20261005163937 |
| `restore_product_event_endpoint` | 20261005165335 | 20261005165425 |
| `restore_launch_feed_selection` | 20261005170418 | 20261005170523 |
| `finalize_professional_application_workflow` | 20261005202610 | 20261005203516 |
| `welcome_email_delivery` | 20261005205325 | 20261005205502 |
| `restore_reviewed_professional_access` | 20261005211600 | 20261005211632 |
| `dossier_notifications_part_three` | 20261005231621 | 20261005232209 |
| `notification_dispatch_and_event_completion` | 20261005232415 | 20261005232520 |
| `harden_notification_dispatch_extension` | 20261005233155 | 20261005233220 |
| `complete_notification_navigation` | 20261005233531 | 20261005233613 |
| `notification_delivery_health` | 20261005235622 | 20261006000503 |
| `reconcile_professional_approval_roles` | 20261006002500 | 20261005222110 |
| `enforce_professional_approval_and_admin_mfa` | 20261006010731 | 20261006010946 |
| `enforce_active_admin_membership` | 20261006015600 | 20261006015619 |
| `correct_admin_financial_metrics` | 20261006020550 | 20261006020634 |
| `align_existing_support_moderation_workflows` | 20261006020941 | 20261006021007 |
| `require_authenticated_service_management` | 20261006021316 | 20261006021347 |
| `restrict_legacy_privileged_entrypoints` | 20261006021727 | 20261006021812 |
| `internal_team_access` | 20261006174629 | 20261006175236 |
| `internal_activation_server` | 20261006175531 | 20261006175618 |
| `scope_internal_role_access` | 20261006175747 | 20261006175848 |
| `internal_mfa_audit` | 20261006180904 | 20261006180943 |
| `internal_suspension_auth_compatibility` | 20261006181323 | 20261006181405 |
| `restrict_business_archive_role` | 20261006181832 | 20261006181904 |
| `close_permission_audit_exposures` | 20261007094545 | 20261007094647 |
| `restore_document_and_review_guards` | 20261007095500 | 20261007095551 |
| `retire_unused_workflow_entrypoints` | 20261007100147 | 20261007100323 |
| `scope_internal_dashboard_aggregates` | 20261007144455 | 20261007144553 |
| `enforce_social_record_integrity` | 20261007150828 | 20261007151158 |
| `audit_comment_visibility_changes` | 20261007151445 | 20261007151539 |
| `restore_health_abuse_dependency` | 20261007153936 | 20261007154118 |
| `restore_private_profile_access` | 20261007155416 | 20261007155505 |
| `restrict_profile_private_columns_and_status` | 20261007155527 | 20261007155619 |
| `restore_existing_launch_admin_dependencies` | 20261007160629 | 20261007161139 |
| `isolate_support_from_content_moderation` | 20261007161717 | 20261007161851 |
| `reserve_pending_refund_amounts` | 20261007162636 | 20261007163000 |
| `audit_review_visibility_changes` | 20261007163632 | 20261007163853 |
| `process_account_deletion_requests` | 20261007170500 | 20261007165227 |
| `move_btree_gist_to_extensions` | 20261007171500 | 20261007170737 |
| `require_mfa_for_legacy_internal_access` | 20261007173000 | 20261007171214 |
| `expose_public_maintenance_state` | 20261007174500 | 20261007172448 |
| `secure_admin_account_lifecycle` | 20261008112317 | 20261008113447 |
| `retain_analytics_after_account_deletion` | 20261008113756 | 20261008113830 |
| `idempotent_account_deletion_finalization` | 20261008114401 | 20261008114511 |
| `guard_feed_comment_rate` | 20261008122831 | 20261008123224 |
| `distinguish_video_comment_reports` | 20261008131259 | 20261008145406 |
| `count_only_video_reports_for_feed_visibility` | 20261008150824 | 20261008150850 |
| `employee_booking_assignment` | 20261008170112 | 20261008171859 |
| `employee_assignment_guards` | 20261008172740 | 20261008172825 |
| `employee_calendar_contract` | 20261008173647 | 20261008173734 |
| `employee_resource_namespace` | 20261008174332 | 20261008174407 |
| `require_enabled_team_assignment` | 20261008174522 | 20261008174600 |
| `harden_employee_account_access` | 20261011092427 | 20261011092822 |
| `fix_independent_team_availability_shape` | 20261011095523 | 20261011102401 |
| `conversation_multimedia_foundation` | 20261011101004 | 20261011103337 |
| `conversation_quotes_and_booking` | 20261011101008 | 20261011103400 |
| `video_comment_likes` | 20261011101047 | 20261011103408 |
| `quote_catalog_compatibility` | 20261011102400 | 20261011103349 |
| `conversation_history_pagination` | 20261011102928 | 20261011103417 |
| `ensure_booking_conversation_trigger` | 20261011103442 | 20261011103512 |

## Lecture du schéma QA et RLS

Le schéma QA contient `collaborators` avec `profile_id` et `internal_role`, mais sans `staff_permissions`. Ses politiques autorisent la lecture publique des lignes de collaborateurs actifs de salons approuvés, et une politique d’administration propriétaire. Les privilèges confirment que `anon` et `authenticated` possèdent SELECT et UPDATE sur la table et SELECT sur `profile_id` et `internal_role`; RLS filtre les lignes mais n’enlève pas ces droits de colonnes. Aucune vue publique référencée ne contient ces tables. Le seul RPC QA dont le nom correspond à `collaborator` est `reassign_booking_collaborator`, SECURITY DEFINER, `search_path=''`, vérifie le propriétaire puis appelle `booking_private.require_owner`. `business_invitations` dispose d’une politique propriétaire de lecture et d’une ancienne politique `ALL` à laquelle le rôle `public` est associé, avec filtrage RLS. Les RPC d’invitation du nouveau chantier (`create_business_invitation`, `lookup_business_invitation`, `accept_business_invitation`, révocation et attribution d’accès) n’existent pas encore dans QA.

Cela explique les trois écarts : la migration de travail ajoutait initialement les permissions sur une table publique lisible ; les noms/timestamps seuls ne réconcilient pas les 60 divergences ; et la QA n’a pas reçu les objets/RPC ajoutés dans le dernier fichier local.

## Procédure contrôlée proposée — aucune étape exécutée

1. Confirmer que la sauvegarde du 13 octobre est un point restaurable et que les fenêtres de conservation couvrent une restauration avant migration. Ne pas restaurer.
2. Exporter un dump de schéma QA en lecture seule et l’archiver avec le commit testé, le checksum et l’horodatage. Ne pas inclure les données privées dans les pièces de revue.
3. Pour chaque migration dont le timestamp diffère, retrouver le SQL exact du déploiement correspondant, calculer son hash et comparer à l’SQL locale. Renommer uniquement après égalité exacte du contenu et vérification de l’ordre de dépendance.
4. Pour les quatre migrations locales sans équivalent distant, vérifier chaque effet attendu dans le schéma QA. Ne créer qu’une migration forward-only si l’objet manque réellement ; documenter toute migration équivalente déjà appliquée.
5. Tester la chaîne complète sur Postgres/Supabase local isolé, avec une base neuve et une base clonée de schéma, puis exécuter `supabase/tests/collaborator_access_privacy.sql` et les tests multi-comptes RLS.
6. Après approbation explicite séparée, appliquer d’abord au projet QA confirmé, vérifier le diff de schéma/RPC/grants et les parcours d’invitation avec comptes distincts. Ne jamais utiliser `supabase/config.toml` pour les commandes distantes tant que son `project_id` pointe vers la production.
7. Avant le changement QA, exiger une sauvegarde fraîche dont le fournisseur confirme le point de restauration et conserver un export du schéma. Si la migration échoue avant le `COMMIT`, PostgreSQL annule toute la transaction. Après commit, revenir au code précédent seul serait incompatible avec les RPC et colonnes privées ; le retour arrière contrôlé nécessite soit une migration compensatrice testée qui conserve les ACL de sécurité, soit une restauration fournisseur depuis un point confirmé, avec approbation explicite. Ne pas créer de migration descendante qui réexpose les rôles/permissions dans `public`.

## État de cette intervention

- Aucune migration appliquée ou réparée dans l’historique distant.
- Aucun `db push`, `migration repair`, restauration ou déploiement exécuté.
- `pnpm lint`: PASS, 0 erreur, 2 avertissements `<img>` existants dans `app/conversation-media.tsx`.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS, 143 tests / 29 fichiers.
- `pnpm build`: PASS.
- `pnpm test:smoke`: PASS après correction des assertions devenues obsolètes (23/23). Les assertions vérifient désormais le bouton de réservation actuel, le composant partagé de conversation et son accusé de lecture, et l’absence de journalisation de données sensibles dans le callback OAuth. Aucun test n’a été supprimé.
- Test statique dédié migration/RPC: inclus dans `pnpm test`, PASS.
- `supabase/tests/collaborator_access_privacy.sql`: NOT TESTED. Le poste ne fournit ni `psql`, ni Docker, ni Supabase CLI pour démarrer une base isolée ; aucun test SQL n’a été lancé contre QA/production.
- Le fichier local `20261013130000_salon_collaborator_access.sql` ne crée plus de colonnes publiques de permissions ou de jeton ; il déplace les données si des colonnes héritées sont présentes, puis applique des privilèges par colonne et des RPC contrôlées.
- La validation réelle des privilèges/RLS avec comptes distincts reste BLOCKED jusqu’à disponibilité d’une base isolée locale puis, plus tard, autorisation explicite d’une recette QA.

## Reprise du 13 octobre 2026 — diagnostic sans écriture

- Identité relue via le fournisseur : `kazlvtxkbsdhbfvtqqdp`, nom `mata-beauty-video-qa-1171f9c`, état `ACTIVE_HEALTHY`, PostgreSQL 17.6. Ce projet QA a été interrogé uniquement par les outils de lecture de métadonnées/catalogue. Production (`qjdwxdbvrxedyfolnpol`), YOBALELMA et données applicatives n’ont pas été interrogés. Aucun DDL, DML, push, réparation d’historique, restauration ou déploiement n’a été exécuté.
- L’historique distant relu contient 106 entrées et s’arrête à `20261011103512`. Le répertoire local contient 111 fichiers : 60 noms communs avec timestamps divergents, cinq noms uniquement locaux, aucun nom uniquement distant.
- Les quatre migrations locales antérieures sans nom correspondant ont été qualifiées par vérification de leurs objets cibles sur QA :
  - `normalize_booking_slot_conflicts` : le corps de `enforce_booking_contract()` ne contient pas le SQLSTATE `23P01` attendu. L’effet est réellement absent; une correction forward-only est nécessaire avant la recette métier des conflits de créneau. Le fichier historique ne doit pas être rejoué à l’aveugle.
  - `message_attachment_validation_leases` : les trois colonnes de bail et le RPC `claim_message_attachment_validation` existent déjà; l’effet attendu est présent, même si le nom/version ne figure pas dans l’historique.
  - `fix_validated_media_object_path` : `complete_message_attachment` existe avec le bail de validation et le marqueur de chemin `validated.`; l’effet attendu est présent.
  - `align_provider_profile_location_fields` : `area` et `location_verified_at` existent; l’effet attendu est présent.
- `salon_collaborator_access` : les tables privées `booking_private.collaborator_access`, `business_invitation_secrets` et `business_invitation_events` ainsi que les RPC d’invitation attendus sont absents de QA. Cette migration locale est donc nécessaire, mais elle n’est ni appliquée ni considérée prête à appliquer avant un vrai test SQL isolé.
- Le catalogue QA confirme actuellement `profile_id` et `internal_role` dans `public.collaborators`, avec une politique de lecture publique des collaborateurs actifs de salons approuvés. Les rôles `anon` et `authenticated` ont encore des droits de lecture/mise à jour sur les colonnes de cette table; l’ancienne policy `business owners manage collaborators` accepte le rôle `public`. `business_invitations` conserve aussi l’ancienne policy `ALL` `business owners manage invitations` et des droits historiques étendus. Ces autorisations sont des constats de catalogue, pas des tests de requêtes sous identités utilisateur. Le correctif local prévoit de restreindre les colonnes et écritures, mais l’état QA reste à risque jusqu’à validation/après une future migration autorisée.
- Pour les 60 paires, le catalogue distant restitue uniquement `version` et `name`, pas le SQL original d’exécution ni les checksums. Le schéma confirme certains effets cibles; il ne prouve pas l’égalité du contenu des migrations divergentes. Il faut récupérer les sources exactes du déploiement QA ou un export vérifiable avant de déclarer ces 60 paires équivalentes.
- Aucune instance locale n’est disponible : `docker`, `podman`, `psql`, `pg_ctl`, `postgres` et `supabase` ne sont pas présents dans le PATH; aucun service/port PostgreSQL local n’a été détecté. Aucun moteur PGlite ou pg-mem n’est installé dans `node_modules`. Aucun serveur ou paquet n’a été installé. Les tests SQL et l’application de la migration sur une base locale restent donc BLOCKED.
- Résultats réexécutés : `pnpm test:smoke` PASS (23/23), `pnpm test` PASS (29 fichiers, 143 tests). Le test SQL `supabase/tests/collaborator_access_privacy.sql` reste NOT TESTED; les scénarios multi-rôles/RLS et invitations réelles restent NOT TESTED.
- La prochaine étape sûre est d’obtenir un Postgres/Supabase local réellement isolé et compatible, d’y appliquer le schéma de référence avec les migrations réconciliées, de corriger et tester en priorité la restriction de `collaborators`, puis les jetons/invitations et les fonctions SECURITY DEFINER. Une fois les 60 divergences sourcées et les tests passés, produire un plan QA avec sauvegarde restaurable confirmée, diff préalable et compensation testée. Toute exécution QA demandera encore une autorisation distincte.

## Correctif de confidentialité des collaborateurs — préparé, non appliqué

- Le catalogue QA montre une ACL table directe `arwdDxtm` pour `anon` et `authenticated` sur `public.collaborators` (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN). Les ACL par colonne sont nulles; il s’agit donc de droits table-wide. La policy `active collaborators public read` autorise le SELECT des lignes actives des salons approuvés, et `business owners manage collaborators` autorise les lignes du propriétaire ou du Super Admin. RLS filtre les lignes, mais ne cache pas `profile_id` ou `internal_role` dans les lignes que la policy publique permet de lire.
- Le correctif de `20261013130000_salon_collaborator_access.sql` révoque d’abord les droits table-wide des rôles API, conserve ces deux politiques existantes et ne redonne que SELECT sur les champs de présentation (nom, photo, spécialités, activité, identifiants publics) et UPDATE authentifié sur les seuls champs de présentation/gestion nécessaires. Il supprime le rôle interne de `public.collaborators` après copie vers `booking_private.collaborator_access`; `staff_permissions` et les jetons d’invitation restent également privés. Aucune policy publique n’est supprimée pour masquer un problème d’ACL.
- Vérification des dépendances applicatives : les lectures directes du tableau d’équipe ne sélectionnent que les champs de présentation; les rôles et permissions viennent du RPC propriétaire `owner_list_collaborator_access`. Les écritures de fiche passent par `save_team_member`; l’avatar est le seul champ public modifié directement. Aucun `public` view QA ne référence `collaborators`. Les fonctions QA recensées sont SECURITY DEFINER avec `search_path` vide; les RPC d’écriture observés sont protégés par propriétaire/booking. `get_team_available_slots` est exécutable par `anon`, mais ne renvoie que créneau, identifiant de collaborateur public et champs de présentation, jamais `profile_id`, `internal_role` ou permissions.
- Le test SQL de catalogue vérifie désormais le retrait des SELECT/INSERT/UPDATE sur `profile_id`, l’absence du rôle interne dans la table publique, le retrait des écritures table-wide, les colonnes de présentation encore lisibles/modifiables, et la présence des policies de lecture publique filtrée et de gestion propriétaire. Le test unitaire vérifie aussi que les listes de colonnes de grants excluent les champs internes.
- Disponibilité PostgreSQL revérifiée : Docker, Podman, PostgreSQL, `psql`, `pg_ctl`, `initdb` et Supabase CLI absents; aucun service ni écoute locale sur les ports 5432/54322. `wsl.exe` est présent mais n’a pas exposé de sous-système utilisable via les commandes disponibles. Aucun moteur SQL intégré n’est installé. Pour exécuter les tests, il faut fournir soit Docker Desktop/Linux containers avec une image PostgreSQL 17 et Supabase CLI pour les extensions/fonctions Supabase, soit un environnement PostgreSQL 17 local isolé avec `psql`/`pg_ctl` et toutes les extensions référencées. L’installation hors du workspace n’a pas été tentée.
- Protocole de tests multi-rôles préparé pour cet environnement isolé : (1) base jetable neuve, migrations corrigées, puis suite `collaborator_access_privacy.sql`; (2) seed de deux propriétaires, deux salons et collaborateurs distincts; (3) requêtes PostgREST comme `anon` et client authentifié vérifiant SELECT projection publique, refus de `profile_id`, refus des écritures de rôle/liaison, mais lecture des champs publics; (4) owner A utilise son RPC d’accès pour A et ne récupère rien pour B; (5) collaborator A ne récupère que sa propre permission et les rendez-vous/conversations affectés, jamais ceux du collaborateur B ou du salon B; (6) invitation avec adresse vérifiée, expiration contrôlée, acceptation, deuxième acceptation refusée, révocation et tentative concurrente; (7) revue ACL EXECUTE et appel sous rôle non autorisé pour chaque fonction SECURITY DEFINER. Les fixtures doivent rester dans la transaction ou la base jetable et être détruites après test.
- Résultats de cette correction locale : `pnpm test:smoke` PASS (23/23), `pnpm test` PASS (144 tests), `pnpm lint` PASS (0 erreur, 2 avertissements `<img>` préexistants), `pnpm typecheck` PASS, `pnpm build` PASS. Le script SQL n’a pas été exécuté : `BLOCKED — aucun serveur Postgres isolé disponible`. Les scénarios de session réelle (`anon`, utilisateur, propriétaire, collaborateur, salon croisé), d’invitation et de SECURITY DEFINER restent `NOT TESTED`.
- Condition de GO QA : environnement PostgreSQL isolé confirmé; migration appliquée et rejouée sur base vierge puis clone de schéma; script SQL PASS; sessions multi-rôles démontrant que les champs publics restent lisibles, les champs internes refusés, les owners accèdent uniquement à leur salon et les collaborateurs uniquement aux dossiers affectés; comparaison/hash des sources des 60 migrations; sauvegarde restaurable confirmée et procédure compensatrice testée. L’application QA nécessitera toujours une autorisation distincte.

## Reprise — PostgreSQL local isolé, 13 octobre 2026

Cette section remplace les anciens constats « Docker absent / tests SQL bloqués » ci-dessus pour les opérations réellement effectuées pendant la reprise. Elle ne modifie pas le statut de la QA distante.

- Docker Desktop a été installé en mode par utilisateur après autorisation explicite. Le téléchargement officiel Docker Desktop 4.95.0 a été vérifié par SHA-256 (`73431db38491f770543880366228a23c993f84d1e8e045f56d83b8a98940cf76`). Le moteur a répondu avec Docker 29.8.2 et Compose 5.6.0. Aucun compte Docker ni acceptation de conditions supplémentaires n’a été fourni par l’agent.
- Supabase CLI 2.120.0 a été lancé via `pnpm dlx` sans ajout de dépendance au projet. Un workspace jetable `C:\Users\user\AppData\Local\Temp\mata-beauty-local-qa-20261013` a reçu une copie des migrations et une configuration locale à identifiant synthétique `mata-beauty-local-isolated-20261013`; aucun fichier `.env` ni secret n’y a été copié. Le conteneur de base a utilisé PostgreSQL 17.11.0.004 et port local 54322.
- Les 111 migrations locales ont été appliquées à cette base neuve isolée. La liste de migrations locale est alignée sur les 111 fichiers. Cette comparaison n’est pas celle de l’historique QA et ne résout pas les 60 divergences distantes.
- `supabase/tests/collaborator_access_privacy.sql` a été exécuté et a passé. Le nouveau `supabase/tests/collaborator_access_isolation.sql` a été exécuté deux fois avec `psql` dans le conteneur et a passé, avec transaction annulée (`ROLLBACK`). Il couvre les rôles anon, owner, collaborator et service role; deux salons; champs publics versus internes; invitations valides, expirées, révoquées, à usage unique; accès propriétaire; et traces d’audit. Les fixtures sont temporaires et annulées.
- Les contrôles de compilation et tests applicatifs exécutés avant l’ajout du seul fichier SQL étaient : smoke 23/23 PASS, tests unitaires 144/144 PASS, lint PASS (0 erreur, 2 avertissements `<img>` préexistants), typecheck PASS, build PASS. Aucun fichier TypeScript applicatif n’a été ajouté ou modifié par cette reprise; les suites applicatives restent donc celles réellement exécutées avant le script SQL.
- Le système de fichiers de cette intervention n’a pas permis de revérifier le moteur après coup : Docker Desktop et le Supabase CLI n’étaient plus dans le PATH de la session de terminal disponible, et `pnpm dlx` a échoué avec `EPERM` en résolvant `C:\Users\user`. Le test SQL a néanmoins déjà été exécuté avec succès dans le conteneur local. Statut actuel du moteur après fermeture/perte de session : NOT VERIFIED.
- `wsl --version` avait répondu avec WSL 3.0.1.0 et le noyau 6.18.40.1-1; l’énumération des distributions WSL reste refusée (`Wsl/EnumerateDistros/Service/E_ACCESSDENIED`). Le journal de l’installateur identifiait Windows 11 Home, build 22631. Docker Desktop a toutefois démarré son moteur Linux localement. `systemd-binfmt.service` n’a pas été modifié : il n’était pas nécessaire aux tests Docker natifs observés. Aucune modification BIOS/Windows hors installation autorisée n’a été faite.
- Un écart de nommage à surveiller : Docker a nommé le conteneur `supabase_db_qjdwxdbvrxedyfolnpol`, qui reprend la référence du projet Supabase de production présente dans le `supabase/config.toml` du dépôt. Pendant le test, le conteneur portait toutefois le label `com.supabase.cli.workdir` vers le workspace Temp isolé; les migrations ont été exécutées localement dans ce conteneur et aucun `db push`, `migration repair` ou appel de mutation distante n’a été effectué. Ce nom trompeur ne constitue pas une preuve de connexion à la production, mais il faut assainir le nom de projet local synthétique avant la prochaine session et revérifier les labels, ports et volumes avant tout test.
- Le catalogue QA déjà inspecté en lecture seule garde l’ACL large sur `public.collaborators`, et la migration locale n’a pas été appliquée. Le risque QA reste présent. Les 60 migrations divergentes ne sont pas réconciliées faute du SQL/checksum distant original; les cinq migrations locales seulement et leurs effets ne doivent pas être « réparés » arbitrairement dans l’historique.
- Aucun changement à Supabase QA/Production, YOBALELMA, aucun arrêt de projet, restauration, migration distante ou déploiement n’a été effectué. État global : **GO pour poursuivre les vérifications locales isolées; NO-GO pour appliquer la migration en QA ou production** tant que le nommage local, les 60 divergences, la sauvegarde restaurable et la procédure de compensation ne sont pas indépendamment établis.

## Préparation de la revue QA — 13 octobre 2026

### Identité et conteneur local

- Le projet distant a été relu avant les requêtes : `kazlvtxkbsdhbfvtqqdp`, `mata-beauty-video-qa-1171f9c`, région `eu-central-1`, statut `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166. Les requêtes de cette revue étaient des `SELECT` de catalogue uniquement.
- Docker Desktop est actif. Le conteneur local a été vérifié comme sain (PostgreSQL 17.11.0.004, `pg_isready` répond, port local 54322, label de workdir vers `C:\Users\user\AppData\Local\Temp\mata-beauty-local-qa-20261013`, volume Docker local). Son nom a été changé de `supabase_db_qjdwxdbvrxedyfolnpol` vers `mata_beauty_local_qa_20261013_postgres`. Les 111 migrations y sont toujours présentes et les deux scripts SQL de confidentialité/isolation ont été rejoués après renommage avec succès; le second finit par `ROLLBACK`.
- Le nom visible est maintenant explicite, mais les métadonnées Compose et le nom du volume restent `qjdwxdbvrxedyfolnpol`. Ils ne représentent pas des ressources distantes, mais restent ambigus pour les prochains appels Supabase CLI. Ne pas utiliser `supabase start/stop/status` depuis le dépôt comme si ce conteneur avait un projet Compose indépendant. Avant une nouvelle recette, il faudra créer/recréer un stack avec un project id synthétique cohérent et conserver les données par dump/restore local vérifié, ou utiliser exclusivement le conteneur renommé et le volume local. Aucun volume n’a été renommé ou supprimé.

### Réconciliation des versions

- Comparaison recalculée : 106 versions QA, 111 fichiers locaux, 106 noms communs, 60 paires avec timestamp différent, zéro nom QA uniquement distant, cinq fichiers uniquement locaux. Les 60 paires et leurs timestamps local/QA sont listés dans le tableau de divergences plus haut dans ce document.
- Les 60 fichiers SQL locaux existent. Aucun fichier portant les versions/timestamps QA correspondants n’a été retrouvé dans l’historique Git local de toutes les branches disponibles (0/60). L’API d’historique Supabase fournit seulement `version` et `name`, pas le SQL d’origine ni les checksums. Donc aucune égalité de contenu ne peut être affirmée et aucun checksum distant n’est inventé.
- `supabase db push` est à proscrire dans l’état actuel : les versions locales non réconciliées peuvent être présentées comme migrations non appliquées et rejouer des changements historiques. Ne faire ni `migration repair`, ni renommage de fichiers, ni écriture dans l’historique distant sans preuve du SQL exact et revue d’ordre/dépendances.
- Plan sans réécriture de l’historique : obtenir les SQL d’exécution du dépôt/CI qui a effectivement alimenté QA; calculer leur hash et comparer octet par octet aux 60 fichiers locaux; classer chaque paire `identique` ou `différente`. Pour les identiques seulement, préparer un renommage local vers la version QA déjà enregistrée, sans réparer l’historique distant. Pour les différences, laisser les historiques intacts et écrire uniquement une migration forward-only testée pour l’effet manquant. Conserver un manifeste version local ↔ version QA ↔ nom ↔ hash source vérifié ↔ décision, plus une copie du schéma catalogué avant toute application.

### Effets des cinq migrations locales seulement

| Migration locale | Constat QA en lecture seule | Décision préparatoire |
|---|---|---|
| `20261006021614_normalize_booking_slot_conflicts` | `public.enforce_booking_contract()` ne contient pas le SQLSTATE `23P01` attendu. | Effet absent. Préparer un correctif forward-only distinct après les tests de réservation/conflit; ne pas rejouer ce fichier historique. |
| `20261011103238_message_attachment_validation_leases` | Colonnes de bail et RPC `claim_message_attachment_validation` présents. | Effet déjà observé; ne pas appliquer le fichier comme nouveau changement. La source exacte reste à comparer avant toute réconciliation d’historique. |
| `20261012120044_fix_validated_media_object_path` | `complete_message_attachment` inclut la garde de bail et le chemin `-validated.`. | Effet déjà observé; aucune réapplication. |
| `20261012121500_align_provider_profile_location_fields` | `public.provider_profiles.area` et `location_verified_at` présents. | Effet déjà observé; aucune réapplication. |
| `20261013130000_salon_collaborator_access` | `booking_private.collaborator_access`, `business_invitation_secrets` et `business_invitation_events` absents; aucun RPC de ce nouveau workflow n’existe dans QA. | Nécessaire pour ce workflow, mais non autorisé/non appliqué. Revue et plan QA ci-dessous requis avant une application future. |

### État QA actuel et correctif préparé

- Les privilèges QA donnent actuellement à `anon` et `authenticated` SELECT et UPDATE de table et de colonnes sur `public.collaborators`; `has_column_privilege` confirme notamment les droits SELECT/UPDATE sur `profile_id` et `internal_role` pour les deux rôles. La policy `active collaborators public read` autorise les lignes actives de salons approuvés; RLS filtre les lignes mais ne masque pas les colonnes. La policy propriétaire `business owners manage collaborators` est aussi applicable au rôle `public`. Il s’agit d’un risque réel de confidentialité sur QA, pas d’un effet du correctif local.
- QA ne contient pas encore les trois tables privées; `public.business_invitations` ne contient que les colonnes historiques `id,business_id,email,internal_role,status,invited_by,expires_at,accepted_at,created_at` et conserve une policy `ALL` pour `public`. Les RPC actuels observés ont `SECURITY DEFINER` avec `search_path` vide; les fonctions d’administration sont réservées à authenticated, et les fonctions publiques de disponibilité renvoient un identifiant de collaborateur public et des champs d’affichage, pas son `profile_id` ou ses permissions. `get_booking_team_availability` lit `provider_profiles.profile_id` pour relier une prestation au profil public, mais son contrat de sortie est un état d’équipe et des créneaux; cela ne fournit pas l’identifiant du compte d’un collaborateur.
- Le correctif de `20261013130000_salon_collaborator_access.sql` conserve la policy de lecture publique filtrée et les mises à jour propriétaires RLS, retire les ACL table-wide, ne réaccorde à l’API que les colonnes de présentation, déplace `internal_role`/`staff_permissions` en `booking_private` et les secrets d’invitation dans `booking_private.business_invitation_secrets`. Les RPC de rôle et invitation ont des grants ciblés. Les tests locaux vérifient les colonnes internes, les deux salons, l’expiration 48 h, la révocation, l’acceptation unique et l’annulation des fixtures.
- Revue statique des consommateurs : les écrans Équipe et Salon lisent des colonnes publiques incluses dans la liste blanche; les mises à jour directes sont avatar, présentation et état, protégées par le filtre propriétaire RLS. Les permissions internes passent par les RPC d’accès. Les parcours interface de profil public, réservation et messagerie n’ont pas été exécutés contre QA avec cette migration, puisqu’elle n’y est pas présente. Statut de régression réelle QA : **NOT TESTED**.

### Procédure d’application QA à examiner — non exécutée

1. **Préconditions :** confirmer à nouveau l’identifiant QA; obtenir une sauvegarde récente et faire confirmer par Supabase qu’elle est restaurable; exporter le schéma, l’historique des 106 versions, ACL/RLS/RPC, et la configuration d’extensions. Ne pas accepter de sauvegarde de production comme point de restauration QA.
2. **Réconciliation :** résoudre les 60 sources manquantes en établissant chaque hash par source CI ou archive du déploiement. Tant que cela n’est pas possible, aucun `db push` global et aucune réparation d’historique. Préparer un diff d’état exact et une liste de migrations uniquement nouvelles.
3. **Préparation :** appliquer la chaîne réconciliée sur la base locale neuve PostgreSQL 17; tester une seconde fois le correctif sur un clone de schéma QA privé local si un export autorisé et expurgé est disponible. Inclure les gardes de collision de créneau et les tests complets des fonctions SECURITY DEFINER.
4. **Revue avant application :** faire examiner les privilèges avant/après, les colonnes exposées, RLS, grants EXECUTE, triggers booking/messages, transfert des permissions historiques, secrets d’invitation, contraintes FK et impact sur les invitations en attente. Confirmer la compatibilité UI des champs de présentation et des actions directes.
5. **Application séparée :** seulement après autorisation explicite distincte, utiliser une procédure QA ciblée et versionnée, sous transaction si possible; aucune écriture d’historique manuelle. Arrêter si le plan contient une migration historique ou un renommage non démontré identique.
6. **Contrôles après :** vérifier les ACL exactes de `anon` et `authenticated`, confirmer l’absence de SELECT/UPDATE sur `profile_id` et `internal_role`, la lecture des seuls champs publics, le maintien des politiques propriétaires, l’absence de tables privées dans les schémas exposés, les grants RPC, les triggers, puis tester sous anon, client, propriétaire, collaborateur A/B, avec isolation entre deux salons.
7. **Non-régression métier :** vérifier profil public et carrousel équipe, recherche de créneaux, création/réaffectation et états d’une réservation, visibilité historique, invitation réelle avec adresse vérifiée, expiration, utilisation unique, révocation, retrait d’accès, conversations affectées et absence d’accès inter-salon. Capturer logs et versions, sans données personnelles superflues.
8. **Retour arrière :** si l’erreur survient avant COMMIT, vérifier le rollback transactionnel. Après COMMIT, ne pas restaurer les anciens grants publics ni remettre des permissions dans `public`; corriger par migration compensatrice forward-only testée. Une restauration complète du point fournisseur requiert un incident documenté et une autorisation séparée, après confirmation de l’impact sur les écritures QA post-sauvegarde.

### Statut de cette reprise

- Conteneur local renommé et sain; 111 migrations présentes; les deux scripts SQL sont **PASS** après renommage.
- Catalogue QA, historique, ACL, policies, fonctions SECURITY DEFINER et objets d’invitation lus sans écriture. Aucun accès à la base Production, à YOBALELMA ou aux données applicatives n’a été effectué.
- Lint/typecheck/unitaires/smoke/build n’ont pas été relancés dans cette reprise, car aucun code TypeScript/runtime n’a changé; leurs dernières exécutions rapportées dans la section précédente restent PASS. Les tests de réservation réels et les écrans publics/équipe sur QA restent **NOT TESTED**.
- Sauvegarde restaurable : **NOT VERIFIED** dans cette reprise. Migration QA/Production, repair d’historique, restauration et déploiement : **NOT EXECUTED**.
- Décision : **NO-GO pour appliquer à QA maintenant**. La confidentialité QA est encore exposée, les 60 SQL distants ne sont pas disponibles pour une comparaison de contenu, le nom du projet Compose/volume local reste trompeur et la restauration fournisseur n’est pas confirmée. **GO pour la revue du plan et la poursuite des tests locaux isolés.**

## Complément — recherche des SQL perdus et correctif ACL indépendant (13 octobre 2026)

### Recherche des 60 sources

- Branche confirmée : `codex/pro-salon-maquette`. Le worktree contenait déjà des changements utilisateur et fichiers non suivis; ils ont été conservés.
- Parcours effectué : branches locales et distantes, migrations du worktree, commits atteignables, objets Git inaccessibles via `git fsck --no-reflogs --unreachable`, stash, et recherche de dumps/archives dans le dépôt. Quatre commits inaccessibles contiennent des fichiers SQL historiques, mais **aucun des 60 chemins SQL nommés avec les versions QA correspondantes n’a été retrouvé (0/60)**. Le stash est vide et aucun dump/archive de base n’a été trouvé dans le dépôt. Les objets Git orphelins ne donnent donc pas les contenus distants recherchés.
- Conclusion : les fichiers SQL distants d’origine restent **introuvables** dans les sources locales examinées. Les noms, horodatages, schémas cibles, ni des checksums recréés depuis les migrations locales ne démontrent l’équivalence. Aucun checksum manquant n’a été inventé et aucun historique n’a été modifié.
- La voie de sortie est un rapprochement par **état observé**, pas une fausse réconciliation historique. Pour chaque paire, il faut un inventaire comparatif de types/colonnes/defaults, contraintes, index, triggers, policies/RLS, fonctions (définition, propriétaire, `SECURITY DEFINER`, `search_path`), grants, extensions, et, si l’ancien SQL a modifié des données, une preuve spécifique des postconditions et effets de bord. Seules les postconditions vérifiées peuvent justifier une migration complémentaire forward-only; les écarts de données ou effets non observables restent bloquants. Ne pas renommer/réparer les 60 versions dans `schema_migrations` et ne pas lancer `db push` global.

### Correctif de privilèges indépendant

- Fichier ciblé QA : `supabase/migrations/20261013175002_harden_collaborator_api_privileges.sql` (version enregistrée sur QA après application).
- Il révoque les droits table-wide et les ACL par colonne de `PUBLIC`, `anon` et `authenticated`, puis redonne seulement SELECT sur les champs de présentation utilisés par les profils/équipes/réservations et UPDATE authentifié sur les champs que les écrans du responsable modifient. Il n’altère ni RLS/policies, ni données, colonnes, FK, triggers, fonctions d’invitation, ni droits `service_role`.
- `profile_id`, `internal_role` et `staff_permissions` ne sont pas dans la liste autorisée. Les policies `active collaborators public read` et `business owners manage collaborators` restent présentes; RLS continue de filtrer les lignes. Les fonctions de créneaux et leurs champs publics ne sont pas modifiés.
- Test dédié : `supabase/tests/collaborator_api_privileges_hotfix.sql`. Il vérifie l’absence de SELECT/UPDATE table-wide, l’absence de lecture/écriture des colonnes internes lorsqu’elles existent, les champs publics lisibles, les modifications authentifiées autorisées, l’interdiction d’UPDATE anon, l’absence d’INSERT/DELETE directs, et la présence des deux policies existantes.
- Vérification des consommateurs : `team-management.tsx` sélectionne les informations d’affichage; ses mises à jour directes concernent l’avatar, l’état bookable/actif et l’archivage. Les permissions passent par RPC. La page de contrôle Salon ne lit pas `profile_id`/`internal_role` depuis les collaborateurs. Le correctif ne ferme donc pas les lectures de profil, l’affichage équipe ou la consultation de disponibilités. Cela reste une revue statique locale, pas un test HTTP/PostgREST en QA.

### Preuves d’exécution locale

- Conteneur Docker : `mata_beauty_local_qa_20261013_postgres`, image Supabase Postgres 17.11, état healthy, `pg_isready` répond accepting connections. L’ancien nom ambigu a été remplacé; le volume de données local n’a pas été supprimé ou renommé.
- Le correctif ACL a été exécuté avec `psql` seulement dans la base locale isolée `postgres` pour vérifier sa syntaxe; aucune entrée d’historique n’a été ajoutée. Pour éprouver une précondition hostile, des grants table-wide et un grant sensible sur `profile_id` ont été temporairement simulés puis le correctif a immédiatement restauré la liste blanche.
- `collaborator_api_privileges_hotfix.sql` : **PASS**.
- `collaborator_access_privacy.sql` : **PASS**.
- `collaborator_access_isolation.sql` : **PASS**, transaction terminée par `ROLLBACK`.
- Lecture finale : 111 migrations locales enregistrées; les trois policies de `public.collaborators` demeurent; `anon` et `authenticated` n’ont plus le privilège SELECT sur `profile_id`.
- Nouveau contrôle QA strictement en lecture seule : projet toujours `ACTIVE_HEALTHY`, 106 migrations; `has_table_privilege` retourne `anon SELECT=true` et `authenticated SELECT=true`; `anon SELECT profile_id=true`; `authenticated SELECT internal_role=true`; deux policies sur la table. La divulgation des colonnes internes est donc **confirmée toujours présente en QA**; aucun correctif n’y a été appliqué.
- Ces résultats couvrent le moteur local isolé uniquement. Ils ne prouvent pas l’exécution de vraies requêtes REST sur QA, ni l’équivalence des 60 migrations absentes, ni la disponibilité de tous les scénarios d’invitation du projet QA.

### Essai de restauration locale et limites

- Un dump logique local `pg_dump -Fc --no-owner --no-acl` a été créé dans le conteneur puis restauré dans une base jetable nommée `mata_qa_restore_drill_20261013` — **BLOCKED**, pas PASS. Première erreur : le dump demande le rôle système `supabase_admin`. Après exclusion des propriétaires/ACL, `pg_cron` refuse sa création hors de la base `postgres` (`cron.database_name`), puis l’exclusion des objets pg_cron révèle une autre restriction de rôle Supabase (`permission denied to set parameter log_min_messages`) sur une fonction du schéma `realtime`.
- Le clonage PostgreSQL par template a également été refusé car deux services locaux étaient connectés à `postgres`; leurs sessions n’ont pas été interrompues. La base temporaire partiellement restaurée n’a pas été conservée et les fichiers de dump temporaires ont été retirés. Le conteneur source reste sain.
- Cela ne vérifie **pas** si la sauvegarde physique Supabase QA du 13 octobre est restaurable. Cette sauvegarde reste **NOT VERIFIED** tant que le tableau de bord/fournisseur n’a pas confirmé la restauration et ses prérequis; aucune restauration n’a eu lieu.

### Plan QA précis — aucune opération distante exécutée

1. **Geler l’identité** : relire le projet cible `kazlvtxkbsdhbfvtqqdp` et son état `ACTIVE_HEALTHY`; refuser toute commande si le ref diffère. Confirmer explicitement qu’il ne s’agit ni de production `qjdwxdbvrxedyfolnpol` ni de YOBALELMA.
2. **Point de restauration** : faire confirmer par Supabase qu’un backup QA précis est restaurable et relever son heure, sa rétention, les extensions et le délai; exporter un snapshot de schéma/ACL avant intervention. Ne pas déclencher la restauration.
3. **Précontrôles SQL en lecture seule** : sauver les sorties des requêtes de versions `schema_migrations`, l’inventaire collaborateurs et ACL (table + colonnes), `pg_policies`, vues dépendantes, triggers, références depuis les fonctions et leurs grants. Hacher les définitions QA disponibles pour détecter les changements pendant le contrôle.
4. **Garde-fou de version** : l’absence des 60 SQL reste une réserve non résolue. Examiner les différences par signatures d’état et postconditions sans écrire dans l’historique. Aucun `migration repair`, `db push`, réapplication historique ou faux checksum.
5. **Correctif ACL autonome** : après autorisation expresse d’appliquer en QA, envoyer seulement le contenu de la migration ciblée, entouré de `BEGIN/COMMIT`, puis interrompre si le nombre de lignes/objets ou les signatures préalables ne correspondent pas. Si une étape échoue avant commit, confirmer le rollback. Ne pas appliquer encore la migration complète `salon_collaborator_access` dans cette étape.
6. **Vérifications après ACL** : contrôler `has_table_privilege` et `has_column_privilege` pour `anon`, `authenticated`, `service_role`, y compris `profile_id`, `internal_role`, `staff_permissions`; vérifier que les deux policies sont intactes et que les champs d’affichage restent lisibles. Tester via Data API les profils publics, cartes d’équipe, créneaux et lecture/édition propriétaire, puis une réservation de contrôle sans modifier les données métier existantes.
7. **Invitations/migration complète** : traiter dans une étape distincte après résolution des divergences liées, copie QA restaurable confirmée, application de la migration complète sur restauration temporaire compatible Supabase, et tests avec comptes owner/collaborateurs A/B, emails, TTL 48h, usage unique, révocation, changement de permissions, sessions et conversations. Vérifier chaque fonction `SECURITY DEFINER`, `search_path` fixe, grants et appels directs.
8. **Retour arrière** : avant commit, rollback de transaction. Après commit, préférer une migration compensatrice **forward-only** qui rétablit la whitelist sécurisée; jamais réaccorder publiquement les colonnes internes. Une restauration du backup QA est une action distincte, après autorisation et vérification des écritures perdues depuis le point de sauvegarde.

### Verdict actualisé

- Recherche SQL Git : **PASS** (recherche effectuée et résultat quantifié), **0/60 source d’origine récupérée**.
- Correctif ACL + tests SQL sur PostgreSQL local : **PASS**.
- Restauration du dump local complet : **BLOCKED** par les rôles et extensions Supabase spécifiques; le clone par template est bloqué par les connexions internes.
- Équivalence historique des 60 versions : **BLOCKED / NOT PROVEN**.
- Application, test PostgREST et non-régression sur Supabase QA : **NOT EXECUTED**; la confidentialité QA demeure à risque tant que le correctif n’est pas autorisé et appliqué.
- Production, YOBALELMA, Vercel et déploiement : **NOT TOUCHED**.
- **NO-GO pour une migration complète QA**, en raison des SQL originaux 0/60 et de la restauration fournisseur non confirmée. Pour le correctif ACL indépendant, la décision détaillée plus bas est **GO conditionnel à une autorisation explicite**, avec assertions transactionnelles; la restauration fournisseur reste une réserve séparée pour les changements ultérieurs de schéma/données.

## Décision spécifique — correctif ACL uniquement (13 octobre 2026)

### État QA relu à nouveau

- Projet : `kazlvtxkbsdhbfvtqqdp`, `mata-beauty-video-qa-1171f9c`, `ACTIVE_HEALTHY`, PostgreSQL 17.6. Lecture catalogue seulement.
- `public.collaborators` : `anon`, `authenticated` et `service_role` détiennent tous les privilèges table-wide interrogés (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN). Tous les rôles API ont aussi SELECT/UPDATE sur `profile_id` et `internal_role`; ces colonnes existent en QA. Le test confirme l’exposition, il n’a pas lu de lignes métier.
- Policies présentes : `active collaborators public read` (SELECT, rôle `public`; actifs de salons approuvés, propriétaire ou permission admin) et `business owners manage collaborators` (ALL, propriétaire ou Super Admin). Aucune vue du schéma public dont la définition référence `collaborators` n’a été trouvée.
- RPC consultés : `get_team_available_slots` est exécutable par `anon` et `authenticated`, SECURITY DEFINER, `search_path=''`, et ne retourne que créneau, id public collaborateur, nom, titre, avatar et spécialités. `get_booking_team_availability` est SECURITY DEFINER à `search_path=''` et assemble ces disponibilités; il ne retourne pas `profile_id` ni le rôle. `save_team_member` est auth-only, SECURITY DEFINER, et vérifie `booking_private.require_owner`. `reassign_booking_collaborator` est auth-only, SECURITY DEFINER; il vérifie le propriétaire de la réservation. Les triggers de réservation utilisent SECURITY DEFINER et les helpers privés. Aucune de ces signatures/grants ne serait modifiée par le correctif ACL.
- L’API publique de disponibilités ne dépend donc pas d’un SELECT direct des colonnes de compte. Les pages de gestion équipe/salon lisent des colonnes de présentation incluses dans la whitelist; leurs writes directs concernent avatar/état/archivage. L’ajout d’un collaborateur, la gestion des services, l’affectation et les réservations utilisent les RPC/contrôles existants.

### GO / NO-GO

- **GO conditionnel pour l’application isolée du correctif ACL `20261013120000`**, après relecture de la migration finale et autorisation explicite distincte d’écriture QA. Raisons : le risque ciblé est confirmé par le catalogue; la migration ne touche ni lignes ni schéma; elle conserve les deux policies et ne change pas les fonctions; le correctif et les scénarios SQL de confidentialité/isolation ont passé sur la base locale; les colonnes nécessaires aux parcours observés restent accordées.
- **Ne pas appliquer maintenant** : l’utilisateur a explicitement demandé de préparer la procédure seulement. Pas de mutation QA n’a eu lieu.
- La restauration fournisseur non confirmée n’est pas une précondition technique absolue pour cette seule transaction ACL, car elle ne modifie pas les données et peut être compensée par une autre whitelist ciblée. Elle reste toutefois une réserve opérationnelle avant tout chantier de schéma/données plus large. La procédure ci-dessous doit être appliquée dans une transaction avec assertions avant `COMMIT`; si l’outil ne garantit pas l’atomicité ou si une assertion échoue, arrêter et ne pas valider.
- **NO-GO pour `20261013130000_salon_collaborator_access.sql` et toute migration globale** : invitations, tables privées et 60 divergences historiques restent indépendamment non validées.

### Procédure d’application ACL — seulement après autorisation

**Avant :** confirmer le ref QA `kazlvtxkbsdhbfvtqqdp`, état sain et absence de déploiement concurrent; relever les privilèges table et colonnes, les deux policies, les privilèges `service_role`, les définitions/signatures/grants des quatre RPC ci-dessus et les colonnes consommées. Conserver le résultat horodaté de ces SELECT. Vérifier que le script contient une unique transaction et seulement le `REVOKE` ciblé puis les `GRANT` listés; aucun `DROP`, `ALTER`, DML ou appel distant vers les autres migrations. Si le schéma a changé depuis le contrôle, arrêter.

**Appliquer :** sur QA uniquement, envoyer le SQL de `20261013175002_harden_collaborator_api_privileges.sql` comme migration nommée `harden_collaborator_api_privileges`. Ne pas lancer `db push`, ne pas inclure la migration 13:00 ni réparer les versions.

**Après :** vérifier que `anon` n’a plus de privilèges table-wide, n’a accès en SELECT qu’aux 14 colonnes publiques de la liste blanche et n’a aucun INSERT/UPDATE/DELETE; `authenticated` garde SELECT sur cette liste et UPDATE uniquement sur les champs d’édition autorisés; ni rôle API ne peut sélectionner ou écrire `profile_id`, `internal_role` ou `staff_permissions`; `service_role` reste inchangé; les deux policies, les signatures et grants RPC, triggers et nombres de réservations restent identiques. Tester via le Data API les cartes publiques et équipe, les disponibilités anonymes, une écriture de profil côté propriétaire, l’affichage/confirmation de réservation en compte QA et les refus d’accès aux colonnes privées. Ce dernier test Data API/QE reste **NOT TESTED** tant que la migration n’a pas été autorisée/appliquée.

**Compensation :** avant commit, rollback transactionnel. Après commit, ne pas rétablir les grants étendus. Si un champ de présentation requis manque, ajouter seulement ce champ public à la whitelist dans une migration compensatrice transactionnelle; si un parcours propriétaire échoue, ajuster le grant minimal correspondant et garder RLS. Rejouer les assertions d’ACL, puis les tests Data API. Les anciennes autorisations larges ne sont pas un plan de retour acceptable.

### Restauration compatible Supabase et stratégie pour les SQL manquants

- L’essai `pg_dump/pg_restore` local n’équivaut pas à la restauration de sauvegarde Supabase : il est bloqué par les rôles gérés, `pg_cron` et les paramètres du service Realtime. Le clone par template a échoué sans interrompre des sessions de service. Le point de restauration QA du 13 octobre est donc **NOT VERIFIED**.
- Méthode fournisseur sans modifier QA : dans le projet QA uniquement, ouvrir **Database → Backups**, sélectionner le backup exact, lire ses détails (type, heure, rétention, région, état exploitable) et la documentation d’**in-place restore / restore to a new project**. Ne cliquer sur aucune action Restore. Pour prouver une restauration sans altérer QA, il faut une destination temporaire dédiée et autorisée (projet/branche de développement), ce qui peut impliquer coût et application des migrations actuelles; en l’absence de cette destination et de l’autorisation correspondante, conserver **NOT TESTED**. Une indication “backup visible” n’est pas une preuve de restauration réussie.
- Pour les 60 sources perdues : établir une matrice par version distante et objets/postconditions observés; rechercher l’artefact de release/CI ou l’archive SQL hors Git auprès du fournisseur/propriétaire du déploiement. Si elles restent indisponibles, capturer des signatures du schéma QA et exécuter les vérifications d’effets de données pertinentes; préparer uniquement des migrations correctives **nouvelles** qui convergent l’état actuel vers un état cible explicite. Garder les écarts non démontrés comme blocage; ne pas réécrire l’historique.

**Décision finale : correctif ACL ciblé — GO conditionnel à une autorisation d’application et aux assertions avant commit; actuellement NON APPLIQUÉ. Système complet des collaborateurs/migrations QA — NO-GO.** Production, YOBALELMA, Vercel et déploiement n’ont pas été touchés.

## Précontrôle d’application — 13 octobre 2026

- **Projet/ref** revalidés via l’API Supabase : `kazlvtxkbsdhbfvtqqdp`, `mata-beauty-video-qa-1171f9c`, PostgreSQL 17.6, `ACTIVE_HEALTHY`; l’historique demeure à 106 migrations et se termine par `20261011103512`. Aucun accès à l’autre ref Production.
- **Backups consultés en lecture seule** sur `Database → Backups → Scheduled` du projet ci-dessus. Le point `13 Oct 2026 02:44:13 (+0000)` et plusieurs sauvegardes plus anciennes sont visibles, typées `PHYSICAL`, avec boutons Restore. Aucun bouton n’a été activé. La page ne donne pas de preuve que l’objet est restaurable; statut : **backup visible, restore NOT VERIFIED**. La page avertit que les objets Storage ne sont pas inclus dans ces sauvegardes.
- Le bandeau Supabase signale des problèmes techniques en cours. Le sélecteur de branche affiche `main (PRODUCTION)` alors que le projet ouvert porte le ref et le nom QA attendus. Aucun changement n’a été entrepris; avant une écriture future, le ref doit être reconfirmé dans le dialogue final d’application.
- **ACL relues** : `anon`, `authenticated`, `service_role` ont SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN sur la table. `profile_id` et `internal_role` sont SELECT/UPDATE pour anon/authenticated. Les champs publics attendus existent. Les deux policies et l’absence de vue publique dépendante sont confirmées.
- **Dépendances relues** : les RPC disponibilité (`get_team_available_slots`, `get_booking_team_availability`) sont SECURITY DEFINER, `search_path=''`, executables par anon/authenticated et ne retournent que les informations publiques de créneau/équipe. `save_team_member`, `reassign_booking_collaborator` et `archive_owned_business` sont protégées par authentification/permission et `search_path=''`. Le correctif n’altère aucune définition ou permission EXECUTE.
- **Aucune cible de restauration temporaire n’a été créée** : le dashboard propose “Restore to new project BETA”, mais créer un projet distinct peut engager des coûts et exige une autorisation séparée. Pour le correctif ACL sans données/schema, cette restauration n’est pas requise; son absence bloque seulement la preuve d’un test de restauration fournisseur.
- **Préconditions satisfaites pour préparer le correctif ciblé** : projet QA identifié, état actif, ACL exactes et policies relues, champs consommés comparés, tests locaux antérieurs passés, compensation définie en whitelist. **Bloqués** : succès de restauration QA, tests Data API/UI après migration, qualification des 60 historiques. **Risque résiduel** : l’accès direct public reste trop large en QA jusqu’à l’application; anomalie d’interface `main (PRODUCTION)` à revalider au dernier contrôle.
- **État historique du précontrôle** : à cette date, l’application QA n’avait pas été exécutée. Voir la mise à jour d’exécution ci-dessous pour l’état courant.

## Mise à jour du prérequis backup — contrôle final

- Relecture directe du dashboard Supabase du projet `kazlvtxkbsdhbfvtqqdp` : l’onglet **Scheduled backups** affiche `Free Plan does not include project backups` et propose un upgrade Pro pour obtenir jusqu’à sept jours de backups planifiés. Aucun backup n’est actuellement listé sur cette page. L’onglet **Point in time** indique que PITR est disponible comme add-on et propose de l’activer; ce n’est pas activé selon l’état affiché.
- Ce nouvel état contredit l’ancienne observation d’une liste de sauvegardes physiques du 13 octobre 02:44:13. L’état courant du dashboard prévaut pour la décision : **aucune sauvegarde QA restaurable vérifiable**, donc ne pas appliquer le correctif pour le moment. Je n’ai pas cliqué sur Restore, Upgrade ou Enable add-on.
- Le dashboard indique aussi `main PRODUCTION` pour la branche principale du projet dont le ref reste le QA attendu. Ce libellé est noté pour éviter toute confusion, mais aucune écriture n’est autorisée tant que le blocage backup n’est pas levé.
- Solution pour débloquer sans altérer QA : choisir explicitement une protection de sauvegarde pour ce projet QA (plan Pro donnant les sauvegardes planifiées, ou add-on PITR), attendre qu’un point apparaisse, puis confirmer qu’il est sélectionnable/restaurable. Pour une preuve pratique, utiliser **Restore to new project** vers une destination QA jetable distincte, jamais vers QA lui-même; cette action peut créer des coûts et requiert donc autorisation/coût confirmés. Une confirmation écrite de Supabase sur la restaurabilité du point précis peut remplacer le test pratique, mais doit référencer le backup et le projet exacts.
- **Décision du précontrôle avant l’application QA : NO-GO en attendant une preuve de sauvegarde.** Cette décision concernait les étapes de précontrôle antérieures et ne décrit pas l’état courant; voir la section d’exécution QA ci-dessous.

## Exécution ciblée QA — 2026-10-13

- Migration `harden_collaborator_api_privileges` appliquée uniquement au projet QA `kazlvtxkbsdhbfvtqqdp`; version enregistrée par Supabase : `20261013175002`. Seuls les ACL de `public.collaborators` ont changé; aucune ligne, policy, fonction ou autre projet n’a été modifié.
- Vérification SQL après application : table-wide SELECT/INSERT/UPDATE/DELETE/TRUNCATE = false pour `anon` et `authenticated`; SELECT sur `profile_id`/`internal_role` = false pour les deux rôles; SELECT sur `display_name` et `is_bookable` = true; UPDATE authentifié sur les seuls champs de présentation autorisés = true, UPDATE anon et champs internes = false. Les policies de lecture publique filtrée et de gestion propriétaire restent présentes.
- Test SQL `collaborator_api_privileges_hotfix.sql` exécuté en QA : **PASS**. Tests Vitest ciblés : **7/7 PASS**. En `SET LOCAL ROLE anon`, QA renvoie 6 prestations et 6 règles de disponibilité.
- Limites QA : aucun salon/collaborateur, aucune vidéo/média; les 6 réservations existantes ne permettent pas à elles seules de vérifier le parcours UI. Le test réel de réservation côté salon et les droits effectifs d’un propriétaire connecté restent **NOT TESTED**.
- Production reste inchangée et **NO-GO** : l’état des sauvegardes n’est pas confirmé. Aucune restauration payante, migration Production, rotation de secret, déploiement ou modification de YOBALELMA n’a eu lieu. Ne pas appliquer ce correctif en Production avant vérification de sauvegarde et autorisation distincte.
