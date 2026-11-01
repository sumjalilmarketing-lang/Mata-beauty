# Bascule internationale de Mata Beauty — opération préparée

État : **autorisation des onze migrations reçue, exécution conditionnée à la clôture de la recette ; aucune migration Production exécutée**. Domaine mata-beauty.com ; Supabase Production `qjdwxdbvrxedyfolnpol`. Source internationale relue : code 183b4266c7f182b7584ee9301a2d7a0b875ebc32 et migrations ci-dessous, déjà appliquées dans mata-beauty-global-test.

L’instruction initiale de la mission était : « N’effectue aucune modification sur Supabase Production. » L’exception explicite a ensuite été accordée pour les onze migrations identifiées ci-dessous, après satisfaction des conditions de recette. Cette autorisation est acquise ; la connexion MFA à l’administration reste une condition d’accès distincte.

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
5. L’autorisation explicite de l’exception Production étant reçue, après clôture de ces conditions, appliquer les migrations dans l’ordre, vérifier schéma/grants/RLS, puis publier le candidat correspondant et examiner les erreurs.

## Limites de la décision

La production nationale publiée reste READY sur le code 0681317b28e9ee18884c4abec2c7a3c61cc9a61a. L’administration Super Admin/MFA, le chargement du nouveau module, le refus d’une recherche inexistante et la matrice des permissions ont été observés en Production. Aucun droit n’a été modifié par ces contrôles.

**Le GO international public complet n’est pas délivré.** Ce plan rend la prochaine opération identifiable ; il n’annonce ni l’application des migrations, ni la réussite de la recette navigateur encore ouverte, ni la validation d’un paiement international en ligne.

Précontrôle supplémentaire en lecture seule : aucun service actif d’un salon approuvé et actif sans ligne business_hours n’a été relevé par le prédicat de transition exécuté. Ce contrôle ne valide pas le contenu de tous les horaires ni la localisation réelle de chaque établissement.

## Point de reprise après autorisation

- Sauvegardes Production : sept sauvegardes quotidiennes COMPLETED observées dans Supabase. Dernière sauvegarde affichée : 30 octobre 2026 à 23:09 UTC, soit 31 octobre à 00:09 à Paris. PITR non activé ; aucun abonnement, restauration ou nouveau projet déclenché. Il ne s’agit ni d’une sauvegarde fraîche avant bascule ni d’une restauration répétée avec succès.
- Export préalable en lecture seule conservé localement, hors publication GitHub : définitions des routines, déclencheurs, métadonnées de colonnes et contraintes concernées. Sans lignes métier ni identifiants d’authentification. Cet inventaire JSON ne constitue pas un script de restauration exécutable ; son usage doit préserver les données créées après migration. La publication des définitions internes a été refusée par le contrôle automatique et n’a pas été effectuée.
- Les onze empreintes des sources de migration ont été revérifiées sans modification des fichiers.
- Preview isolée actualisée sur le code 183b426 : déploiement `dpl_H77gPicSuTf4SwHwiFgyGiG376vL`, READY. Cette cible `staging` utilise la configuration Preview de test ; elle ne constitue pas un artefact construit avec la configuration Production et ne doit pas être promue telle quelle sur mata-beauty.com.
- Le contrôle automatique a refusé la désactivation globale de l’affectation automatique des domaines Vercel, en raison de son effet persistant sur les déploiements futurs. Aucun réglage global modifié. La préparation d’un candidat Production sans affectation du domaine reste ouverte ; le refus n’a pas été contourné.
- Tentative supplémentaire de concurrence : deux connexions SQL distinctes ont lancé une réservation du même créneau. Toutes deux ont été refusées avec `42501: Compte client indisponible`, car les nouvelles identités fictives étaient non vérifiées. **Ce résultat ne valide pas la prévention concurrente des doubles réservations.**
- Le contrôle automatique a refusé de forcer par SQL privilégié la confirmation et l’activation de ces identités : cela contournerait la vérification normale des comptes, interdite par la mission. Aucune activation forcée effectuée. Les trois identités fictives et la prestation de cette tentative ont ensuite été nettoyées dans le seul projet de test ; vérification finale : zéro identité et zéro réservation de cette tentative restantes.
- La connexion normale du propriétaire du dossier fictif est préparée dans Chrome, sans saisie ni lecture de mot de passe. Son authentification et les quatre pièces TEST restent nécessaires pour soumettre puis approuver le dossier par le parcours normal. La session Super Admin ne doit pas être utilisée pour créer un dossier professionnel à la place de ce propriétaire.

Décision maintenue : **NO-GO international public complet**, jusqu’à la clôture des parcours navigateur, de la concurrence et de la préparation coordonnée du candidat Production. La version nationale publiée reste en place ; aucun schéma ou compte de Supabase Production n’a été modifié pendant ce point de reprise.

## Actualisation du correctif d’authentification

La source internationale courante est maintenant `6feaa7bd7836c3b388e5942e658f9684585a7807`, sur la Preview isolée `dpl_7JSQnvsRFw7W546P6mSjac2NJHdm` READY. La Production nationale est sur `67358b2d09d0d9feefdb6cd57e77f717b003143c`, déploiement `dpl_A8bjqtpzfUN83wvXe3V8ZbSjFjTS` READY. Les changements portent uniquement sur la confirmation et les messages d’authentification ; aucune source SQL parmi les onze migrations n’a changé. Voir AUTH_EMAIL_RECOVERY_2026-10-31.md pour les preuves et limites. Le compte fictif sans mot de passe disponible et sans boîte de réception contrôlée reste un blocage de recette ; répéter la récupération sur cette adresse ne le résout pas.
