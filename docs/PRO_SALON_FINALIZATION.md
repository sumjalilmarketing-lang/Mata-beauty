# Finalisation Professionnel / Salon — recette locale

État contrôlé le 13 octobre 2026 sur `codex/pro-salon-maquette`. Aucun déploiement, accès de base distante, migration distante ou changement de projet Supabase n’a été effectué.

## Résultats des vérifications

| Contrôle | Résultat | Preuve / limite |
|---|---|---|
| `pnpm lint` | PASS | 0 erreur, 2 avertissements `<img>` préexistants dans `app/conversation-media.tsx`. |
| `pnpm typecheck` | PASS | `tsc --noEmit`. |
| `pnpm test` | PASS | 28 fichiers, 139 tests. |
| `pnpm build` | PASS | Build Next production local, routes d’invitation incluses. |
| E2E ciblés | PASS avec réserves | 49 PASS, 0 FAIL, 2 SKIP sur 51, Playwright desktop, viewport 390 px, iPhone WebKit. Les SKIP sont le test de molette réservé au desktop, sauté sur les deux profils mobiles. Données et appels Supabase simulés. |
| RLS/SQL sur comptes distincts | BLOCKED | Migration créée mais non appliquée. Aucun compte préproduction isolé ni base locale qualifiable n’a été utilisé ; les droits serveur et policies doivent être exécutés avant déploiement. |
| Recette visuelle authentifiée et captures réelles | NOT TESTED | Les scénarios E2E ciblés couvrent l’accueil, le feed et l’authentification simulée, pas les comptes Client/Pro/Salon/Collaborateur/Super Admin ni les pièces KYC réelles. Aucun screenshot authentifié mobile/desktop n’a été produit. |
| Production | NOT DEPLOYED | Conforme à la consigne. Production et YOBALELMA n’ont pas été touchés. |

## Qualification des 21 échecs E2E initiaux

Les 21 FAIL initiaux correspondaient à sept scénarios reproduits sur trois projets navigateur (desktop, mobile 390 px, WebKit). Les journaux de la première exécution indiquaient les éléments suivants :

| Scénario initial | Route | Cause / extrait du log | Correction appliquée | Retest final |
|---|---|---|---|---|
| Authentification dans la modale (3) | `/` | Locator Playwright `getByRole(button, name: Profil)` ne trouvait plus le bouton de navigation. Le champ password était strict-ambiguous avec le bouton œil. | Sélecteur accepte `Se connecter à MATA Beauty`; champ ciblé avec `input[name=password]`. | PASS desktop, 390 px, WebKit. |
| Absence de faux mode aperçu (3) | `/` | Même erreur de locator `Profil`; aucune anomalie de l’écran lui-même. | Sélecteur de navigation corrigé, assertion absence de preview conservée. | PASS desktop, 390 px, WebKit. |
| Consentement à l’inscription (3) | `/` → modale d’inscription | Même erreur de locator `Profil` avant l’ouverture de la modale. | Sélecteur corrigé ; assertion de consentement explicite conservée. | PASS desktop, 390 px, WebKit. |
| Connexion Google / callback fixe (3) | `/`, `/auth/callback` | Locator initial périmé ; ensuite le mock `/api/auth/providers` était codé en dur sur `localhost:3000` alors que le serveur temporaire utilisait `3101`, donc Google apparaissait désactivé. | Mock API matché par URL relative, `NEXT_PUBLIC_APP_URL` temporaire alignée sur le serveur isolé. OAuth réel n’est pas appelé. | PASS desktop, 390 px, WebKit. |
| Localisation proche (3) | `/` → Explorer / Près de moi | Assertion visait la caption masquée de l’ancien feed au lieu de l’identité publique et la ville. | Assertions alignées sur le contenu visible. GPS et autorisation restent simulés par Playwright. | PASS desktop, 390 px, WebKit. |
| Inspiration / réservation (3) | `/` → feed Inspiration → réservation | Log : `Prochain créneau` introuvable, retiré de la carte compacte ; lot de pagination écrasé par une requête subséquente. WebKit ne stabilisait pas le CTA de la première carte hors écran pendant le scroll-snap. | Assertions utilisent `Voir les disponibilités`, vérifient la présence du lot demandé ; `Réserver` est cliqué dans la carte de la vidéo active. | PASS desktop, 390 px, WebKit. |
| Catégorie depuis accueil (3) | `/` → Explorer → catégorie | Mock manquant pour les lectures `provider_services`/RPC, hôte `audit.supabase.co` non routable ; test attendait une catégorie bouton au lieu du chip sous-catégorie. | Fixtures enrichissement/RPC ajoutées, attente alignée sur le chip réellement rendu. | PASS desktop, 390 px, WebKit. |

Les deux SKIP sont attendus : le scénario de défilement à la molette est limité au desktop, il n’est pas un contrôle de trackpad physique. Les 49 PASS sont des parcours navigateur locaux avec données simulées. Ils ne prouvent ni une connexion Google à un compte réel, ni une écriture RLS, ni l’envoi d’e-mails.

## Modifications présentes

- Invitation d’équipe par e-mail via un jeton aléatoire de 32 octets, empreinte SHA-256 en base, expiration à 48 heures, usage unique, révocation, vérification du compte e-mail confirmé et refus de lier un profil par écriture directe.
- Acceptation d’invitation côté serveur ; création/liaison du profil collaborateur, rôle et permissions attribués, notification au propriétaire, adhésion aux conversations uniquement pour les rendez-vous affectés.
- L’espace Collaborateur vérifie maintenant les permissions `staff_permissions` spécifiques au salon, jamais les permissions administratives ; l’envoi de messages est masqué sans `messages.reply`, et l’accès peut être quitté/révoqué.
- Permissions de consultation des seuls rendez-vous affectés et profils client nécessaires aux affectations ; RPC serveur pour transitions de rendez-vous autorisées.
- Statistiques des publications calculées sur une période glissante explicite de 30 jours. Les chiffres salon issus des réservations affichent leur limite aux 200 rendez-vous récents et ne sont pas présentés comme historiques complets.
- Migration additive versionnée `supabase/migrations/20261013130000_salon_collaborator_access.sql`. Elle n’a pas été appliquée ni testée contre PostgreSQL/Supabase ; il faut d’abord vérifier son application et chaque policy sur un projet de préproduction isolé.

Les fichiers modifiés incluent les vues d’espace et de gestion (`app/workspace-*`, `app/salon-control-center.tsx`, `app/team-management.tsx`, `app/conversation-messages.tsx`, `app/workspace-messaging.tsx`, `app/social-dashboard.tsx`), les deux routes API d’invitation, la page d’acceptation, `lib/auth/workspace-*`, `lib/navigation/spaces.ts`, les E2E ciblés, le test d’accès workspace et la migration ci-dessus. Les modifications de code antérieures sur la candidature, les documents et la lisibilité ont été conservées.

## XOF / Sénégal

La réservation reste contrainte à `XOF` et au Sénégal par `supabase/migrations/20261011101008_conversation_quotes_and_booking.sql` (`account.country_code = 'SN'`, devise de prestation XOF). Le Salon continue d’afficher le FCFA/XOF enregistré. Sénégal est le seul marché ouvert ; Côte d’Ivoire et France restent à préparer dans le chantier internationalisation. Aucun paiement ni fournisseur de paiement n’a été modifié.

## Reste à faire avant recette finale

1. Appliquer cette migration uniquement sur le projet de préproduction MATA Beauty autorisé, puis exécuter les tests RLS avec des comptes distincts : propriétaire, collaborateur en lecture seule, collaborateur avec gestion/réponse, client d’un rendez-vous affecté, client tiers et utilisateur d’un autre salon.
2. Exécuter invitation → e-mail → création/connexion au même e-mail → acceptation → permissions accordées/refusées → révocation/leave, avec vérification DB et historique.
3. Effectuer la recette visuelle des cinq profils à 1366×768, 1440×900, 1920×1080 et mobile ; capturer ces écrans réels.
4. Qualifier la disponibilité Resend de préproduction et les e-mails réellement reçus. Les tests locaux ne les envoient pas.
5. Traiter la devise XOF/Sénégal dans le chantier internationalisation avant ouverture d’autres marchés.
6. Une fois ces preuves obtenues, proposer une revue préalable de déploiement. Aucun déploiement n’est lancé ici.
