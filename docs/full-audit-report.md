# Audit complet Mata Beauty — 4 août 2026

## Décision

**État : Preview validable, production non prête. Score de préparation estimé : 72/100.**

Les parcours publics, la réservation, les tableaux de bord, le feed social, le socle RBAC et le schéma financier sont présents. Deux failles importantes ont été corrigées pendant cet audit : activation de compte sans preuve de vérification et contrat de réservation calculé côté navigateur. La mise en production reste bloquée par le paiement encore explicitement en mode `mock`, l'absence de tests RLS multi-comptes exécutés contre une base isolée et plusieurs fonctions produit annoncées mais non livrées de bout en bout.

## Périmètre et inventaire

- Application Next.js 16 / React 19 / TypeScript strict, 13 routes de build dont 6 API financières.
- Supabase Auth, Postgres, RLS et Storage ; plus de 70 tables publiques réparties entre réservation, identité, administration, finance et social.
- Buckets publics : avatars, portfolios, couvertures, vidéos et miniatures sociales. Bucket privé : `provider-documents`.
- Rôles applicatifs : client, provider ; rôles administratifs : super_admin, admin, support, moderator, verification_agent, finance, content_manager.
- Paiement : passerelle mock par défaut ; connecteur PayDunya préparé mais aucune sandbox réelle validée pendant cet audit.
- Tests : Vitest, tests structurels Node et Playwright.
- Projet Vercel lié : `mata-beauty` (`prj_dKh0QiVpaXnzzy9C921NAJyT2toZ`).

## Matrice fonctionnelle

| Domaine | Statut | Preuve / limite |
|---|---|---|
| Design premium, thème sombre/clair, navigation | opérationnel | Tokens globaux, composants uniformisés, tests navigation et débordement. |
| Responsive 320/360/375/390/430/tablette/laptop/1920 | opérationnel | Matrice Playwright sur 9 projets ; navigation tactile ≥ 44 px. |
| Auth email/mot de passe, déconnexion, reset | opérationnel | Interface Supabase réelle et route de mise à jour du mot de passe. |
| Auth Google/Gmail | partiellement opérationnel | PKCE, callback serveur, profils/rôles et tests prêts ; fournisseur Google désactivé dans Supabase faute de Client ID/Secret accessible. |
| Vérification email | partiellement opérationnel | Statut désormais adossé à `auth.users.email_confirmed_at`; parcours réel boîte mail non automatisé. |
| Téléphone / OTP | absent | Aucun parcours téléphone complet. |
| Suppression de compte | absent | Modèle de données partiel, aucune orchestration utilisateur vérifiée. |
| Onboarding professionnel | partiellement opérationnel | Sauvegarde profil, progression, documents et soumission présents ; E2E réel multi-session absent. |
| KYC privé | partiellement opérationnel | Bucket privé + politiques propriétaire/admin ; consultation par URL signée courte et journalisation d'ouverture non livrées. |
| Feed vidéo | opérationnel | Lecture active unique, pause hors écran, boucle, mute, préchargement limité, fallback erreur. |
| Onglets Abonnements/Tendances/Autour de vous | partiellement opérationnel | UI/feed présents ; pertinence algorithmique et géolocalisation non validées sur données réelles. |
| Publication vidéo | partiellement opérationnel | Upload, brouillon/publication, consentement, prestation et garde serveur ; transcodage/miniature serveur absents. |
| Publication programmée | partiellement opérationnel | État et date stockés ; worker planifié de publication non prouvé. |
| Likes, favoris, follows, commentaires, partage, signalement | opérationnel | RPC/RLS et UI principales présentes. |
| Réponses/suppression commentaire/blocage | absent ou partiel | Schéma social incomplet pour l'ensemble de ces actions. |
| Profils professionnels / portfolio / services | opérationnel | Données Supabase, badges, avis, services et réservation reliés. |
| Prix et durée de réservation côté serveur | opérationnel | Trigger `enforce_booking_contract` recalcule provider, prix, devise, durée et statut. |
| Disponibilités et anti-double réservation | opérationnel | RPC de créneaux + exclusion GiST atomique sur les réservations actives. |
| Pauses, buffers, employés, reprogrammation | partiellement opérationnel | Règles/exceptions disponibles ; modèle complet multi-employés/buffer non validé. |
| Réservation classique | opérationnel en E2E simulé | 8 actions, moyenne 8,406 s, min 5,093 s, max 11,221 s sur 9 formats. |
| Réservation depuis le feed | opérationnel en E2E simulé | 6 actions, moyenne 6,998 s, min 5,696 s, max 9,239 s. |
| Persistance client/prestataire et isolation autre client | opérationnel en E2E simulé | Tests des deux dashboards et refus de modification d'un autre client. |
| Paiement | mock | Idempotence, webhooks signés, rejeu, ledger, remboursement et rate-limit conçus ; aucun paiement sandbox réel exécuté. |
| Wallet/ledger | opérationnel côté schéma/API | Solde dérivé du ledger, réponse privée non mise en cache. |
| Messagerie texte | opérationnel pour le socle | Conversation unique par rendez-vous, création serveur réservée aux participants, pagination, temps réel et accusés de lecture ; pièces jointes et recette réelle multi-comptes restent à livrer. |
| Avis | partiellement opérationnel | Unicité par réservation, garde de champs et recalcul note ; photos/notes détaillées absentes. |
| Dashboard professionnel | partiellement opérationnel | Données réelles chargées ; revenus explicitement indiqués « théoriques » tant que paiement mock. |
| Super Admin / RBAC / audit | opérationnel pour le socle | Permissions séparées, RPC auditables et confirmations ; couverture UI exhaustive par rôle non automatisée. |
| Support | partiellement opérationnel | Tables, messages, permissions et file admin ; parcours utilisateur avec pièces jointes/réouverture non validé. |
| Modération | partiellement opérationnel | Signalements et permissions présents ; scénario complet restauration/suppression non automatisé. |
| SEO / PWA | partiellement opérationnel | Métadonnées, Open Graph, manifest, icônes, service worker/offline ; sitemap et robots dédiés absents. |
| Accessibilité | partiellement opérationnel | Noms accessibles, focus/modalités et cibles principales testés ; audit axe complet non intégré. |

## Problèmes corrigés

| Sévérité | Cause | Correction | Régression |
|---|---|---|---|
| critique | `synchronize_account_status` activait un profil sans vérifier l'identité Supabase. | Vérification de `email_confirmed_at`/`phone_confirmed_at` et garde du trigger de privilèges. | Test structurel de migration + lint SQL distant. |
| critique | Prix, prestataire, durée et devise d'une réservation provenaient du payload navigateur. | Trigger serveur immuable recalculant le contrat depuis `provider_services`. | Test structurel de migration ; exclusion anti-chevauchement conservée. |
| élevé | Libération de fonds sans contrôle d'origine ni limitation de débit au niveau API. | Origine fiable, rate-limit par utilisateur/IP, request-id et no-store. | Test structurel de route. |
| moyen | Réponses statut paiement et wallet potentiellement cachables. | `Cache-Control: no-store`. | TypeScript/build. |
| moyen | L'URL applicative de production pouvait être réutilisée en Preview pour les contrôles d'origine et retours PSP. | Origine calculée depuis `VERCEL_URL` hors production ; URL configurée conservée en production. | Test structurel et build. |
| moyen | Réservation E2E limitée artificiellement au projet 320 px par `skip`. | Suppression du skip et exécution sur les 9 formats requis. | 81/81 tests E2E de matrice réussis. |
| moyen | Formats 360, laptop et grand écran absents. | Ajout des projets Playwright correspondants. | Matrice Playwright. |
| moyen | Zones tactiles non vérifiées automatiquement. | Test ≥ 44 px et nom accessible sur les 5 boutons principaux. | 9/9 réussis. |

## Sécurité et données

- Aucun secret n'est commité ni exposé dans un nom `NEXT_PUBLIC_*` ; la clé service reste importée uniquement dans le code serveur.
- Le prix, la durée, le prestataire, la devise et le statut initial d'une réservation sont désormais imposés par Postgres.
- Le chevauchement d'un créneau actif est refusé atomiquement par contrainte d'exclusion.
- Les opérations financières passent par API/RPC authentifiées ; le webhook reste la source de vérité pour le paiement.
- `pnpm audit --prod --audit-level moderate` : aucune vulnérabilité connue.
- `supabase db lint --linked --level warning` : aucune erreur de schéma.
- Migration distante appliquée : `20260804160000_full_audit_security_fixes.sql`, sans suppression de données.

## Résultats de validation

- ESLint : réussi.
- TypeScript strict : réussi.
- Vitest : 38/38.
- Tests structurels Node : 7/7.
- Playwright : 81/81 sur 9 formats, zéro skip, dont 9 contrôles dédiés aux zones tactiles.
- Build Next.js production : réussi, 13 routes.
- Audit dépendances production : zéro vulnérabilité connue.
- Supabase dry-run, migration distante et lint lié : réussis.

## Risques résiduels et prochaines actions exactes

1. **Paiement mock — bloquant production.** Obtenir les identifiants sandbox du PSP retenu, configurer uniquement Preview, exécuter paiement/échec/expiration/webhook/rejeu/remboursement réels, puis faire homologuer avant toute bascule.
2. **Google OAuth désactivé — bloquant la fonctionnalité.** Créer/récupérer un Client ID et un Client Secret Google, les saisir uniquement dans Supabase Auth, autoriser les callbacks documentées et relancer la recette Gmail réelle.
3. **RLS multi-comptes réel — bloquant production.** Créer un projet Supabase de test isolé et des comptes client A/B, provider A/B et rôles admin ; exécuter une matrice CRUD négative sur chaque table/bucket.
4. **KYC — risque élevé.** Ajouter une API d'URL signée courte qui journalise chaque consultation administrative et des tests de téléchargement inter-compte.
5. **OTP/téléphone et suppression de compte — fonctionnalités absentes.** Concevoir les parcours, la rétention légale et les jobs de purge/anonymisation avant activation UI.
6. **Social — risque moyen.** Ajouter worker de publication programmée, transcodage/miniatures serveur, réponses/suppression de commentaires et blocage.
7. **Messagerie/support — risque moyen.** Ajouter pièces jointes privées analysées côté serveur et exécuter une recette réelle multi-comptes complète ; la pagination, le temps réel et les accusés de lecture sont désormais livrés.
8. **SEO/a11y — risque moyen.** Ajouter sitemap/robots, pages publiques partageables et audit automatisé axe sur tous les écrans.

La Preview peut servir à la recette fonctionnelle. Elle ne doit pas être promue en production tant que les points 1 et 2 ne sont pas clôturés.
