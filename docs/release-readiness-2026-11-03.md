# Mata Beauty — préparation de publication, 3 novembre 2026

## Périmètre et statut

NO GO pour une soumission App Store / Play Store. Ce dépôt contient une application web Next.js/PWA, sans projet iOS/Android ni archive signée. Les tests unitaires ne prouvent pas la conformité aux stores, les droits Supabase ou la disponibilité réelle des services tiers.

## Corrections de cette branche

- Les anciennes adresses `/salon/menu`, `/pro/menu` et `/app/menu` rendent désormais les paramètres, au lieu d'une page sans rapport.
- `/pro/settings` affiche la confidentialité du compte et la demande de suppression ; le profil public reste distinct.
- Les cinq boutons mobiles partagent la largeur disponible, y compris sur 320 px ; la zone sûre inférieure est conservée.
- Une action sur une réservation vérifie son ancien statut et une ligne effectivement modifiée avant d'annoncer le succès. Un conflit exige une actualisation ; aucune réservation n'est réécrite par cette branche.
- Annuler la saisie facultative d'une demande de suppression ne transmet plus la demande.
- Une page publique `/account-deletion` décrit le parcours existant et un contact alternatif. Ce n'est pas une certification du traitement effectif des suppressions.
- Des tests navigateur isolés et une CI contrôlent le panneau Plus, sa fermeture clavier, le retour du focus, les destinations et la largeur. La fixture ne valide ni Auth réelle ni RLS.

## Contrôles et limites

Les tests unitaires, TypeScript, lint et build sont relancés avant commit. Les tests navigateur doivent être confirmés dans le workflow `Release quality` : le runtime local ne dispose pas des bibliothèques WebKit requises. Ne pas annoncer les tests navigateur comme réussis sans résultat du workflow.

## Blocages à traiter avant soumission

1. Reconstituer un environnement de recette à partir d'un export **du schéma réel**, sans données personnelles ni secrets, puis comparer fonctions, RLS, contraintes et déclencheurs. L'historique Production comporte trois mentions descriptives au lieu de SQL ; son rejeu a rencontré des politiques et contraintes existantes. Ne pas réécrire l'historique de Production ni restaurer un export de recette en Production.
2. PR #17 : rejouer la véritable migration sur la copie du schéma, tester les annulations client/prestataire/double rôle, les refus aux tiers, la concurrence, les rappels, l'historique et les notifications. Tester le retour arrière. Le préavis de 24 h doit être défini par le propriétaire : le SQL actuel ne l'impose pas. Aucun changement métier implicite dans cette branche.
3. Collaborateurs : résoudre séparément le désaccord entre `staff_update_booking_status` et le déclencheur concernant l'annulation prestataire.
4. Publier de véritables conditions et une politique de confidentialité fondées sur les traitements, sous-traitants et durées de conservation confirmés. Les pages « document en préparation » ne sont pas des politiques publiées.
5. Vérifier le traitement complet des demandes de suppression (authentification, données associées, contenus publiés, révocation de session et obligations de conservation). Une demande enregistrée ou un archivage ne prouve pas la suppression.
6. Contenus utilisateurs : le signalement existe ; aucun mécanisme utilisateur de blocage des auteurs n'a été identifié dans le code inspecté. Implémenter et tester le blocage côté serveur, y compris les messages et commentaires, sans retirer l'historique contractuel.
7. iOS : vérifier l'exigence Apple 4.8 relative aux connexions tierces. Google est présent ; une option équivalente conforme doit être configurée et testée lorsque la règle s'applique. Ne pas afficher un fournisseur non configuré.
8. Créer les projets mobiles, identifiants d'application et archives signées. Tester les appareils physiques, liens d'authentification, permissions facultatives/refusées, accessibilité et réseau interrompu. Une PWA ne constitue pas une archive App Store.
9. Renseigner les déclarations de confidentialité Apple et Data safety Google à partir des traitements constatés. Fournir les accès de revue pour chaque rôle sans donner de compte administrateur de Production.
10. Les paiements restent en mode mock conformément à AGENTS.md ; ne pas les présenter comme des paiements réels opérationnels. Aucune souscription développeur, signature, publication, fusion ou migration de Production n'est réalisée par cette branche.

## Références officielles

- Apple : https://developer.apple.com/app-store/review/guidelines/ (1.2, 4.2, 4.8, 5.1.1)
- Apple suppression : https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google données utilisateur : https://support.google.com/googleplay/android-developer/answer/10144311
- Google suppression : https://support.google.com/googleplay/android-developer/answer/13327111
