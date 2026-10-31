# Audit général MATA Beauty — 31 octobre 2026

## Verdict
NO-GO pour un lancement international. La disponibilité du site national ne constitue pas une validation complète de sa réservation ou de ses espaces internes. Audit de code, inventaire SQL et contrôles de configuration ; ce document n'est pas un test d'intrusion ni une certification de sécurité.

## Versions examinées
- Production Vercel : READY, e4919bb2af48e35e646ba06b91bd08578fedd8cd.
- International : 6050566, directement au-dessus de cette production.
- Correctifs audités : branche codex/global-finalization-20261031, dernier code 2f120cd9d29b48e80ef1750d608b0310371ecfaa.
- Projet test : mata-beauty-global-test / skrrfronlhoddtgxvezu.
- Production Supabase examinée en lecture seule : qjdwxdbvrxedyfolnpol.
- Aucune modification des données Production ni activation de paiement réel pendant l'audit.

## Résultats et priorités
| Priorité | Domaine | Constat et preuve | Action / critère de clôture |
| --- | --- | --- | --- |
| P0 avant déploiement | Compatibilité internationale | Production : 0 colonne parmi timezone, currency, country_code dans provider_profiles ; migrations internationales absentes | Tester puis appliquer les six migrations internationales/correctives avec sauvegarde et retour arrière vérifiés, avant le code compatible |
| P0 avant GO | Recette intégrale | Studio Test Paris non soumis, 0/4 pièces ; aucun professionnel approuvé et aucune réservation au dernier inventaire test ; identifiants candidat refusés | Accès légitime au candidat, pièces TEST, soumission puis approbation UI ; réservation, confirmation, notifications internes, annulation et libération à Paris/New York |
| P0 avant GO | Séparation des espaces | Gardes de code présentes, mais quatre sessions distinctes non validées | Tester Client, Professionnel, Salon, Collaborateur et les refus croisés ; les tests unitaires ne prouvent pas cette isolation distante |
| P1 | Devises | Formats XOF imposés et totaux mélangeant les devises identifiés | Corrigés sur la branche : lignes et remboursements, totaux par devise ; nouvelle migration appliquée au test seulement ; validation UI et données multidevises habilitées encore requise |
| P1 | Notifications / exploitation | Route cron protégée par HMAC horodaté ; vercel.json ne contient pas de crons | Confirmer le planificateur externe et ses signatures, le traitement de file, les reprises et une délivrance de test ; absence de cron dans le dépôt ne prouve pas absence de planificateur |
| P1 | Auth et récupération | Super Admin de test avec un facteur vérifié et une seule attribution ; anciens comptes fictifs inutilisables avec les mots de passe saisis | Préparer des comptes de recette récupérables ; vérifier connexion, reset, expiration et révocation avec le parcours fournisseur normal |
| P1 | Autorisations SQL | Production : 20 fonctions SECURITY DEFINER signalées exécutables par anon, 134 par authenticated | Revoir chaque fonction, son contrôle d'identité, les paramètres et la portée des données ; ne pas révoquer globalement les RPC publiques nécessaires |
| P1 avant promesse internationale | Langues | html lang=fr ; choix fr/en/es proposés, mais feedText ne traduit que l'anglais avec repli français et nombreuses vues en français | Définir les langues réellement lancées ; compléter UI, erreurs, notifications et contenus légaux ; vérifier langue déclarée et navigation |
| P2 | SEO international | Métadonnées racine ciblent Dakar/Sénégal et Open Graph fr_SN | Préparer pages/localisation et métadonnées adaptées aux marchés ; éviter de supprimer le ciblage national sans stratégie |
| P2 | Assurance qualité continue | Aucun dossier .github dans le checkout ; contrôles actuellement exécutés manuellement | Vérifier les CI externes et ajouter une barrière qualité sur le commit candidat ; ne pas assimiler READY Vercel à une recette réussie |
| P0 avant lancement | Dépendances | pnpm audit --prod terminé : 15 avis, dont 5 critiques, 6 élevés, 3 modérés et 1 faible | Mettre à niveau et retester Next.js, Sharp, Zod et source-map-js ; vérifier l'applicabilité de chaque avis |
| À vérifier | Sauvegarde / restauration | Aucun exercice de restauration effectué dans cette intervention | Vérifier sauvegarde récente, restauration isolée et procédure de rollback applicatif et de données avant migration Production |

## Éléments positifs vérifiés
- 207 tests dans 42 fichiers, lint, TypeScript et build réussis sur le dernier correctif ; aucune garantie de couverture exhaustive.
- Tests de logique : fuseaux Dakar, Paris, New York, Bruxelles, Madrid ; heures inexistantes/répétées ; disponibilité et exclusions de plages.
- Production et test : aucune table ordinaire publique sans RLS, aucune vue publique sans security_invoker dans les inventaires SQL. Les politiques elles-mêmes restent à éprouver par rôles.
- Fonctions de pilotage test : anon sans EXECUTE ; authenticated sans identité reçoit null / objet vide ; contexte administratif anonyme null, is_admin et is_super_admin false.
- loadAuthenticatedProfile refuse les comptes suspendus ou désactivés ; requireWorkspace exige prestataire approuvé pour pro/salon ; staff exige des permissions de collaborateur.
- CSP, anti-framing, nosniff, Referrer-Policy et noindex des espaces privés présents dans la configuration ; leur présence dans le code ne vaut pas audit exhaustif des en-têtes réellement servis.
- metadataBase est désormais fixée à https://mata-beauty.com dans le code examiné : l'ancien repli localhost évoqué précédemment n'est plus le défaut de cette version.
- Aucun TODO/FIXME évident retrouvé dans app/lib par la recherche ciblée ; ce résultat ne démontre pas la complétude fonctionnelle.

## Avis de sécurité Production
- 7 INFO : RLS activée sans politique.
- 1 WARN : extension publique.
- 20 WARN : fonctions SECURITY DEFINER exécutables par anon.
- 134 WARN : fonctions SECURITY DEFINER exécutables par authenticated.
- 1 WARN : protection contre mots de passe compromis désactivée.
Ces comptes ne sont pas un nombre de vulnérabilités exploitées ou prouvées. La cause, l'exposition et les permissions doivent être revues individuellement.
Références fournisseur : https://supabase.com/docs/guides/database/database-linter et https://supabase.com/docs/guides/auth/password-security.

## Ordre de finalisation
1. Stabiliser les comptes de recette et terminer la candidature fictive par le parcours normal.
2. Tester les parcours Paris/New York et les quatre espaces, incluant concurrence réelle, devises et changements d'heure.
3. Valider l'interface du correctif sur une Preview exclusivement reliée au test.
4. Revoir les fonctions privilégiées et démontrer l'exécution des notifications et la récupération des comptes.
5. Vérifier sauvegarde/restauration et coordonner schéma/code ; déployer le commit testé puis contrôler le domaine et les erreurs runtime.

Le GO ne sera justifié qu'après clôture des P0 et des conditions pertinentes P1 avec preuves. Les champs réservés à la recette non exécutée ne doivent jamais être présentés comme PASS.

## Résultat final du contrôle des dépendances

Rapport pnpm audit --prod : 15 avis (5 critiques, 6 élevés, 3 modérés, 1 faible), sur l'arbre runtime déclaré. Ce résultat ne démontre aucune compromission et ne permet pas de considérer tous les avis comme exploitables sur Vercel.

| Dépendance | Version du projet | Version corrigée selon les avis les plus récents du rapport |
| --- | --- | --- |
| Next.js | 16.2.11 | >=16.4.1 |
| Sharp | 0.35.0 | >=0.35.5 |
| Zod | 4.4.3 résolue | >=4.6.6 |
| source-map-js | version transitive signalée <1.2.2 | >=1.2.2 |

Références remontées par le registre :
- Next.js : https://github.com/advisories/GHSA-2464-fhr4-w9xw ; https://github.com/advisories/GHSA-673q-mjm6-r5xr ; https://github.com/advisories/GHSA-p3m5-59mp-jv5r
- Sharp : https://github.com/advisories/GHSA-wq5f-xc86-pv6w
- Zod : https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- source-map-js : https://github.com/advisories/GHSA-68fv-2mgg-jv7q

La mise à niveau n'a pas été effectuée dans cet audit. Elle doit inclure les dépendances compatibles, le lockfile, tous les contrôles du projet et une nouvelle recette, plutôt qu'un déploiement automatique d'une version supposée corrigée.

## Remédiation des dépendances exécutée

Versions appliquées : Next.js/eslint-config-next 16.4.1, Sharp 0.35.5, Zod 4.6.6, source-map-js 1.2.2. L'audit runtime pnpm audit --prod passe de 15 avis à zéro avis connu (63 dépendances déclarées, 78 optionnelles). La table de vulnérabilités précédente décrit l'état avant correction, pas le nouveau candidat.

Version nationale : correctif isolé 055796f88915e797233509a8c2540e205a6b5cfd basé sur e4919bb, sans migration internationale. 177 tests, 26 contrôles smoke de structure, TypeScript et build local PASS ; lint zéro erreur, huit avertissements existants de navigation. Déploiement Vercel dpl_C5Q6FTDYjLxs9ngHKVzfmQag5jSv lancé avec autorisation utilisateur, vérification du domaine en cours à cette étape du rapport.

Version internationale : mêmes versions de dépendances ; 207 tests, TypeScript et build PASS ; lint mêmes huit avertissements. Les autres NO-GO restent applicables. Aucun paiement réel, aucun changement de données Production.
