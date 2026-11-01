# Réorganisation des espaces Mata Beauty

## Principe

L’ancienne application utilisait principalement `/` et changeait de grand écran avec un état React (`home`, `client`, `provider`, `admin`). La nouvelle navigation donne une URL stable à chaque espace et à chaque module. La session Supabase reste identique lors d’un changement d’espace. Les menus ne montrent que les espaces disponibles et chaque accès direct est revérifié côté serveur.

## Correspondance avant / après

| Avant | Après | Composant principal | Accès |
|---|---|---|---|
| `/` + écran feed | `/` | `MataBeautyApp` / `SocialFeed` | Public |
| `/` + écran découverte | `/discover` | `MataBeautyApp` | Public |
| `/posts/[id]` | `/video/[id]` | page vidéo publique | Public ; ancienne URL redirigée |
| profil dans une modale | `/professional/[username]` | page professionnelle publique | Public, profils approuvés |
| prestation dans une modale | `/service/[id]` | page prestation publique | Public, prestations actives |
| `/` + dashboard client | `/app/*` | `WorkspaceRoute` | Rôle client |
| `/` + dashboard pro | `/pro/*` | `WorkspaceRoute` | Rôle professionnel |
| absent | `/salon/*` | `WorkspaceRoute` | Professionnel propriétaire d’un salon |
| absent | `/staff/*` | `WorkspaceRoute` | Collaborateur actif |
| modules admin mélangés | `/onboarding/*` | `WorkspaceRoute` | Agent de vérification / super admin |
| modules admin mélangés | `/support-agent/*` | `WorkspaceRoute` | Support / admin / super admin |
| modules admin mélangés | `/moderation/*` | `WorkspaceRoute` | Modération / admin / super admin |
| modules admin mélangés | `/finance/*` | `WorkspaceRoute` | Finance / super admin |
| modules admin mélangés | `/operations/*` | `WorkspaceRoute` | Admin / contenu / super admin |
| `/admin` monolithique | `/admin` et `/admin/[module]` | `SuperAdminApp` puis `WorkspaceRoute` | Super admin |

## Sécurité et permissions

- L’identité est obtenue avec `auth.getUser()` ; aucune clé service-role n’est utilisée dans le navigateur.
- Le rôle applicatif, les rôles internes, les permissions, la propriété d’un salon et l’appartenance à une équipe sont contrôlés avant rendu.
- Une URL interdite redirige vers un emplacement sûr ; masquer un menu ne constitue jamais l’unique protection.
- Les requêtes des modules restent soumises aux politiques RLS Supabase. Une ressource non exposée au rôle affiche un état limité, jamais des données de démonstration.

## Limites fonctionnelles connues

La structure, les routes, les permissions et les vues de données réelles sont opérationnelles. Les capacités métier qui n’existent pas encore dans le schéma (ressources physiques, appels de modération, base de connaissances, rapprochement bancaire, sessions administratives détaillées) apparaissent comme modules préparés avec un état vide explicite. Elles nécessiteront des migrations RLS et des workflows dédiés avant d’offrir des actions d’écriture.
