# MATA Beauty — permissions, modules internes et matériel réel

Recette du 7 octobre 2026. Domaine : https://mata-beauty.com. Ce rapport remplace le bilan initial de `491db45`, conservé dans Git ; il ne transforme pas les anciens échecs en PASS sans retest.

## Version réellement servie

Code applicatif : `252955691d581e8ae42e905cec521d8fdf83cd81`. Déploiement : `dpl_6FXu9yuK2UjR2oiaooDiiQbzHvA3`, URL immuable https://mata-beauty-ntu6ys8eb-africrm.vercel.app.

À **17:43:24 UTC**, mata-beauty.com répond HTTP 200 ; les **15 chemins des ressources JavaScript** correspondent au déploiement immuable. La configuration publique contient le backend de production, pas celui de QA. Il s’agit d’une comparaison des chemins, pas d’un hash de tous les octets. Preuve locale : `work/final-audit/production-version-2529556.json`.

Le code vidéo n’a pas été refondu. Paiement toujours **mock**. Maintenance désactivée en production, vérifiée en base après publication. Aucun transfert financier réel, campagne commerciale ou suppression irréversible de données utilisateur n’a été effectué.

## Classification des 48 routes initialement indisponibles

**31 A, 0 B, 17 C**. Le test initial utilisait Super Admin avec MFA ; les 48 échecs n’étaient donc pas des refus attendus pour ce rôle. Le classement individuel et la cause sont dans [le détail des 48 routes](MATA_BEAUTY_INTERNAL_ROUTE_CLASSIFICATION_2026-10-07.md).

- A : sources et composants raccordés/corrigés ; les 31 routes sont désormais accessibles au rôle autorisé. Les actions ne sont qualifiées que lorsque les tests dédiés ci-dessous les exécutent réellement.
- C : 17 anciennes routes retirées, ouverture directe avec Super Admin → 404 attendue, PASS. Aucun élargissement des droits des autres rôles.
- Les registres de campagnes, litiges, versements et rapprochements ne sont pas présentés comme des traitements métier complets.

## Matrice réelle et périmètre de la preuve

[Matrice CSV de 1 302 contrôles](MATA_BEAUTY_ROLE_MATRIX_2026-10-07.csv), [comptages JSON](MATA_BEAUTY_ROLE_MATRIX_2026-10-07.json). Le script `scripts/build-permission-matrix.mjs` exporte uniquement des champs de preuve autorisés, sans identifiants de comptes de test ni secrets.

| Rôle | Refus de routes attendus PASS | Écrans rendus, actions non qualifiées dans cet inventaire | Contrôles de permissions | Opérations API réelles |
|---|---:|---:|---:|---:|
| Client | 88 | 0 | 24 | 14 |
| Professionnel | 88 | 0 | 24 | 14 |
| Onboarding | 78 | 10 | 48 | 14 |
| Support | 78 | 10 | 48 | 14 |
| Finance | 76 | 12 | 48 | 14 |
| Modération | 80 | 8 | 48 | 14 |
| Content Manager | 79 | 9 | 48 | 14 |
| Admin | 57 | 31 | 48 | 14 |
| Super Admin | 0 | 88 | 48 | 14 |
| Total | **624** | **168** | **384** | **126** |

**1 134 PASS, 0 FAIL, 168 NOT TESTED** dans cette matrice. Les 624 PASS vérifient un refus serveur avec session réelle, pas seulement l’absence d’un bouton. Les 384 PASS portent sur 24 permissions, AAL1 puis AAL2 pour les rôles internes. Les 126 PASS exécutent 14 opérations par rôle avec lecture de contrôle : catégories CREATE/UPDATE/DELETE, ticket READ/UPDATE, signalement READ/ACTION, suspension utilisateur/professionnel, réglage sensible READ/UPDATE, rôles READ, insertion directe de rôle refusée et lecture d’un brouillon professionnel étranger.

Les 168 NOT TESTED ne sont pas 168 écrans cassés : ce sont les ouvertures réussies dont cet inventaire ne valide pas toutes les actions métier. Les suites dédiées valident certaines de ces actions séparément. **Cette matrice ne certifie pas toutes les combinaisons possibles des 91 RPC SECURITY DEFINER, de leurs paramètres et de toutes les tables.** Le contrôle d’un garde de permission n’est pas assimilé à l’exécution de chaque opération qu’il protège.

## Recettes exécutées et preuves

Les [preuves nommées exportées sans secrets](MATA_BEAUTY_PERMISSION_EVIDENCE_2026-10-07.json) sont conservées avec le rapport. Les nombres ci-dessous sont des assertions ou scénarios de suites distinctes, souvent recouvrants ; ils ne doivent pas être additionnés comme des fonctionnalités uniques.

| Zone | Action réellement exécutée | Résultat observé | Statut | Preuve locale |
|---|---|---|---|---|
| Équipe & Accès API | Invitation, activation, MFA, rôles, suspension, révocation, audit, restrictions d’agrégats | 34 contrôles conformes en production après correction MFA | PASS | `work/team-audit/production-rpc-results.json` |
| Invitations initiales distinctes | Finance, Support, Onboarding, Modération ; e-mail Resend de test, activation, MFA, espaces permis/refusés, changements de rôle, suspension/réactivation/révocation | Finance 17 ; autres rôles 18 chacun | PASS | `work/team-audit/production-ui*-results.json` |
| MFA historique | Sept rôles internes créés avec l’ancienne exemption ; refus avant MFA, accès après | 21 contrôles conformes QA et production ; aucune exemption active restante | PASS | `work/permission-audit/legacy-mfa-production.json` |
| Sécurité historique | KYC, avis, notes internes, anciennes RPC, propriété | 44 contrôles conformes production après f212471 | PASS | `work/permission-audit/verification-production-f212471.json` |
| Élévation de privilèges | Métadonnées, auto-attribution, révocation, MFA | 24 contrôles conformes production | PASS | `work/final-audit/final-role-security.json` |
| Confidentialité des profils | Champs privés, RPC propriétaire, suspension protégée | 7 contrôles conformes QA et production | PASS | `work/permission-audit/profile-privacy-production.json` |
| Intégrité sociale/KYC | Propriété prestation/commentaire, documents privés, alertes anti-abus | 23 contrôles conformes production | PASS | `work/permission-audit/social-integrity-production.json` |
| Lancement/cohorte/rappels | Droits, calculs de cohorte, rappels idempotents, annulation | 45 contrôles production ; 46 sur QA | PASS | `work/permission-audit/launch-boundaries-production.json` |
| Suppression de compte API | Demande idempotente ; mauvaise attribution/refus ; prise en charge SA/MFA ; désactivation/sessions/audit | 13 contrôles conformes production | PASS | `work/permission-audit/deletion-workflow-production.json` |
| Suppression de compte UI | Ouverture de la file, motif, prise en charge, statut vérifié | 4 contrôles conformes production | PASS | `work/permission-audit/deletion-ui-production.json` |
| Catégories | Content Manager crée, modifie puis supprime une catégorie synthétique | 4 contrôles conformes production | PASS | `work/permission-audit/catalog-actions-production.json` |
| Commentaires | Modération masque/restaure sans réécrire l’auteur ; audit | 3 contrôles conformes production | PASS | `work/permission-audit/module-actions-production-moderator.json` |
| Avis | Modération masque/restaure ; journal vérifié | 4 contrôles conformes production | PASS | `work/permission-audit/decision-actions-production-moderator.json` |
| Remboursements | Finance rejette une demande mock par interface, état et audit vérifiés | 1 décision et absence d’erreur JS conformes en production, mode mock | PASS | `work/permission-audit/decision-actions-production-finance.json` |
| Concurrence remboursement | Deux demandes simultanées ne dépassent pas le montant réservé | 6 contrôles QA ; aucun remboursement fournisseur réel testé | PASS sur QA | `work/permission-audit/refund-concurrency-qa.json` |
| Réservation concurrente | Prix/statut protégés, demandes concurrentes, créneau unique | 8 contrôles conformes production | PASS | `work/final-audit/booking-concurrency.json` |
| Maintenance | Activer, 503 public/Client/Pro/API, message échappé, administration accessible, désactiver | 7 contrôles QA ; pas d’interruption volontaire du site public | PASS sur QA | `work/permission-audit/maintenance-ui-qa.json` |
| Versements Super Admin | Lire le registre réel puis actualiser ; réponse API 200 et zéro erreur JS | 2 contrôles conformes sur 2529556 | PASS | `work/permission-audit/payout-register-production.json` |
| Profils et Support | Visiteur, Client, Pro, Onboarding, Support, Modération, Admin, SA ; sessions ; échanges Client/Support et résolution | 12 scénarios conformes sur 1c97d30, avant le dernier raccordement du registre des versements | PASS | `work/final-audit/post-1c97d30-roles` |

Le libellé historique « Preview link » dans la preuve d’invitation est générique ; le script vérifie réellement que l’origine du lien reçu égale la cible du test, ici `https://mata-beauty.com`.

## Anomalies corrigées : cause, risque et validation

| ID | Problème / cause technique | Risque et fonction | Correction et fichiers principaux | Bloquant avant lancement | Statut |
|---|---|---|---|---|---|
| SEC-01 | `write_admin_audit` appelable directement | Falsification des journaux | Retrait EXECUTE aux rôles API ; audit interne maintenu | OUI | PASS QA/production |
| SEC-02 | Calcul de complétude accessible pour un brouillon étranger | Divulgation d’informations professionnelles | Fonction interne, wrapper propriétaire/agent conservé | OUI | PASS QA/production |
| SEC-03 | Ancien rattachement de paiement accepte fournisseur/référence arbitraire | Intégrité des paiements | Entrée serveur, propriétaire, test et rattachement unique | OUI | PASS QA/production |
| SEC-04 | Note Support interne lisible par le demandeur | Confidentialité des échanges | RLS distincte messages publics/notes internes | OUI | PASS QA/production |
| SEC-05 | Déclencheurs documents et avis absents en production | Auto-revue KYC et falsification d’avis | Rattachement/versionnement, règles d’auteur et professionnel corrigées | OUI | PASS QA/production |
| SEC-06 | Entrées historiques d’approbation/remboursement sans contrôle actuel | Contournement des parcours | Révocation des entrées héritées, conservation des RPC actuelles | OUI | PASS QA/production |
| SEC-07 | Agrégats financiers accessibles à Support | Fuite financière | `20261007144455_scope_internal_dashboard_aggregates.sql` | OUI | PASS QA/production |
| SEC-08 | Commentaires/prestations sociales insuffisamment liés à leur propriétaire | Falsification et incohérence feed/réservation | `20261007150828_enforce_social_record_integrity.sql`, audit visibilité | OUI | PASS QA/production |
| SEC-09 | Colonnes privées de profils et réactivation personnelle exposées | Données personnelles et contournement suspension | Migrations `20261007155416` et `20261007155527`, RPC propriétaire | OUI | PASS QA/production |
| SEC-10 | Support pouvait traiter les publications via `reports.manage` | Modération hors rôle | `20261007161717_isolate_support_from_content_moderation.sql` | OUI | PASS QA/production |
| SEC-11 | Deux remboursements pouvaient réserver plus que le paiement | Surremboursement potentiel | `20261007162636_reserve_pending_refund_amounts.sql`, verrouillage et cumul des montants réservés | OUI avant finance réelle | PASS concurrence QA ; décisions UI production mock |
| SEC-12 | Sept anciennes affectations avaient `requires_mfa=false` | Droits internes avant second facteur | `20261007173000_require_mfa_for_legacy_internal_access.sql`, exigence MFA indépendante de l’ancien drapeau | OUI | PASS 21 QA + 21 production |
| SEC-13 | Insertion directe d’une demande de suppression avec état falsifié ; aucune prise en charge | Faux statut d’effacement | `20261007170500_process_account_deletion_requests.sql`, `app/account-deletion-queue.tsx` | OUI | PASS API + UI production |
| MOD-01 | Historiques interrogeaient une table inexistante ; connecteurs manquants | Modules inutilisables/données sémantiquement erronées | `app/workspace-module.tsx`, sources onboarding/modération/finance distinctes, route Admin autorisée côté serveur | OUI | Ouvertures réussies, actions dédiées listées séparément |
| MOD-02 | Dépendances Lancement/Cohorte/antifraude/rappels absentes | Indicateurs ou automatisations présumés fonctionnels | Migrations `20261007153936` et `20261007160629`, RLS et idempotence | OUI pour leur utilisation | PASS suites dédiées |
| MOD-03 | Maintenance enregistrée mais non appliquée ; état sensible non chargé | Faux contrôle d’arrêt du site | `proxy.ts`, `app/super-admin.tsx`, RPC publique limitée au booléen/message | OUI pour ce contrôle | PASS activation QA, désactivée en production |
| MOD-04 | Versements SA affichait un avertissement sans registre | Supervision financière incomplète | `app/super-admin.tsx`, source payouts sous RLS, lecture seule | NON pour bêta sans paiement en ligne | PASS production 2529556 |

Reproductions détaillées : scripts `verify-permission-audit`, `verify-role-crud`, `verify-legacy-mfa`, `verify-profile-privacy`, `verify-social-integrity`, `verify-refund-concurrency`, `verify-deletion-workflow` et preuves locales correspondantes. Chaque PASS de sécurité couvre les assertions nommées, pas une certification générale.

## Règle retenue pour les demandes de suppression

Choix délégué par l’utilisateur (« choisi ») : **prise en charge manuelle après désactivation**, sans destruction automatique irréversible des réservations et journaux.

1. Le Client dépose une demande ; une nouvelle tentative réutilise la demande en cours.
2. Super Admin avec MFA examine le dossier et saisit un motif. Les comptes internes et son propre compte ne sont pas traités par cette file. Les réservations actives ou paiements en attente empêchent cette transition.
3. La prise en charge suspend le profil, bloque Auth et révoque les sessions ; elle produit un audit. Le statut reste `reviewing`, `processed_at` reste vide.
4. L’opérateur inventorie ensuite les données à effacer/anonymiser et celles dont la conservation doit être justifiée. Il ne déclare pas « supprimé » avant exécution et vérification de cet examen. Aucun délai légal universel n’est inventé dans le code.

La fin de l’effacement est une opération manuelle à documenter par demande. Ce correctif ne constitue pas un moteur automatique d’effacement ou une validation juridique des durées de conservation.

## Réserves explicites avant lancement public

| Problème | Risque | Fonction concernée | Bloquant avant lancement | Correction/contrôle nécessaire | Statut |
|---|---|---|---|---|---|
| Qualification adverse non exhaustive de toutes les RPC/table/opérations | Cas d’autorisation non encore exercés | 91 SECURITY DEFINER authenticated dont 18 anon ; ce nombre n’est pas un nombre de vulnérabilités | OUI pour annoncer un audit exhaustif | Compléter les scénarios paramétrés manquants ; ne pas extrapoler les 384 gardes ou 126 opérations | NOT TESTED |
| Versements réels non configurés | Aucun transfert vers les professionnels | Payouts | OUI pour finance réelle ; NON pour bêta paiement sur place | Fournisseur validé, double validation, tests de transfert/reprise avant activation | Hors périmètre mock ; workflow incomplet |
| Rapprochement fournisseur non exécuté | Écarts financiers non réconciliés automatiquement | Reconciliation | OUI pour finance réelle ; NON pour bêta mock | Valider un fournisseur puis qualifier le traitement de ses données | Workflow incomplet ; registre seul |
| Litiges : registre sans chaîne de décision complète | Traitement non autonome des litiges financiers | Disputes | OUI avant promesse de traitement automatisé ; traitement humain nécessaire en bêta | Définir et qualifier les transitions autorisées ; pas de décision fictive | Workflow incomplet ; registre seul |
| Campagnes : registre sans envoi qualifié | Envoi massif non validé | Notification campaigns | NON si aucune campagne n’est lancée | Qualification dédiée destinataires/consentement/idempotence avant usage | Workflow incomplet ; registre seul |
| Protection contre mots de passe compromis désactivée chez le fournisseur | Mot de passe connu comme compromis accepté | Supabase Auth | À lever avant lancement public sans réserve | Réglages Auth → protection des mots de passe compromis ; offre Pro ou supérieure selon la documentation fournisseur, aucun achat autorisé implicitement | BLOCKED : console authentifiée non pilotable dans cet environnement |
| `pg_net` signalé dans public | Avertissement d’extension | Extension non relocalisable ; fonctions dans net, schéma non exposé REST | NON sur les contrôles effectués | Suivre la maintenance fournisseur ; ne pas supprimer/recréer l’extension pour masquer l’avertissement | Réserve documentée |
| Trackpad physique | Comportement matériel non observé | Pages longues/feed/modales/back-office | NON seul pour bêta ; requis avant affirmation matérielle | Test physique | NOT TESTED — PHYSICAL TRACKPAD REQUIRED |
| Boutons connexion/déconnexion sur téléphone physique | Simulation différente du geste réel | iPhone/Chrome | NON pour bêta accompagnée | Retour humain explicite sur les deux boutons | NOT TESTED |
| Autres appareils/navigateurs mobiles | Compatibilité non démontrée | Safari/Android et réseaux mobiles | NON pour bêta limitée aux appareils vérifiés | Recette sur matériel représentatif | NOT TESTED |

Le connecteur de contrôle du navigateur de l’utilisateur échoue au démarrage ; les tests Playwright dans Chromium restent disponibles. Les deux moyens ne sont pas confondus. La protection fournisseur reste désactivée : aucun PASS n’est annoncé pour elle. Référence : [documentation Supabase sur les mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Inventaire SQL final : **105 tables publiques, 0 sans RLS**, aucune affectation interne active exemptée de MFA. [Annexe des 91 RPC et de leurs signatures](MATA_BEAUTY_RPC_INVENTORY_2026-10-07.json), dont 18 exécutables par anon : inventaire, pas PASS. `btree_gist` déplacée vers extensions, contraintes de réservation retestées. Les tables RLS sans politique volontairement fermées restent inaccessibles aux rôles API. Les avertissements SECURITY DEFINER sont conservés, pas supprimés artificiellement.

## Incidents de recette conservés

- `/support-agent/users` a affiché une indisponibilité transitoire lors d’un premier passage SA. Trois ouvertures directes puis un nouveau parcours complet de 88 routes SA passent. Aucun correctif spéculatif ni permission supplémentaire ; cause exacte du dépassement transitoire non démontrée.
- Le premier scénario dossier a dépassé l’assertion de 5 secondes après « Complément reçu ». La trace montre une requête en cours annulée à l’arrêt du test, pas un refus de rôle établi. Le scénario complet a ensuite passé sans modification du produit ni augmentation du délai. Cette occurrence reste signalée.
- Les anciennes fixtures qui omettaient le MFA ont échoué après le durcissement légitime. Elles utilisent désormais un vrai TOTP ; la protection de production n’a pas été affaiblie pour faire passer les tests.
- Certaines fixtures financières restent dans le journal immuable. Leurs comptes sont bannis, profils suspendus et rôles révoqués ; aucune règle append-only n’a été levée pour les supprimer.

## Matériel

GPS iPhone 15 Pro Max / Chrome : **PASS déclaré par l’utilisateur**, après correction de l’autorisation ; pas observé directement par l’agent. Molette synthétique testée en Chromium à **1366×768, 1440×900 et 1920×1080** dans la suite MFA ; cela ne prouve pas le trackpad physique. Responsive Auth et autres viewports couverts par les suites indiquées, sans prétendre à une validation sur tous les téléphones.

## Comptages et décision

- Routes nécessaires encore indisponibles dans le dernier inventaire : **0 / 31 A** ; 17 C retirées.
- Modules internes dont le workflow autonome reste incomplet : **4** (versements réels, rapprochement fournisseur, litiges, campagnes). Leurs registres sont raccordés ; aucune nouvelle fonctionnalité n’a été inventée pour les prétendre complets.
- Matrice : **FAIL = 0 ; NOT TESTED = 168**. Ces 168 sont des lignes d’ouverture sans qualification exhaustive des actions, pas des défauts prouvés.
- Réserves hors matrice : **BLOCKED = 1** (protection fournisseur), **NOT TESTED = 4 groupes** (qualification complète RPC, trackpad, boutons téléphone physique, autres appareils). Total NOT TESTED de ce rapport : **172 unités explicitement définies**, et non 172 fonctionnalités distinctes.
- Vulnérabilités HIGH/CRITICAL reproduites et encore non corrigées dans le périmètre testé : **0**. Ce nombre ne signifie pas absence garantie de vulnérabilités sur les surfaces non qualifiées.

**B — BÊTA CONTRÔLÉE**, limitée à un groupe accompagné, paiement sur place/mock, traitement humain des litiges et suppressions, aucune campagne ni opération financière réelle. **Pas de validation de lancement public général** : les réserves ci-dessus restent à lever, notamment l’audit adverse complémentaire et la protection Auth fournisseur.

## Retests sur le dernier déploiement 2529556

Directement sur mata-beauty.com, après vérification de version : **11 scénarios navigateur PASS, zéro échec final**.

| Suite | Parcours exécuté | Statut | Preuve locale |
|---|---|---|---|
| Vidéo, 4 scénarios | MP4 Studio → feed ; photo/avant-après → Storage ; interactions → profil/prestation/réservation ; signalement → modération → masquage/audit/restauration | PASS | `work/final-audit/post-2529556-video/.last-run.json` |
| Dossier et MFA, 2 scénarios | Quatre documents → consultation privée/PDF → complément → remplacement → approbation → accès Pro/notifications ; second facteur et défilement desktop | PASS | `work/final-audit/post-2529556-dossier/.last-run.json` |
| Recette transverse, 5 scénarios | Catégories → prestation/prix/créneaux ; Salon CRUD → réservation/message/avis/statistiques ; profil/confidentialité ; navigation publique ; responsive Auth | PASS | `work/final-audit/post-2529556-broad/.last-run.json` |

Latence observée de démarrage vidéo : **465 ms** pour le seul échantillon mesuré dans cette recette, sans généralisation aux téléphones/réseaux. Les fichiers `.last-run.json` confirment la fin de chaque suite ; les noms et nombres de scénarios proviennent de la sortie Playwright conservée dans la session.

Vérifications avant commit : `pnpm lint`, `pnpm typecheck`, `pnpm test` (**90 tests**) et `pnpm build` PASS. Les commits de rapport ultérieurs ne changent pas la version applicative 2529556 servie en production.
