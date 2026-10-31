# Correctif de sécurité runtime — 31 octobre 2026

Base nationale : e4919bb2af48e35e646ba06b91bd08578fedd8cd. Ce correctif ne comprend aucune migration ni fonctionnalité internationale.

Next.js et eslint-config-next 16.4.1, Sharp 0.35.5, Zod 4.6.6 et override source-map-js 1.2.2. Lockfile recalculé ; installation figée vérifiée. Les versions précédentes remontaient 15 avis runtime (5 critiques, 6 élevés, 3 modérés, 1 faible). Le nouvel audit pnpm audit --prod ne remonte aucun avis connu. Cela ne constitue pas une certification de sécurité ni la preuve d'absence d'exploitation.

Contrôles national : 177 tests / 38 fichiers PASS, TypeScript PASS, lint 0 erreur et 8 avertissements de navigation existante révélés par la nouvelle règle Next.js. Build local PASS après installation isolée ; build Vercel et contrôle du domaine à vérifier après déploiement. Premier essai local de build interrompu par un lien node_modules sortant du worktree ; installation isolée recréée pour le second essai. Aucun contournement de protection navigateur ou de fournisseur.

Contrôles international avec mêmes dépendances : 207 tests / 42 fichiers PASS, TypeScript et build PASS ; lint 0 erreur et 8 avertissements. Les autres conditions de NO-GO international restent applicables.

Aucune modification d'identifiant, permission, paiement réel, notification externe ou base Production dans ce correctif. Le déploiement national de ce correctif est autorisé par l'utilisateur ; il ne vaut pas GO pour le lancement international. Vérifier domaine et logs après publication.
