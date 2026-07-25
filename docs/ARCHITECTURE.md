# Architecture Mata Beauty

## Vue d’ensemble

L’interface repose sur Next.js App Router, React et TypeScript strict. Le MVP
fonctionne immédiatement avec un catalogue de démonstration explicitement
signalé. Lorsque les deux variables publiques Supabase sont définies, le module
`lib/supabase.ts` fournit les opérations Auth REST sans exposer de secret serveur.

Supabase constitue la source de vérité cible pour les comptes, profils,
prestations, disponibilités, réservations, avis, conversations et notifications.
Le schéma PostgreSQL, les contraintes et les politiques RLS sont versionnés dans
`supabase/migrations`.

## Frontières de sécurité

- le navigateur utilise uniquement la clé anonyme ;
- la clé `service_role` est réservée aux traitements serveur et n’est pas requise
  pour le rendu public ;
- RLS protège chaque table métier ;
- les rôles sont lus depuis `profiles.role`, jamais depuis un champ envoyé par
  le client ;
- une contrainte d’exclusion PostgreSQL empêche les créneaux actifs de se
  chevaucher pour un même prestataire ;
- les paiements sont uniquement simulés tant que
  `PAYMENT_PROVIDER_MODE=mock`.

## Extension internationale

Les montants stockent une devise ISO, les zones sont normalisées et les profils
conservent un code pays. Le Sénégal (`SN`, `XOF`) est la valeur initiale, sans
être codé comme unique marché possible.
