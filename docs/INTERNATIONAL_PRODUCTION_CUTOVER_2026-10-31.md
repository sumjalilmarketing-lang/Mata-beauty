# Bascule internationale de Mata Beauty — opération préparée

État : plan préparé, **aucune migration Production exécutée**. Domaine mata-beauty.com ; Supabase Production `qjdwxdbvrxedyfolnpol`. Source internationale relue : code 183b4266c7f182b7584ee9301a2d7a0b875ebc32 et migrations ci-dessous, déjà appliquées dans mata-beauty-global-test.

L’instruction initiale de la mission était : « N’effectue aucune modification sur Supabase Production. » Une exception explicite à cette limite est nécessaire avant l’exécution de ces opérations sur cette base. La connexion MFA à l’administration n’accorde pas à elle seule cette exception.

## Périmètre exact

Ajouter les champs pays, région, fuseau et devise et leurs contrôles ; remplacer les procédures de disponibilité par les versions tenant compte des fuseaux et changements d’heure ; renforcer le contrôle des insertions de réservation ; corriger les notifications locales, les agrégats par monnaie et la liste des collaborateurs ; ajouter cinq catégories de beauté non médicales si leur slug est absent.

Aucun transfert de comptes ni réservation fictive de test en Production, aucune attribution de rôle, aucune suppression de données, aucune conversion de tarifs ou de contrats existants, aucun paiement réel, aucun changement de YOBALELMA. Les établissements existants gardent leurs valeurs ; leur localisation n’est pas déduite de celle de leur propriétaire. Le comportement historique de calendrier est conservé comme secours pour les fuseaux non encore renseignés.

## Fichiers à appliquer dans cet ordre

| Migration versionnée | SHA-256 du contenu relu |
| --- | --- |
| 20261030100000_global_identity_location.sql | `a05d574c440ff905b13f19d29c6dfe4891ee39e07a892dee9bfe4afb363e365b` |
| 20261030101000_global_establishment_location.sql | `96f59ca14111ef0ee5c973c202e21f3d777384de00bf8f4d73e5bda508a0c7ec` |
| 20261030102000_timezone_aware_availability.sql | `b12b090ac7d9e2ab135bc1bc7ac7d7894a04575bfac788ada2409eeace6d6df0` |
| 20261030103000_global_booking_notifications.sql | `9ed127a3198f6594e3452d2728d7f141042cbaaf970909a865e3bed91a640f0e` |
| 20261030104000_global_beauty_catalog_categories.sql | `3b57c8f9c7b8400708dda949d41ec92d8e55bbc7fcea7c1db59a7fb6eaf2f284` |
| 20261031014139_currency_aware_admin_aggregates.sql | `b760f3ac53ff04a9c64572cb298e4b048dd0626c4400603c6bf972f56d428d1c` |
| 20261031062239_dst_safe_independent_slots.sql | `0be386e4e2c245660953192aba0f8a8f52a2d484b46eeced00f1daf4007ca02f` |
| 20261031173823_enforce_international_booking_availability.sql | `6eae066ec444931b12160286deb4d739aea6707f4c0f184adad919775f392270` |
| 20261031175346_localize_assignment_notifications.sql | `5f4b742504b8c946f554d7e3cb90be7233652e78a72f272de0af86d271efeda0` |
| 20261031175514_fix_owner_collaborator_access_result.sql | `c20b7ab937519b2008691a29abefd21478e67e61f7761ed950e66c8731672481` |
| 20261031180040_enforce_nonteam_business_hours.sql | `353c69fbc537873a58f72026dcaee3a67e1ac5354e78365cbe14fa306a27ee90` |

Les sources se trouvent sur la branche codex/global-finalization-20261031. L’application des migrations et la publication du code international doivent être coordonnées : certains nouveaux contrôles imposent de renseigner le pays, le fuseau et la devise avant une nouvelle soumission professionnelle ou une nouvelle prestation. Le code national actuel ne constitue pas l’interface de cette bascule.

## Conditions avant exécution

1. Clôturer la recette normale du professionnel fictif et les parcours navigateur Client, Professionnel, Salon et Collaborateur dans le test ; vérifier la concurrence entre deux transactions distinctes. Les tests SQL déjà réussis ne remplacent pas ces étapes.
2. Vérifier l’état des sauvegardes et préparer les définitions précédentes des routines et des déclencheurs concernés. Un retour arrière du code web seul ne revient pas sur un schéma modifié.
3. Construire et vérifier le candidat de production sans l’affecter au domaine avant la migration. Utiliser un mécanisme de staging pris en charge ; ne pas exposer un frontend international à une base nationale incompatible.
4. Relever les contrôles de transition des établissements existants : disponibilité du calendrier du salon, devises des prestations et situation des dossiers en cours. Ne pas inventer de pays ou convertir les prix pour faire passer une contrainte.
5. Après autorisation explicite de l’exception Production et clôture de ces conditions, appliquer les migrations dans l’ordre, vérifier schéma/grants/RLS, puis publier le candidat correspondant et examiner les erreurs.

## Limites de la décision

La production nationale publiée reste READY sur le code 0681317b28e9ee18884c4abec2c7a3c61cc9a61a. L’administration Super Admin/MFA, le chargement du nouveau module, le refus d’une recherche inexistante et la matrice des permissions ont été observés en Production. Aucun droit n’a été modifié par ces contrôles.

**Le GO international public complet n’est pas délivré.** Ce plan rend la prochaine opération identifiable ; il n’annonce ni l’application des migrations, ni la réussite de la recette navigateur encore ouverte, ni la validation d’un paiement international en ligne.

Précontrôle supplémentaire en lecture seule : aucun service actif d’un salon approuvé et actif sans ligne business_hours n’a été relevé par le prédicat de transition exécuté. Ce contrôle ne valide pas le contenu de tous les horaires ni la localisation réelle de chaque établissement.
