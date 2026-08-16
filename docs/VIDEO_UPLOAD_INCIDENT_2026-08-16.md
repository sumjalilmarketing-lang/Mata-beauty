# Mata Beauty — incident de publication vidéo — 2026-08-16

## Résumé

- Branche isolée : `codex/video-upload-critical-fix`
- Base de départ Production : `6b09935956431f0f36b7531cecfe3de59d566967`
- Preview finale validée : `https://mata-beauty-r4c5y1r0g-africrm.vercel.app`
- Déploiement Vercel : `dpl_pVENtGFiFo8uqzretxbTumWsQa1x`, état `READY`
- Supabase distant : `qjdwxdbvrxedyfolnpol`, 40 migrations locales / 40 distantes alignées
- Production : non modifiée au moment de ce rapport

## 1. Reproduction et cause réelle

Le scénario avec un Prestataire temporaire réellement approuvé, une prestation active et une vidéo WebM réelle a confirmé que Storage et la RPC fonctionnaient lorsque le navigateur fournissait exactement un MIME accepté. L’incident venait de plusieurs défauts déterministes dans la couche frontend :

1. La validation exigeait exactement `video/mp4`, `video/webm` ou `video/quicktime`. Une capture mobile valide accompagnée d’un MIME vide, de `application/octet-stream` ou de `video/x-m4v` était refusée avant tout upload.
2. La génération automatique de miniature était exécutée même lorsqu’une miniature personnalisée était fournie.
3. L’écouteur `seeked` était enregistré après la modification de `currentTime`. L’événement pouvait donc être perdu et bloquer le traitement de certains WebM/MediaRecorder.
4. Un échec de miniature bloquait la vidéo entière au lieu d’utiliser une miniature de repli.
5. La progression affichée était statique (20/60/90) et ne reflétait pas les octets envoyés.
6. Le test distant historique autorisait un second clic après une erreur générique. Il pouvait masquer un premier échec et ne vérifiait ni refresh Studio ni session cliente séparée.

La couche fautive principale était donc le workflow navigateur du Studio et son test d’acceptation, pas une désactivation ou une absence de RLS.

## 2. Correctifs

- `app/video-publisher.tsx`
  - détection MIME normalisée avec repli d’extension uniquement pour MIME vide/générique ;
  - upload direct authentifié vers Supabase Storage par `XMLHttpRequest` ;
  - progression réelle sur les octets vidéo et miniature ;
  - phases 0 %, analyse, upload, traitement, publication et 100 % terminé ;
  - bouton désactivé pendant toute l’opération ;
  - écoute du seek installée avant la recherche avec timeout borné ;
  - miniature personnalisée utilisée sans génération automatique inutile ;
  - miniature Mata Beauty de repli si l’extraction d’image échoue ;
  - nettoyage Storage sur échec avant transaction métier ;
  - aucune suppression du média après une transaction déjà réussie.
- `lib/social/video-upload.ts`
  - limite unique 100 Mo ;
  - normalisation MP4/M4V, MOV/QuickTime et WebM ;
  - messages publics sûrs pour session, autorisation, taille, format, réseau, conflit et Storage.
- `app/creator-studio.tsx`
  - confirmation persistante après le passage de l’éditeur à « Mes vidéos ».
- `tests/remote/social-feed-remote-ui.spec.ts`
  - suppression du retry qui masquait l’échec ;
  - WebM sans miniature personnalisée ;
  - contrôle 100 % terminé ;
  - refresh puis réouverture de « Mes vidéos » ;
  - session cliente mobile indépendante et lecture dans Inspiration ;
  - test optionnel de vrais conteneurs MP4 et MOV H.264.
- `tests/domain/video-upload.test.ts`
  - formats, MIME mobile, mauvais MIME, taille maximale et messages d’erreur.
- `.vercelignore`
  - exclusion explicite des secrets locaux, traces, rapports et médias de test.
- `scripts/final-acceptance-server.mjs`
  - le harnais accepte l’absence de `.env.local` lorsque les variables sont injectées en mémoire.

## 3. Storage et RLS

- Bucket : `provider-social-media`
- Visibilité : privée
- Limite vidéo harmonisée : 104 857 600 octets (100 Mo)
- MIME Storage autorisés : MP4, QuickTime/MOV et WebM
- Écriture : uniquement sous le préfixe du propriétaire authentifié
- Modification/suppression : propriétaire uniquement
- Lecture tierce : seulement si le média est rattaché à une publication publique `published`, ou pour un administrateur autorisé
- Brouillon : lecture propriétaire seulement
- RPC `create_provider_video_post` : profil professionnel requis, profil approuvé pour publier, prestation active appartenant au professionnel, consentement requis, objet Storage et métadonnées vérifiés
- Aucune RLS désactivée ; aucune Service Role Key ajoutée au frontend

Résultat `pnpm test:social:remote` :

```text
ok=true
publishedRequiresService=true
draftPrivate=true
countersProtected=true
foreignEditBlocked=true
uploadIsolation=true
commentReplyDeleteReportRls=true
bookingAttributionAndServerPrice=true
```

## 4. Formats et lecture

| Format | Fichier réel | Analyse navigateur | Upload | Post/Media | Résultat |
|---|---:|---:|---:|---:|---:|
| WebM MediaRecorder | oui | PASS | PASS | PASS | PASS |
| MP4 H.264 | oui | PASS | PASS | PASS | PASS |
| MOV H.264 | oui | PASS | PASS | PASS | PASS |

Les codecs non décodables par le navigateur restent refusés avec le message public « Format vidéo non pris en charge. » plutôt qu’une erreur SQL/Storage brute.

## 5. Parcours réel Preview

Sur `https://mata-beauty-r4c5y1r0g-africrm.vercel.app` :

```text
Prestataire approuvé
→ Studio
→ vraie vidéo WebM
→ miniature automatique
→ prestation réelle
→ upload direct authentifié
→ progression 100 %
→ publication en un clic
→ post published + média + prestation en base
→ refresh
→ vidéo présente dans Mes vidéos
→ Cliente 390 px
→ Inspiration
→ vidéo visible et lisible
```

Le parcours étendu sur la Preview précédente au contenu applicatif identique a aussi validé : photo, avant/après, lecture/autoplay/pause/son, likes, sauvegardes, commentaires, suivi, réservation depuis vidéo, attribution, modération, audit et permissions. Résultat : 6/6 PASS en 2,7 minutes.

La matrice mobile automatisée a validé 320, 360, 375, 390 et 430 px. La suite existante valide également les comportements de feed et de lecture différée.

## 6. Tests exacts

```text
pnpm lint                     PASS
pnpm typecheck                PASS
pnpm test                     PASS — 14 fichiers, 75 tests
pnpm test:smoke               PASS — 18/18
pnpm build                    PASS — 31 routes, TypeScript PASS
pnpm test:social:remote       PASS — toutes les assertions Storage/RLS
Playwright social Preview     PASS — 6/6, 2,7 min
Playwright WebM final Preview PASS — 24,2 s
Playwright MP4/MOV final      PASS — 16,1 s
Vercel build final            PASS — READY
Vercel logs Preview           PASS — aucune erreur, aucun 4xx/5xx trouvé
Supabase migrations           PASS — 40/40 alignées
```

Les comptes, posts, médias, disponibilités et réservations temporaires sont supprimés par les hooks de fin de test. Les deux Previews de diagnostic remplacées ont été supprimées ; seule la Preview finale propre est conservée.

## 7. État Production

La Production n’a pas encore été modifiée. La promotion et le smoke test Production restent conditionnés à la rotation explicitement autorisée du secret Vercel d’automatisation identifié pendant l’audit de la Preview, puis à un dernier contrôle du commit et des secrets.

VIDEO PUBLISHING: FAIL — correctif Preview validé, promotion Production bloquée uniquement par l’autorisation de rotation du secret Vercel d’automatisation.
