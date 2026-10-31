# Confirmation et récupération des comptes — correctif

## Problème et comportement corrigé

L’interface renvoyait une inscription sans session vers la connexion et orientait les liens expirés vers « Mot de passe oublié ». Elle ne proposait pas de renvoyer la confirmation d’inscription. Le retour serveur n’acceptait pas le type `email` de la documentation Supabase, bien qu’il acceptât déjà `signup` utilisé par le modèle actuel du test.

Le formulaire possède maintenant un parcours « Renvoyer la confirmation », sans demander le mot de passe. Après inscription sans session, il conserve l’adresse et efface les deux champs de mot de passe. Le renvoi appelle uniquement `auth.resend` avec le type `signup` et le retour `/auth/confirm`. Le message reste générique et ne révèle pas l’existence d’un compte. Les erreurs de destinataire indisponible et d’envoi sont affichées sans détails du fournisseur.

Le retour serveur accepte `email` et `signup`, toujours après vérification du jeton par Supabase et vérification du profil. Les liens expirés et les types non pris en charge restent refusés. Aucun compte n’est confirmé par SQL, aucune attribution de rôle, aucune modification de RLS ou de MFA et aucune nouvelle clé privilégiée.

## Diagnostic des environnements

- Test international : confirmation d’adresse activée, service e-mail intégré affiché par Supabase, Google désactivé. Sur la fenêtre de journaux de 24 heures examinée : 23 erreurs `invalid_credentials`, quatre limitations d’envoi et deux liens expirés. Ces nombres agrégés n’attribuent pas une cause à chaque utilisateur.
- Le propriétaire fictif du dossier de recette utilise une adresse de démonstration sans boîte de réception contrôlée. Une récupération e-mail de ce compte ne peut pas constituer une procédure de recette reproductible. Le formulaire préparé précédemment n’en résout pas le mot de passe inconnu.
- Production : le réglage SMTP personnalisé est activé, vérifié en lecture seule ; aucun réglage, secret, modèle ou destinataire modifié. Ce constat ne certifie pas la délivrabilité.
- Le défaut de type `email` est un problème de compatibilité corrigé ; le modèle actuel du test utilise déjà `signup`. Il n’est pas présenté comme la cause des erreurs d’identifiants observées.

## Validation avant publication

- National : 209 tests dans 41 fichiers, 26 contrôles structurels, TypeScript et build PASS ; lint zéro erreur et huit avertissements de navigation préexistants.
- International : 252 tests dans 46 fichiers, 26 contrôles structurels, TypeScript et build PASS ; lint zéro erreur et huit avertissements préexistants.
- Sept cas de régression ajoutés : confirmations `email` et `signup`, trois types refusés, lien `email` expiré et messages de livraison sans fuite de détails.
- Aucun e-mail réel envoyé par ces tests. Aucun paiement réel ni migration Production.

## Limite de la clôture

Le correctif améliore le parcours d’authentification ; il ne recrée pas un mot de passe perdu et ne rend pas une adresse fictive joignable. La recette normale de Studio Test Paris, les quatre espaces avec comptes distincts, la concurrence réelle et le candidat Production international restent ouverts. Le GO international complet n’est pas délivré par ce correctif.
