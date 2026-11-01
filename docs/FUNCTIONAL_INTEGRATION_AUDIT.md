# Audit d’intégration fonctionnelle — Mata Beauty

Date de référence : 15 août 2026
Branche : `codex/full-audit-and-fixes`
Projet Supabase : `qjdwxdbvrxedyfolnpol`
Projet Vercel : `mata-beauty`

## Règle de lecture

- **OK** : parcours connecté à Supabase et couvert par une preuve automatisée ou distante.
- **Partiel** : données réelles présentes, mais au moins une action, un rôle ou une preuve distante manque.
- **Mock** : simulation volontaire et explicitement signalée.
- **Non connecté** : module de navigation sans workflow de données complet. L’interface l’indique désormais sans afficher de faux bouton.
- **Non testé distant** : implémentation présente, mais aucune preuve avec plusieurs sessions Supabase réelles sur la version courante.

## Matrice fonctionnelle

| Fonctionnalité | Écran principal | Tables / vues Supabase | API / RPC / action | RLS / autorisation | Rôles | État initial | Correction ou preuve actuelle | Statut |
|---|---|---|---|---|---|---|---|---|
| Auth email | Modale Auth, callback | `auth.users`, `profiles`, `account_roles` | Supabase Auth, `ensure_authenticated_profile` | session serveur + profil | tous | Connecté | PKCE, callback serveur, redirections protégées | OK |
| Auth Google | Modale Auth | `auth.users`, `profiles` | fournisseur Google Supabase | callback autorisé | tous | Configuration non prouvée | UI détecte le fournisseur ; véritable connexion Gmail encore à rejouer | Partiel |
| Récupération mot de passe | `/auth/update-password` | `auth.users` | Supabase Auth | session de récupération | tous | Connecté | URL production et Preview autorisées | OK |
| Redirection par rôle | routes `/app`, `/pro`, `/salon`, `/admin` | `profiles`, `admin_user_roles` | `requireWorkspace` | contrôle serveur | tous | Connecté | alias Studio canonisé et retour Auth conservé | OK |
| Profil client | Espace client | `profiles`, `client_profiles`, `profile_preferences`, `profile_privacy_settings` | `update_client_identity`, upserts RLS | propriétaire | client | Erreurs brutes possibles | écritures persistantes et erreurs publiques neutralisées | OK local / distant déjà couvert |
| Avatar | Profil client | Storage `avatars`, `profiles.avatar_url` | Storage upload | chemin propriétaire | client | Connecté | type et taille contrôlés ; erreur Storage masquée | Partiel : isolation upload distante à étendre |
| Profil prestataire | Dashboard / profil public | `provider_profiles`, `profiles` | onboarding et RPC admin | propriétaire + champs protégés | provider/admin | Connecté | statut et agrégats protégés par triggers | OK |
| Profil salon | `/salon` | `businesses`, `collaborators` | lectures génériques | RLS propriétaire | salon | Vue de données seulement | aucun formulaire complet de gestion du salon validé | Partiel |
| Catégories | accueil/recherche/admin | `categories`, `provider_categories` | `fetchActiveCategories` | lecture publique, gestion admin | public/admin | Liste UI codée en dur | noms, ordre, masquage et icône/image proviennent maintenant de Supabase ; écriture admin reste non connectée | Partiel |
| Sous-catégories | recherche | `services`, `provider_services` | catalogue | lecture publique | public | Liste codée en dur | filtres désormais dérivés des prestations réelles de la catégorie | OK lecture |
| Prestations | profil, réservation, dashboard, Studio | `provider_services`, `services` | insert RLS, sélection Studio | propriétaire / lecture active | provider/client | Connecté | création prestataire et association vidéo présentes | OK local ; distant à rejouer |
| Disponibilités | réservation, agenda | `availability_rules`, `availability_exceptions`, `bookings` | `get_available_slots` | RPC sécurisé | client/provider | Connecté | fuseau Dakar, exceptions et conflits couverts | OK |
| Anti-double réservation | réservation | `bookings` | contrainte d’exclusion GiST | base atomique | client/provider | Connecté | conflit `23P01` transformé en message sûr | OK |
| Réservation | parcours mobile | `bookings`, `booking_status_history` | insert + trigger `enforce_booking_contract` | client propriétaire, provider participant | client/provider/admin | Connecté | prix, durée, devise et provider recalculés côté SQL | OK |
| Statuts réservation | dashboards | `bookings`, `booking_status_history`, `notifications` | `validate_booking_update`, triggers | graphe selon rôle | client/provider/admin | Connecté | historique et notifications automatiques | OK |
| Favoris prestataire | accueil/profil/client | `favorites` | insert/delete | propriétaire | client | Connecté | recharge depuis Supabase après session | OK local ; multi-session à rejouer |
| Avis | profil/dashboard/admin | `reviews`, `provider_profiles` | insert/update + agrégat | réservation terminée, auteur/provider/admin | client/provider/admin | Connecté | unicité, note moyenne et modération protégées | OK schéma ; E2E distant partiel |
| Conversations réservation | dashboards | `conversations`, `conversation_members`, `messages` | `ensure_booking_conversation`, Realtime | membres seulement | client/provider | Connecté | pagination, lecture et notification déjà validées avec comptes réels | OK |
| Support | profil client/support | `support_tickets`, `support_messages` | insert RLS | demandeur / agents autorisés | client/support/admin | Ticket réel | pièces jointes et réouverture absentes | Partiel |
| Notifications réservation/message | dashboards | `notifications`, `notification_preferences` | triggers SQL | destinataire uniquement | tous | Connecté | réservation, statut, message, modération provider | OK |
| Notifications sociales | Inspiration | `notifications`, `notification_preferences`, `post_likes`, `post_comments`, `reviews` | triggers `notify_post_engagement`, `notify_review_created` | destinataire, préférence, anti-spam | client/provider | Manquantes pour certains événements | migration distante appliquée ; trois triggers vérifiés présents (`true/true/true`) | OK schéma ; événement multi-compte à rejouer |
| Feed Inspiration | `/discover`, accueil social | `social_feed`, `posts`, `social_post_media` | vues/RPC sociaux | contenu publié + blocages | public/client | Connecté | média privé signé, autoplay et états vides | OK |
| Publication vidéo | `/pro/studio` | `posts`, `social_post_media`, `post_services`, Storage `provider-social-media` | `create_provider_video_post` | owner + provider approuvé | provider/salon | Connecté | bucket privé, chemin structuré, service associé | OK schéma ; upload distant bloqué par secret Preview invalide |
| Photos / avant-après | Studio | mêmes tables/bucket | `create_social_media_post` | owner + publication guard | provider/salon | Connecté | UI et stockage présents | Partiel : upload réel non rejoué |
| Programmation social | Studio | `posts.scheduled_for` | statut `scheduled` | owner | provider | Date persistée | aucun worker de publication prouvé | Partiel |
| Likes | Inspiration | `post_likes`, `posts.like_count` | `toggle_post_like` | authentifié | client/provider | Connecté | compteur serveur | OK |
| Commentaires | Inspiration | `post_comments` | insert/delete/report | auteur/admin + publication visible | client/provider | Connecté | réponses, suppression auteur et signalement présents | OK local |
| Sauvegardes | Inspiration/client | `post_saves`, collections | `toggle_post_save` | propriétaire | client | Connecté | persistant et visible dans espace client | OK |
| Signalements sociaux | Inspiration/modération | `reports`, `social_post_reports`, `moderation_actions` | `report_social_post`, RPC admin | auteur / permissions modération | client/admin | Connecté | masquage exclut le contenu du feed et action auditée | OK schéma ; E2E distant à rejouer |
| Statistiques créateur | Studio | vues d’agrégats, `video_views`, `post_booking_clicks` | `provider_creator_statistics` | propriétaire | provider | Connecté | vues, engagement et attribution réservation | OK |
| Paiement | réservation/API finance | `payments`, `payment_events`, `refunds` | routes `/api/payments/*` | serveur + idempotence + webhook | client/finance | `mock` volontaire | aucune prétention de débit réel | Mock bloquant production |
| Commissions | finance | `payments`, `platform_commissions`, `commission_rules` | calcul paiement/ledger | finance/provider lecture | provider/finance/admin | Schéma présent | calcul final sur réservation terminée non prouvé hors paiement validé | Partiel |
| Wallet / ledger | finance/provider | `wallets`, `wallet_ledger` | API wallet, release RPC | owner/finance, append-only | provider/finance | Connecté | solde dérivé, écritures immuables | OK schéma |
| Dashboard client | `/app` | réservations, favoris, paiements, avis, notifications | requêtes Supabase | propriétaire | client | Connecté | données persistantes ; aucun chiffre fictif identifié | OK |
| Dashboard prestataire | `/pro` | réservations, services, notifications, posts | requêtes et mutations Supabase | propriétaire | provider | Connecté | revenus explicitement théoriques en mode mock | Partiel |
| Dashboard salon | `/salon` | business, collaborateurs, réservations | lectures génériques | owner/team | salon | Plusieurs écrans catalogue seulement | planning équipe et revenus consolidés non validés E2E | Partiel |
| Super Admin | `/admin` | vues admin, audit, utilisateurs, réservations | RPC admin | RBAC serveur | super_admin | Connecté | suspension, validation, réservation, modération et maintenance réelles ; boutons décoratifs retirés | OK pour actions livrées |
| Support/Finance/Modération/Opérations | espaces privés | ressources autorisées | lectures génériques + RPC dédiés | permissions granulaires | agents | Navigation protégée | plusieurs modules restent sans workflow d’écriture | Partiel / signalé explicitement |
| Recherche publique | accueil/recherche | catalogue réel | filtres client | lecture publique | public | Connecté | service, catégorie, provider et zone | OK local |
| Recherche espaces privés | en-tête workspace | données RLS du module | filtre `?q=` sur données autorisées | RLS table | rôles privés | champ sans action | formulaire connecté et résultats/état vide réels | OK local |
| Uploads KYC | onboarding | Storage `provider-documents` | Storage | bucket privé owner/admin | provider/onboarding | Connecté | accès signé et journalisation de lecture admin non prouvés | Partiel |
| Audit logs | admin/finance | `audit_logs`, `admin_audit_logs`, `financial_audit_log` | triggers/RPC | lecture permissionnée, append-only | admin/finance | Connecté | actions sensibles couvertes ; exhaustivité à tester par matrice | Partiel |
| Responsive | application entière | — | Playwright | — | tous | Couverture large | 320, 360, 375, 390, 430, tablette, desktop | OK sur scénarios existants |
| Observabilité | serveur/API | logs Vercel + audits SQL | request-id partiel | serveur | DevOps | événements métier dispersés | nomenclature structurée exhaustive non livrée | Partiel |

## Corrections de cette phase

1. La recherche privée est maintenant un vrai formulaire et conserve sa requête dans l’URL.
2. Le bouton Notifications privé pointe vers le module réellement autorisé ; il n’est pas rendu si ce module n’existe pas.
3. Les modules sans ressource ne se présentent plus comme « actifs » : ils annoncent explicitement qu’ils ne sont pas connectés.
4. Les boutons administratifs décoratifs « Ouvrir », « Détail » et navigation calendrier ont été retirés ou transformés en contenu non interactif.
5. Les erreurs Supabase/Storage ne sont plus affichées directement dans les écrans client, messagerie, Studio, dashboard et Super Admin.
6. Un mapping public central couvre conflit de créneau, doublon, relation absente, RLS, session et réseau.
7. Les likes, commentaires et avis créent désormais des notifications côté SQL, en respectant `social_in_app`, sans auto-notification et avec anti-spam de 24 h.
8. Le faux graphique hebdomadaire du dashboard exécutif a été supprimé ; seuls les compteurs renvoyés par `get_admin_dashboard` sont désormais affichés.
9. Les catégories et filtres de prestations publics ne sont plus codés en dur : ils suivent `is_active`, `sort_order`, le libellé et l’icône/image Supabase.
10. La dépendance transitive `nanoid` est verrouillée sur la version corrigée `3.3.18` après détection de l’avis GHSA-2v37-7h3g-55p8.

## Preuves automatisées disponibles

- Vitest : domaines Auth, onboarding, disponibilité, réservation, avis, paiements, sécurité paiement, feed social, administration, permissions workspace et messages d’erreur publics.
- Tests structurels Node : schéma, migrations, sécurité, Studio, OAuth et contrôles d’interface.
- Playwright local : parcours public, réservation classique, réservation depuis le feed, reprise après Auth, isolation d’une autre cliente et matrice responsive.
- Playwright distant existant : messagerie multi-session, profil client, accès admin et feed social.
- Scripts de recette distante : `verify-messaging-remote.mjs`, `verify-client-profile-remote.mjs`, `verify-admin-access-remote.mjs`, `verify-social-remote.mjs`.

## Résultats de cette phase

- ESLint : réussi.
- TypeScript strict : réussi.
- Vitest : **57/57**.
- Tests structurels Node : **15/15**.
- Playwright : **144/144** en 4,7 minutes, zéro skip, sur desktop, 320, 360, 375, 390, 430, tablette, laptop et widescreen.
- Réservation classique : **8 actions**, moyenne **7,404 s**, minimum 4,398 s, maximum 11,418 s.
- Réservation depuis Inspiration : **6 actions**, moyenne **6,212 s**, minimum 4,522 s, maximum 7,667 s.
- Migration distante notifications sociales : succès ; triggers like/commentaire/avis vérifiés `true / true / true`.
- Recette sociale distante : arrêt avant création du premier compte, car la clé serveur Preview Vercel est invalide (`401`). Aucun utilisateur ou contenu de test n’a été créé.
- Build Next.js 16 de production : réussi, 16 pages/routes applicatives plus 7 routes API.
- Audit des dépendances de production : aucune vulnérabilité connue après verrouillage de `nanoid` 3.3.18.

## Blocages et interventions humaines

1. Remplacer dans l’environnement **Preview Vercel uniquement** la valeur invalide de `SUPABASE_SERVICE_ROLE_KEY`. Ne jamais l’exposer au navigateur ou à Git.
2. Fournir ou valider des comptes de recette dédiés pour client, prestataire approuvé, salon, admin et super administrateur, ou autoriser leur création temporaire via la clé serveur corrigée.
3. Le paiement reste `PAYMENT_PROVIDER_MODE=mock` conformément aux règles du dépôt. Une homologation PSP sandbox est nécessaire avant production.
4. La connexion Google doit être rejouée avec un nouveau compte réel avant de la classer OK.
5. Les modules salon, publication programmée, commissions hors paiement validé, KYC signé, campagnes, rapprochement et observabilité structurée restent partiels et ne doivent pas être présentés comme terminés.

## Verdict courant

Le socle réservation, Auth, profils, favoris, avis, messagerie, feed, Studio, modération, RBAC et audit est connecté. La production n’est pas encore autorisée : le paiement est volontairement mock et la recette distante multi-rôles de la version courante est bloquée par la clé serveur Preview invalide. La Preview reste le seul environnement de validation autorisé.
