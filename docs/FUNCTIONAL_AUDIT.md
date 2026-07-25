# Audit fonctionnel — Mata Beauty

Date : 25 juillet 2026
Branche : `stabilization/production-readiness`

## Synthèse

L’état initial était une démonstration visuelle responsive, avec un schéma
Supabase versionné mais aucune connexion de données active dans l’interface.
Le projet compilait, mais les parcours privés, les écritures et la majorité des
boutons de tableaux de bord n’étaient pas fonctionnels. La clé publique
Supabase et les identifiants permettant de comparer/appliquer la base distante
ne sont pas disponibles dans l’environnement local.

| Fonctionnalité | État initial | Problème constaté | Gravité | Correction requise | Test de validation | Statut final |
|---|---|---|---|---|---|---|
| Secrets | `.env.local` ignoré | Clés Supabase absentes ; aucune fuite détectée | Bloquant | Renseigner les clés uniquement localement/hébergées | Scan Git + contrôle des noms de variables | Bloqué par configuration |
| Connexion Supabase | URL et project ref présents | Clé publique absente, aucune requête possible | Bloquant | Configurer `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Lecture Auth + catalogue réel | Bloqué par configuration |
| Synchronisation base distante | Migrations locales seulement | CLI/token/mot de passe indisponibles | Bloquant | Lier le projet et exécuter un dry-run | `supabase db push --dry-run` | Bloqué par configuration |
| Catalogue | 12 prestataires codés en dur | Données de démonstration affichées | Critique | Charger les profils approuvés via Supabase et signaler le repli | Test repository + E2E recherche | Corrigé localement ; test réel bloqué par clé |
| Authentification | Client REST inutilisé | Aucun formulaire ni session fonctionnelle | Critique | Client officiel, formulaires validés, gestion session/erreurs | Inscription/connexion/récupération E2E | Implémenté ; test réel bloqué par clé |
| Autorisation par rôle | Tableaux de bord accessibles par bouton | Aucun contrôle serveur | Critique | Protéger les routes et vérifier `profiles.role` | Tests client/prestataire/admin | RLS + contrôle UI ; intégration bloquée |
| Élévation de privilège profil | RLS autorisait l’utilisateur à mettre à jour sa ligne | `role` et `is_suspended` modifiables par le propriétaire | Critique | Trigger bloquant les champs privilégiés | Test SQL de tentative d’élévation | Corrigé en migration |
| Validation prestataire | RLS propriétaire trop large | Prestataire capable de modifier son statut/sa vérification | Critique | Protéger statut, vérification et agrégats | Test SQL prestataire | Corrigé en migration |
| Justificatifs | RLS propriétaire trop large | Prestataire capable de modifier le statut de revue | Critique | Protéger les champs administratifs | Test SQL prestataire | Corrigé en migration |
| Réservation | Formulaire simulé | Aucune écriture Supabase | Critique | Enregistrer une réservation authentifiée | Test d’intégration insertion | Implémenté ; intégration bloquée |
| Conflits de réservation | Contrainte d’exclusion présente | Non appliquée/vérifiée à distance | Critique | Appliquer migration et tester deux créneaux concurrents | Test SQL conflit `23P01` | Bloqué par base distante |
| Transitions de statut | Trigger incomplet | Sauts de statut possibles côté prestataire | Critique | Graphe strict côté SQL et domaine TS | Tests unitaires + SQL | Corrigé localement |
| Disponibilités | Créneaux statiques | Aucun calcul durée/règles/exceptions | Critique | Générateur Africa/Dakar avec conflits et délai | Tests durée/conflit/annulation | Corrigé dans le domaine |
| Favoris | État React temporaire | Perdus au rechargement | Important | Upsert/delete dans `favorites` | Test d’intégration propriétaire | Implémenté ; intégration bloquée |
| Avis | Tables et RLS initiales | Moyenne non recalculée ; update trop large | Critique | Trigger d’agrégation et protection des champs | Tests moyenne + SQL | Corrigé localement |
| Notifications | Données statiques | Aucun événement réel | Important | Triggers réservation/statut/message | Test d’intégration | Corrigé localement |
| Messagerie | Schéma uniquement | Aucune interface ni mutation | Important | Repository, écran et realtime avec repli | Test membres/non-membres | À faire |
| Administration | Tableau statique | Actions sensibles non branchées | Critique | Routes serveur, confirmation, audit | E2E admin + audit log | À faire |
| Audit d’actions | Table sans alimentation | Actions sensibles non tracées | Critique | Triggers sur suspension/validation/documents | Test `audit_logs` | Corrigé localement |
| Paiement | Sur place simulé signalé | Enum incomplet face au contrat cible | Important | Ajouter statuts sans transaction réelle | Test cohérence des statuts | Corrigé localement |
| Storage | 3 buckets déclarés | Bucket couvertures absent | Important | Ajouter `provider-covers` et politiques propriétaire | Test upload croisé | Corrigé localement |
| Boutons tableaux de bord | Plusieurs boutons sans gestionnaire | Actions sans effet | Important | Brancher, désactiver avec explication ou retirer | Audit DOM + E2E | Corrigé pour le périmètre visible |
| Gestion des erreurs | Toast unique | Pas de boundary ni page 404 | Important | Ajouter `error.tsx`, `not-found.tsx`, erreurs homogènes | Test erreur contrôlée | Corrigé |
| Tests unitaires | 2 tests structurels | Logique métier non testée | Important | Vitest sur prix, durée, créneaux, transitions, avis | `pnpm test` | Corrigé |
| Tests d’intégration | Absents | Aucun test réel Supabase/RLS | Critique | Suite conditionnelle sur instance locale | `pnpm test:integration` | Bloqué par Supabase |
| Tests E2E | Absents | Parcours non vérifiés | Critique | Playwright avec traces et captures à l’échec | `pnpm test:e2e` | 6/6 publics passent |
| Responsive | CSS 760/1050 px | Largeurs demandées non contrôlées | Important | Tests 320–1440 px | Playwright multi-viewport | 320 px et bureau passent ; matrice complète à étendre |
| Performance | SPA client unique | Bundle et rerendus inutiles | Important | Séparer données, composants et routes serveur | Comparaison build + requêtes | À faire |
| Dépendances | Stack minimale | Client Supabase/validation/tests absents | Important | Ajouter dépendances ciblées | Install + audit + build | Corrigé |
| Vulnérabilités dépendances | Non contrôlées | 13 alertes initiales, dont Next.js, Sharp et PostCSS | Critique | Mettre à niveau et verrouiller les versions corrigées | `pnpm audit --prod` | Corrigé : aucune vulnérabilité connue |
| GitHub | Remote configuré, dépôt distant vide | Branche non poussée | Important | Pousser la branche après contrôle explicite des secrets | `git ls-remote` | En attente |

## Résultats reproductibles

- `pnpm lint` : réussi.
- `pnpm typecheck` : réussi en TypeScript strict.
- `pnpm test` : 9 tests métier réussis.
- `pnpm build` : réussi.
- `pnpm test:e2e` : 6 tests Playwright réussis sur bureau et mobile 320 px.
- `pnpm audit --prod` : aucune vulnérabilité connue après mise à niveau.
- Le serveur `vinext start` 0.0.50 présente sous Windows un défaut de résolution
  des chemins d’assets avec séparateurs `\`. `scripts/local-preview.mjs` ajoute
  uniquement pour la QA locale une couche statique; le bundle produit n’est pas
  modifié.

## Règle de verdict

Le produit ne doit pas être déclaré prêt pour des utilisateurs réels tant que
la clé publique Supabase n’est pas configurée, que les migrations n’ont pas été
comparées/appliquées à la base distante et que les parcours Auth, réservation,
RLS et administration n’ont pas passé leurs tests d’intégration et E2E.
