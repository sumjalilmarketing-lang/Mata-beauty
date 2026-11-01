# Google OAuth — configuration Mata Beauty

L'application utilise le flux OAuth Google de Supabase Auth en PKCE. Le navigateur démarre le flux avec `signInWithOAuth`; `/auth/callback` échange le code côté serveur, crée ou récupère le profil de façon idempotente et ne conserve jamais le code ou les jetons dans l'URL finale.

## Configuration externe requise

Dans Google Cloud, l'URI de redirection OAuth autorisée est exclusivement la callback Supabase :

`https://qjdwxdbvrxedyfolnpol.supabase.co/auth/v1/callback`

Le Client ID et le Client Secret Google doivent être saisis dans Supabase Dashboard > Authentication > Providers > Google. Ils ne sont pas des variables Vercel et ne doivent jamais être préfixés par `NEXT_PUBLIC_`.

État constaté le 4 août 2026 : le projet Supabase répond `provider is not enabled`. Le code applicatif est prêt et testé, mais un Client ID et un Client Secret Google réels sont indispensables pour terminer l'activation externe. L'interface vérifie ce statut avant de rediriger et affiche une erreur explicite tant que le fournisseur reste désactivé.

Dans Supabase Auth > URL Configuration, autoriser exactement :

- `http://localhost:3000/auth/callback`
- `https://mata-beauty-sumjalilmarketing-lang-africrm.vercel.app/auth/callback`
- l'URL exacte de la Preview en cours de recette ;
- `https://mata-beauty.vercel.app/auth/callback`

Éviter un wildcard global Vercel. La production conserve `https://mata-beauty.vercel.app` comme Site URL ; la Preview est calculée depuis `VERCEL_URL`.

## Garanties applicatives

- destination OAuth limitée à `/` ;
- profils Auth identifiés par l'UUID Supabase et créés avec `ON CONFLICT DO NOTHING` ;
- rôle initial `client`, jamais lu depuis une métadonnée `role` modifiable ;
- demande professionnelle créant un profil `draft` sur le même utilisateur Auth ;
- compte client, réservations, favoris et messages conservés ;
- cookies `SameSite=Lax`, `Secure` sur HTTPS, rotation gérée par Supabase SSR ;
- erreurs normalisées, sans code OAuth ni jeton journalisé ;
- brouillon de réservation conservé en `sessionStorage` pendant la redirection.
