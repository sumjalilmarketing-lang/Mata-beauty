# Correctifs de l’audit du 7 novembre

## Comportement

- Les événements produit connectés sont plafonnés à 300/h par UID issu d’Auth, même avec un hash de session nul ou renouvelé. Le compteur SQL utilise un UPSERT atomique. Les accès anonymes directs au RPC sont révoqués.
- Le navigateur envoie les événements produit à `/api/analytics/product-event`, après consentement comme auparavant. L’entrée anonyme réservée au serveur applique 300/h par empreinte IP et 10 000/h globalement. Une indisponibilité reste sans effet sur les réservations et la navigation.
- Le Studio conserve le transfert TUS puis demande au serveur de lire les objets privés, décoder toutes les images de la piste vidéo et la miniature, et attester leurs octets. Le serveur n’accepte pas une URL de téléchargement fournie par le client. MP4/MOV/WebM, dont H.264 et HEVC, restent traités; les autres formats continuent à être préparés par le Studio.
- Les triggers SQL refusent les nouvelles références vidéo sans attestation correspondant à l’objet, son propriétaire, sa taille et sa version. Les objets validés ne peuvent plus être écrasés ni recréés au même chemin après suppression. Les publications existantes ne sont pas modifiées.
- La limite de taille de 100 Mo demeure. Aucune limite éditoriale de durée ou de cadrage n’est réintroduite. Le décodage a un budget technique de 180 s et une limite de 36 millions de pixels; un fichier trop complexe échoue avec conservation des champs.

## Configuration et livraison

Sur Vercel, utiliser `ANALYTICS_SECURITY_PEPPER` (au moins 32 caractères) ou le secret serveur `PAYMENT_SECURITY_PEPPER` existant. Les IP proviennent uniquement de `x-vercel-forwarded-for`, écrasé par l’entrée Vercel; les IPv6 sont regroupées par /64 et les clés stockées sont des HMAC. Hors de cette configuration, les mesures anonymes sont désactivées. Les événements authentifiés continuent à fonctionner.

La validation vidéo utilise `SUPABASE_SERVICE_ROLE_KEY` côté serveur et le contrôle de débit serveur existant (`PAYMENT_SECURITY_PEPPER` ou `PAYMENT_WEBHOOK_SECRET`). En production, l’absence de ce dernier ferme la validation. Aucun secret n’est ajouté au navigateur.

Livrer le code serveur/Studio et les deux migrations comme un même lot. Appliquer les migrations et vérifier les fonctions/triggers avant la recette finale. Une ancienne page Studio déjà ouverte devra être actualisée: le RPC de publication refusera ses objets non validés. Ne pas activer les triggers seuls avec une ancienne version du Studio.

Le paquet Node doit inclure le binaire `ffmpeg-static/ffmpeg` via `outputFileTracingIncludes`; vérifier le manifeste de tracing produit par le build et le paquet réellement déployé. La validation native ne fonctionne pas dans un runtime Edge.

Les limites de temps s’appliquent indépendamment des limites de taille: tous les fichiers valides de 100 Mo ne sont pas garantis sous le budget d’exécution. Les anciennes publications ne sont pas réanalysées. Le mécanisme atteste la validité technique des fichiers, pas leur contenu éditorial. Les clés de quotas nécessitent la politique de rétention habituelle de `financial_rate_limits`.

## Validation

Tests locaux ciblés: vrai décodage MP4/MOV/WebM/H.264/HEVC, fichier tronqué, faux type vidéo, audio seul, miniature factice, flux dépassant la limite; tests SQL isolés des attestations et remplacements; tests des quotas UID/session et du refus anonyme direct; tests de route avec fixtures. Les tests de parcours navigateur simulent explicitement l’attestation et ne constituent pas une preuve de décodage serveur.

Aucun compte ou média de production n’est créé pour les tests. Conserver les résultats du garde-fou de qualité et de la recette navigateur dans la PR. La vérification sur téléphone physique reste distincte des tests locaux.

Résultats locaux le 8 novembre : garde-fou complet réussi, 120 fichiers et 724 tests; lint sans erreur (8 avertissements préexistants), TypeScript et build réussis. Manifeste `.next/server/app/api/studio/validate-video/route.js.nft.json`: FFmpeg inclus, environ 97,2 Mio de fichiers tracés non compressés.

Recette navigateur tentée : Chromium installé ne démarre pas (`socket() failed: Operation not permitted`); WebKit téléchargé mais bibliothèques système absentes. Aucun des 10 scénarios Studio n’est annoncé réussi dans cet environnement. Les tests de route isolés couvrent séparément les refus et les succès du contrôle serveur. Aucun test sur téléphone physique réalisé.
