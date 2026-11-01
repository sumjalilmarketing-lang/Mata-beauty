# Mata Beauty — Production release — 2026-08-16

## Verdict

La version validée de Mata Beauty est déployée sur l'alias Production officiel et les parcours critiques ont été contrôlés contre Supabase réel.

## Version déployée

- Branche source : `codex/full-audit-and-fixes`
- Commit Production : `6b09935956431f0f36b7531cecfe3de59d566967`
- Commit court : `6b09935`
- Déploiement final : `dpl_3c164sFBHDja5xfyeAofrBy5zBjy`
- Création du déploiement : `2026-08-16 16:47:40 +02:00` (Europe/Paris)
- URL immuable : `https://mata-beauty-h6f0ek8sz-africrm.vercel.app`
- URL Production : `https://mata-beauty.vercel.app`
- État Vercel : `READY`, cible `production`

Le déploiement a été construit depuis un worktree Git détaché, propre et vérifié sur le SHA complet ci-dessus. La métadonnée Git du déploiement CLI n'expose pas le SHA dans `vercel inspect`; la provenance est donc établie par la vérification du worktree immédiatement avant les deux déploiements du même commit. Le second déploiement n'a modifié aucune fonctionnalité : il applique uniquement la variable serveur Supabase corrigée.

## Contrôles pré-déploiement

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| Worktree de déploiement | PASS | SHA exact et fichiers suivis propres avant déploiement |
| Migrations Supabase | PASS | `40` locales, `40` distantes, toutes alignées |
| Migration terminale | PASS | `20260816171000` locale et distante |
| Migrations destructives non validées | PASS | Les deux migrations finales ajoutent/réparent catalogue, fonction et politiques Storage dans des transactions, sans suppression de données métier |
| Secrets committés | PASS | Scan du diff de release; aucun secret ou fichier `.env` ajouté |
| Service Role côté client | PASS | Variable uniquement serveur; aucun secret intégré au bundle client |
| Variables Vercel Production | PASS | URL/clé publique/App URL/mode paiement contrôlés; rôle serveur validé par l'endpoint de santé |
| Supabase Auth Production | PASS | Site/callback Production configurés; requête OAuth avec callback Production acceptée (`302` vers `accounts.google.com`) |
| Storage et RLS | PASS | Uploads réels et contrôles autorisés/refusés réussis dans les smoke tests |

La valeur initialement saisie pour `SUPABASE_SERVICE_ROLE_KEY` a été remplacée avant le déploiement final par la clé officielle du projet récupérée en mémoire. Aucune valeur secrète n'a été affichée. L'endpoint Production `/api/health/server` confirme `configuration`, `database` et `serviceRole` à `true`.

## Dernier contrôle local de la version

- ESLint : PASS
- TypeScript strict : PASS
- Vitest : PASS, `59/59`
- Tests structurels : PASS, `18/18`
- Build Next.js Production : PASS
- Playwright responsive : PASS, `187/187` sur 320, 360, 375, 390, 430, 768, 1024, 1366, 1440 et 1920 px
- Build Vercel final : compilation PASS, TypeScript PASS, génération des 16 pages statiques PASS

## Smoke tests Production

### Résultat exact

La passe groupée finale a produit `15 PASS / 2 FAIL / 1 SKIP` en 7,7 minutes. Les deux échecs et le skip provenaient du harnais :

1. la publication Salon était déjà créée et visible dans « Mes photos », mais le test attendait uniquement un toast transitoire ;
2. le test d'acceptation continue n'ouvrait l'URL publique lorsqu'aucun secret de bypass Preview n'était fourni ;
3. le contrôle console/network était ignoré sur une URL publique en l'absence de bypass.

Les trois synchronisations de test ont été corrigées sans modifier la Production. La revalidation ciblée a produit `4/4 PASS` en 1,8 minute : catalogue, Salon complet, acceptation continue Supabase et santé console/network. Les 18 scénarios de la suite sont donc tous validés fonctionnellement sur le déploiement final, avec les résultats consolidés documentés ci-dessus.

| Domaine | Résultat | Couverture Production |
| --- | --- | --- |
| Accueil et Auth | PASS | Accueil public, connexion e-mail, sessions, redirections, callback Google |
| Inspiration | PASS | Feed réel, scroll, filtres, pagination et navigation vers profil/prestation |
| Studio | PASS | Publication vidéo, photo et avant/après, Storage réel, affichage dans Inspiration/profil |
| Réservation | PASS | Prestation, prix, collaboratrice, disponibilité, création et confirmation |
| Messagerie | PASS | Conversation après réservation, échange client/professionnel et Realtime bidirectionnel |
| Notifications | PASS | Réservation, message et destinataire reliés aux données Supabase |
| Interactions sociales | PASS | Likes, commentaires, sauvegardes, signalement et statistiques |
| Salon | PASS | Profil, horaires, équipe, prestations, tarifs, Studio, réservation, messages, avis et statistiques |
| Admin | PASS | Client et professionnel refusés; support, onboarding et finance limités à leur périmètre |
| Super Admin | PASS | Accès complet, modération, restauration et journalisation |
| Sécurité/RLS | PASS | Accès autorisés et refusés testés sans désactivation RLS |
| Responsive mobile | PASS | Test Production sur cinq largeurs mobiles plus matrice responsive pré-release |
| Console/network/server | PASS | Aucun page error, aucune erreur console critique, aucune route applicative critique en erreur |

## Supabase

- Projet distant : `qjdwxdbvrxedyfolnpol`
- Migrations : `40/40`, terminale `20260816171000`
- Auth : opérationnel
- Postgres/PostgREST : opérationnels
- Storage : opérationnel pour images, vidéo, miniature et avant/après
- Realtime : opérationnel pour la messagerie bidirectionnelle
- RLS : activée et validée sur les parcours client, professionnel, Salon et administration
- Journalisation sensible : connexions administratives, modération et actions financières vérifiées

L'explorateur de logs Supabase a signalé des erreurs `500` uniquement lors de la suppression des comptes de recette : des clés étrangères conservaient messages et journaux d'audit. Elles ne correspondaient pas à une panne utilisateur. Le nettoyage a été repris sans désactiver RLS ni contourner l'immutabilité financière :

- les comptes temporaires sans audit immuable ont été supprimés ;
- les comptes liés au journal financier immuable ont été anonymisés, désactivés et bannis ;
- après la première reprise, aucun compte `codex-*@example.test` ne restait ;
- après la revalidation finale : `15` comptes traités, `9` supprimés, `6` anonymisés, `0` échec ;
- les lignes de test bloquantes ont été retirées, tandis que l'audit financier immuable a été conservé.

## Surveillance Vercel

Sur le déploiement final `dpl_3c164sFBHDja5xfyeAofrBy5zBjy` :

- logs runtime `error/fatal` : `0`
- réponses HTTP `500` : `0`
- état serveur : PASS
- alias Production : PASS

Aucun rollback n'a été déclenché, car aucune anomalie critique applicative n'a été observée après le déploiement final.

## Paiement et limitations connues

- `PAYMENT_PROVIDER_MODE=mock`
- endpoint des capacités : `onlineCheckoutEnabled=false`, fournisseur `none`
- Wave, Orange Money et carte bancaire ne sont pas présentés comme des moyens de paiement opérationnels
- seul le paiement sur place peut être proposé tant qu'un PSP réel n'est pas configuré et validé

Cette limitation est explicite et ne crée pas de faux paiement en ligne.

MATA BEAUTY PRODUCTION: LIVE & HEALTHY
