# Gestion des comptes, validation professionnelle et mots de passe

Date : 8 octobre 2026. Domaine : https://mata-beauty.com.

## Version livrée

- Code fonctionnel : `ce05620` ; recette complémentaire : `f9a25663f67245a87ea7c75c5d64bd29dc0f6c85`.
- Preview QA : https://mata-beauty-coygzncq2-africrm.vercel.app.
- Production : `dpl_7PysesczFHLRYDkDMKwHkbdnwHij`, https://mata-beauty-husgcvuwt-africrm.vercel.app.
- Vérification du domaine le 08/10/2026 à 12:06:12 UTC : HTTP 200, mêmes 15 scripts et 2 feuilles de style que le déploiement immuable ; référence Supabase production présente, référence QA absente.
- Trois migrations versionnées appliquées en QA puis en production : cycle des comptes, conservation des événements statistiques après suppression, finalisation idempotente.

## Comportements livrés

Gestion des comptes : recherche nom/e-mail, filtres, sélection de 20 comptes maximum, suspension, archivage, réactivation, suppression avec détail préalable et phrase de confirmation. Le marqueur de test vient des métadonnées serveur ; aucune déduction depuis l’adresse e-mail. Les comptes internes et le compte courant sont protégés.

La suppression refuse les dépendances à conserver, dont dossiers professionnels, réservations, finances, documents et fichiers. Les références publiques sont inventoriées côté serveur et recontrôlées au moment de la suppression. Les événements statistiques restent conservés avec leur référence de profil mise à NULL. Le journal de l’opération et les dates de consentement restent conservés. Un échec Auth ne doit pas être annoncé comme une suppression réussie. Le compte reste désactivé tant que le résultat est incertain.

La barre de décision regroupe « Approuver le dossier », « Demander un complément » et « Refuser ». L’approbation requiert les quatre pièces présentes dans le stockage, un dossier complet, les permissions, une confirmation et la vérification explicite du contenu par le relecteur. Le serveur refuse l’auto-approbation et les décisions répétées.

Le composant partagé de mot de passe équipe connexion, inscription, confirmation, mise à jour/reset et connexion administrative. Chaque champ est masqué initialement ; le bouton est accessible au clavier et ne modifie pas la saisie. Les critères et la correspondance des mots de passe sont visibles.

## Recette réellement exécutée

| Zone | Action | Résultat observé | Environnement | Statut |
|---|---|---|---|---|
| Qualité | Lint, TypeScript strict, 97 tests, build | Succès | Local et build Vercel | PASS |
| Utilisateurs | Recherche, filtre test, sélection | Comptes temporaires retrouvés, compte interne non sélectionnable | Preview QA | PASS |
| Utilisateurs | Archiver → réactiver → suspendre → réactiver | Profil conservé, accès bloqué/restauré, anciennes sessions révoquées | UI Preview + base QA | PASS |
| Utilisateurs | Supprimer deux comptes → confirmation → Auth/base/audit | Deux comptes supprimés ; une trace de suppression par compte | UI Preview + base QA | PASS |
| Conservation | Supprimer un compte ayant un dossier | Refus ; dossier conservé | RPC QA | PASS |
| Idempotence | Répéter début et finalisation de suppression | Même opération, aucune seconde trace de suppression | RPC QA | PASS |
| Permissions | Client, Super Admin sans MFA, Finance/Support/Onboarding/Modération/Contenu/Admin avec MFA | Gestion des comptes refusée | RPC QA | PASS |
| Permissions | Suppression, suspension ou archivage de son propre Super Admin | Refus | RPC QA | PASS |
| Permissions | Ancienne session suspendue modifie le statut puis tente un refresh | Modification refusée, refresh révoqué ; réactivation explicite conserve le profil actif | RPC QA | PASS |
| Validation | Quatre pièces → PDF → complément → nouvel envoi → approbation | Notification unique, historique, accès Professionnel | UI Preview + base QA | PASS |
| Responsive comptes | 390, 1366, 1440 et 1920 pixels | Aucun débordement de page | Chromium | PASS |
| Lisibilité | Confirmation de suppression | Aucune violation dans les règles axe WCAG A/AA testées ; capture inspectée | Preview QA | PASS |
| Mots de passe | Œil, masquage, indépendance, sélection, focus, clavier | Saisie intacte ; 390 et 1366 pixels | Preview et domaine production | PASS |
| Connexion administrative | Œil et masquage sans modification de saisie | Saisie intacte, aucun débordement à 390 et 1366 pixels | Domaine production, visiteur | PASS |
| Auth | Activation, reset + connexion, lien à usage unique, mauvais mot de passe, refresh, révocation, refus des routes internes, formulaire mobile | 11 contrôles réussis | Domaine production | PASS |
| API comptes | Requête visiteur | HTTP 403, MFA Super Admin requis | Domaine production | PASS |
| RLS | Deux nouvelles tables | RLS activée ; une politique de lecture autorisée par table | Base production | PASS |
| Version | Domaine public versus déploiement immuable | JS/CSS identiques, bonne base | Production | PASS |
| Super Admin | Répéter toutes les mutations avec une session interne de production | Non exécuté : accès à l’onglet utilisateur indisponible | Production | NOT TESTED |
| Validation | Répéter l’approbation avec un relecteur de production | Non exécuté dans cette livraison | Production | NOT TESTED |
| Emails | Réception réelle d’un email d’approbation | Comptes QA avec envoi supprimé ; aucune preuve de boîte de réception nouvelle | QA/production | NOT TESTED |
| Google | Nouveau consentement Google | Non exécuté pour ce correctif | Production | NOT TESTED |
| Matériel | iPhone/Android/trackpad physiques | Tests navigateur ne remplacent pas ces contrôles | Matériel réel | NOT TESTED |
| International | Langues, devises et réservations étrangères | Audit initial effectué, adaptation complète non livrée | Tous | NOT TESTED |

Les essais de suppression ont concerné exclusivement les comptes temporaires créés dans le projet QA isolé. Aucun compte réel n’a été supprimé. Les comptes Client temporaires créés pour les tests Auth de production ont été nettoyés.

## Incidents pendant la recette

- Le premier test API utilisait une requête hors du navigateur et suivait la protection Vercel. Il a été remplacé par une requête depuis la session navigateur ; refus visiteur et MFA AAL1 vérifiés.
- Le chemin `/admin/users` utilisé initialement par le test n’est pas une route produit. Le test utilise maintenant le bouton « Utilisateurs » réellement présent. La route directe existante est `/admin/clients`.
- Le scénario Auth cherchait un unique message de correspondance. Le nouvel indicateur en direct et le message de soumission produisent deux zones de statut. Le contrôle cible désormais le message de soumission ; les 11 scénarios repassent.
- Le cas limite de statut a d’abord utilisé un compte technique dont le profil n’avait pas encore été activé par le parcours applicatif. Le scénario effectue maintenant cette activation avant la suspension, puis vérifie le refus de mutation par l’ancienne session et la réactivation.

## Réserves de sécurité

L’advisor production conserve des avertissements : 4 tables RLS sans politique (accès serveur), extension publique, 18 fonctions SECURITY DEFINER accessibles à anon et 95 à authenticated. Ces comptes d’avertissements ne sont pas un nombre de vulnérabilités prouvées ; les nouvelles fonctions exposées sont protégées et les refus de rôles ont été testés en QA. Cette livraison n’est pas une certification exhaustive de toutes les fonctions historiques.

- [Vérification des fonctions SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- [Extension dans le schéma public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
- HaveIBeenPwned leaked-password protection — **BLOCKED BY PLAN — activation possible après upgrade Pro**. Aucun contournement ni imitation. [Protection fournisseur](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Preuves locales

- `work/account-lifecycle/rpc-results.json` : 8 groupes de contrôles serveur.
- `work/account-lifecycle/retest/` : scénario de gestion et captures.
- `work/account-lifecycle/accounts-390.png`, `accounts-1366.png`, `accounts-1440.png`, `accounts-1920.png`.
- `work/account-lifecycle/delete-confirmation.png`.
- `work/final-audit/part3-dossier-1366.png` et captures mobile/PDF.
- `work/account-lifecycle/production-auth/results.json` : 11 scénarios Auth, nettoyage confirmé.
- `work/account-lifecycle/admin-password-results.json` : bouton œil administratif sur deux tailles.
- `work/final-audit/production-version-f9a2566.json` : comparaison du domaine.

Ces fichiers de travail restent hors Git. Les traces navigateur ne sont pas publiées : elles peuvent contenir des données de session de recette.

Conclusion de cette livraison : corrections déployées et validées en QA ; contrôles publics/Auth validés en production. La répétition complète des deux parcours internes en production reste à exécuter. Ne pas présenter cette réserve comme PASS ni comme une validation générale de lancement.
