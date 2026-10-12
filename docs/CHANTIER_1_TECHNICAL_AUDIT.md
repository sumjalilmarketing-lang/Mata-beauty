# Chantier 1 — audit avant implémentation, 11 octobre 2026

Base de départ : `1a342dc`, branche `codex/launch-phase-2`. Production : https://mata-beauty.com. Audit réalisé avant modification du code du chantier. Le rapport préexistant non suivi `PRODUCTION_READINESS_2026-08-16.md` est préservé.

## Architecture et composants réutilisés

Next.js 16 App Router, React 19, TypeScript strict, Supabase Auth/PostgreSQL/RLS/Realtime/Storage, Vercel. Authentification Google et e-mail, contrôles RBAC et MFA internes conservés. La clé serveur reste exclusivement dans les routes serveur. `authenticatedSupabase` vérifie le jeton auprès du fournisseur; RLS et les RPC vérifient les autorisations métier.

- Inspiration : `app/social-feed.tsx`; profils publics et catalogue existants. L'audit dédié couvre la galerie et les commentaires.
- Messagerie : `BookingMessages`, `MessageBubble`, `WorkspaceMessaging`; tables `conversations`, `conversation_members`, `messages`, notifications et Realtime. L'interface est encore centrée sur les réservations.
- Production dispose déjà de `message_attachments`, d'un bucket privé `message-attachments`, de types de messages, d'un nonce, de fonctions de liste/envoi/lecture et d'un accès Support nominatif temporaire. Réutilisation obligatoire; aucune deuxième messagerie.
- Réservations : `bookings`, `provider_services`, disponibilités, options, promotions, déplacements, collaborateurs, affectation et exclusion PostgreSQL. Prix et durée sont recalculés côté serveur. Les contrats réels de production sont plus riches que certaines migrations locales.
- Notifications : table et déclencheurs existants, destinations applicatives; e-mails transactionnels existants. Ne pas ajouter un transport parallèle ni exposer de texte privé dans des e-mails.
- Devis personnalisés : aucun objet métier opérationnel trouvé. Les fonctions nommées « quote » existantes calculent le tarif d'une réservation classique; elles ne représentent pas un devis transmis et accepté.

## Sécurité et points à corriger

La lecture des conversations utilise l'appartenance ou une autorisation Support spécifique, expirante et révocable avec permission MFA. La fonction d'appartenance ne vérifie pas encore la suspension du compte : durcissement nécessaire avant extension aux médias et devis. Les nouveaux médias privés seront limités aux participants, validés côté serveur avant publication, et servis temporairement. Les envois doivent être idempotents et limités côté serveur, y compris les insertions directes historiques.

Les politiques et fonctions déployées ne sont pas toutes présentes dans les migrations locales. Les migrations du chantier doivent être additives et compatibles avec la production observée, sans remplacer les fonctions de réservation enrichies par une ancienne version. Aucun historique de réservation, message, avis, document ou paiement ne doit être supprimé.

## Environnements et dépendances

- Vercel : projet `africrm/mata-beauty`. Production Supabase `qjdwxdbvrxedyfolnpol`; Preview QA `kazlvtxkbsdhbfvtqqdp`.
- QA actuellement en pause; Docker/PostgreSQL local non installé aux emplacements usuels. L'utilisateur autorise une nouvelle pause temporaire de `yobalelma_db` pour réactiver la QA, puis sa restauration. Déclencher cette pause au moment des tests.
- Production actuelle vérifiée lors du chantier précédent : déploiement `dpl_EfsvKDxDgNwbzCebG9jdtLKtM9rJ`, code applicatif `3a38ad1`; migration corrective de disponibilité indépendante correspondant à `1a342dc` appliquée en production. Une nouvelle vérification est exigée après livraison du chantier.
- Paiement : mode mock conservé; aucune carte « payé » ni faux succès. L'acceptation du devis et une réservation en attente ne sont pas un encaissement.
- Marché ouvert : Sénégal. Côte d'Ivoire et France restent en préparation. Les montants sont conservés dans leur devise réelle; aucune conversion fictive.
- HIBP : **BLOCKED BY PLAN — activation possible après upgrade Pro**. Aucun contournement.

## Découpage retenu

1. Profil/galerie/commentaires : réutiliser le lecteur, corriger sa pause/reprise et le retour à la position précédente.
2. Messagerie : exposer le socle existant, étendre les conversations avant réservation, les références au catalogue et les médias privés validés.
3. Devis : états et transitions autorisés, prix/durée immuables après envoi, audit, acceptation du destinataire, réservation serveur réutilisant les contraintes existantes.
4. QA isolée : permissions positives/négatives, idempotence, fichiers invalides, expirations, réservation classique et devis, navigateurs Chromium/WebKit.
5. Production uniquement après validation : migrations compatibles, déploiement, contrôle de version et tests réels documentés.

Cet audit décrit les constats de structure; il ne classe aucun nouveau parcours utilisateur PASS. Les résultats d'exécution seront consignés séparément.
