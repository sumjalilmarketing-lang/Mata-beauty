# Mata Beauty — release candidate du 15 août 2026

## Verdict actuel

**NOT READY pour la production.** La Preview peut être générée, mais les tests distants authentifiés et la publication programmée restent bloqués par la configuration serveur Vercel. Le paiement reste volontairement en mode `mock` conformément à la politique du dépôt.

## Corrections de cette phase

- CRUD sécurisé des catégories et sous-catégories dans le Super Admin : création, édition, image, ordre, parent, masquage, réactivation et suppression refusée en présence de dépendances.
- Audit de chaque mutation de catégorie et contrôle par `categories.manage`.
- Publication automatique des posts programmés via une route cron protégée et un RPC transactionnel utilisant `FOR UPDATE SKIP LOCKED`.
- Calcul centralisé brut / commission / net à partir des règles actives, appliqué côté base à chaque paiement, y compris en mode mock.
- Enregistrement idempotent de la commission Mata lors des transitions financières réussies.
- Affichage du brut, de la commission et du net dans les espaces professionnels et salons ; règles et écritures réelles visibles dans le Super Admin.
- Migration `20260815200000_release_candidate_integrations.sql` appliquée sur le projet Supabase `qjdwxdbvrxedyfolnpol` et objets vérifiés.

## Contrôles exécutés

| Contrôle | Résultat |
| --- | --- |
| ESLint | PASS |
| TypeScript strict | PASS |
| Vitest | 57/57 PASS |
| Tests structurels Node | 16/16 PASS |
| Playwright | 144/144 PASS sur 9 projets |
| Build Next.js | PASS après les derniers ajustements UI |

Les formats Playwright sont : desktop, 320 px, 360 px, 375 px, 390 px, 430 px, tablette 768 px, laptop 1366 px et grand écran 1920 px.

## Mesures de réservation

- Parcours classique : 8 actions, moyenne 7,147 s, minimum 4,429 s, maximum 10,401 s.
- Parcours depuis Inspiration : 6 actions, moyenne 5,269 s, minimum 3,731 s, maximum 7,312 s.
- Conservation de la prestation et du créneau après authentification : PASS dans la matrice contrôlée.
- Créneau déjà réservé retiré : PASS dans la matrice contrôlée.
- Isolation d’un autre utilisateur : PASS dans la matrice contrôlée.

Ces mesures utilisent un backend Supabase intercepté par les tests UI. Elles mesurent le parcours et les interactions, pas la latence d’un compte réel distant.

## État par domaine

- Auth client/prestataire : architecture, callback, récupération, session et redirections testés localement ; création distante réelle bloquée par la clé serveur invalide.
- Auth salon/staff : contrôle d’accès serveur présent ; données réelles inter-rôles non rejouées dans cette phase.
- Auth Admin/Super Admin : RBAC/RLS et RPC audités présents ; connexion distante réelle non rejouée dans cette phase.
- Supabase/RLS : migration appliquée, fonctions critiques présentes ; suite distante complète bloquée par la clé serveur.
- Storage/Studio/feed : upload et publication couverts structurellement ; programmation désormais automatisable mais cron non activable sans secrets Vercel.
- Réservations/messagerie/notifications/avis/modération : schémas et parcours UI existants, matrice locale verte ; scénario distant complet non rejoué.
- Catégories : CRUD désormais connecté ; validation réelle avec un compte Super Admin reste à exécuter.
- Salons : tables, RLS, profils, collaborateurs et espaces existent, mais plusieurs écrans génériques restent principalement des listes et ne couvrent pas tout le CRUD demandé.
- Paiements : infrastructure interne, idempotence, webhooks, remboursements, ledger et commissions présents ; fournisseur externe non configuré, mode mock conservé.
- Vercel : variables publiques présentes en Production et Preview ; `SUPABASE_SERVICE_ROLE_KEY` seulement en Preview et techniquement invalide ; `CRON_SECRET` absent.

## Blocages externes

1. Récupérer la vraie clé serveur du projet Supabase et la transmettre dans les champs sécurisés Vercel pour Preview, Production et Development, sans l’exposer.
2. Créer `CRON_SECRET` dans Vercel pour Preview et Production afin d’autoriser la tâche planifiée.
3. Redéployer puis exécuter les suites distantes avec comptes temporaires et nettoyage contrôlé.
4. Valider un PSP réel avant toute sortie du mode mock.
