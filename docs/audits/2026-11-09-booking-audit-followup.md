# Mata Beauty — audit et refactoring, deuxième livraison

Date : 9 novembre 2026. Base : version publiée `49784346b94472db68500794e4bcb6ff43664f67` (contenu identique au correctif `26b439e`).

## Résultat et limites de la mission

Cette passe ajoute un contrat de réservation de plusieurs soins, les variantes, le report client, la recherche serveur paginée et un correctif de confidentialité des absences. Les fichiers sources sont complets dans la branche de livraison. Aucun code abrégé n'est utilisé à la place d'une implémentation.

Ce rapport n'est pas une garantie d'absence absolue de défaut. La recette visuelle de chaque état de chaque élément dynamique, les messages reçus sur de vrais téléphones, le fournisseur de paiement réel et les performances sous charge ne peuvent pas être déclarés réussis sur la seule base de tests isolés. Les résultats observés sont distingués ci-dessous de la couverture restant à réaliser.

## 1. Tableau de bord des anomalies

| Fichier / Page | Composant / Bouton ciblé | Type de faille | Criticité | Correction / état |
| :--- | :--- | :--- | :--- | :--- |
| `app/mata-beauty-app.tsx` et contrat SQL | Sélection de plusieurs soins | Logique métier | Majeur | Un seul RDV continu, de 1 à 8 soins, prix/durée serveur, snapshots historiques immuables |
| Même parcours / `service_options` | Options obligatoires et facultatives | Logique métier / créneau | Majeur | Choix affichés, options obligatoires incluses, calcul serveur des suppléments de prix/durée ; interdiction des options appartenant à un autre soin |
| Contrat SQL / agenda | Collaborateur « sans préférence », réaffectation, report | Concurrence / métier | Majeur | Habilitation pour TOUS les soins sur tout le bloc, buffer, fermetures, exclusions et verrou conservés |
| Disponibilité multi-soins | Prochaine disponibilité d'une personne nommée | Logique métier / pagination | Majeur | Calcul sur l'agenda de la personne avant plafonnement global, sans attribution à un collègue |
| Fonction mono `enforce_booking_contract` installée | Date d'un soin international près de minuit | Logique calendrier | Majeur | Remplacement du jour forcé Africa/Dakar par le fuseau de l'établissement ; cas New York 22 h reproduit et corrigé |
| `app/client-booking-groups.tsx`, API reschedule | Déplacer le RDV côté client | Fonctionnalité / sécurité | Majeur | Sélecteur de créneau serveur, propriété vérifiée, préavis >48 h, contrat et collaborateur conservés, aucun paiement engagé |
| `app/mata-beauty-app.tsx` | Confirmer après retrait du créneau | UI / concurrence | Majeur | Confirmation désactivée si le créneau n'appartient plus aux disponibilités rechargées ; le garde SQL reste l'autorité |
| `app/use-dialog-focus.ts` | Clavier du modal de réservation | Accessibilité | Majeur | Focus initial, boucle Tab/Shift+Tab, Échap, restauration du focus, respect du modal d'authentification imbriqué |
| `app/social-feed.tsx` | URL `country=INVALID`, Retour/Avancer | Résilience / navigation | Majeur | Région validée avant Intl, état restauré sur popstate, données d'historique Next conservées |
| Même fichier / RPC de recherche | Filtrer un feed volumineux | Performance / découverte | Majeur | Filtres serveur AVANT pagination, curseur date/UUID, huit lignes par page, requêtes obsolètes annulées |
| `lib/supabase/catalog.ts` | Catalogue au démarrage | Performance | Majeur à grande échelle | Fenêtre initiale bornée à 100 professionnels ; recherche globale assurée par RPC, ouverture d'un auteur manquant chargée à la demande |
| Cinq routes API admin/maps/invitation | Corps de requête et champs inattendus | Sécurité / résilience | Majeur | Lecture bornée à 2 ou 16 Kio, Zod strict, erreurs 400/413 sans fuite SQL |
| `availability_exceptions` | Motif d'absence du professionnel | Confidentialité / RBAC | Bloquant | Politique SELECT publique supprimée ; propriétaire conserve son accès ; RPC public ne renvoie que les créneaux |
| `app/live-dashboard.tsx`, agenda salon / RPC équipe | Nom des soins après réservation | Intégrité historique | Majeur | Affichage du snapshot contractuel, y compris variantes, plutôt que du seul premier soin renommé |

## 2. Audit écran par écran

### Découverte et recherche

Le bouton Rechercher reste actif pendant le chargement. L'URL et les entrées Retour/Avancer restaurent le texte, la catégorie, le pays, le professionnel, la zone et le rayon. Les coordonnées personnelles restent hors de l'URL et du stockage persistant. Les identifiants invalides ne deviennent pas une recherche non filtrée.

Le nouveau RPC `search_inspiration_feed` est SECURITY INVOKER. Il filtre les publications publiques avant de retourner une page : texte normalisé (accents/synonymes), service/catégorie, établissement, pays et distance. Le curseur combine date et UUID pour départager des publications à la même seconde. La limite est bornée, les anciennes requêtes sont annulées et la recherche est temporisée pour limiter les requêtes de frappe.

Les scénarios ajoutés couvrent une correspondance située après les huit premières publications, avec catalogue client vide, ainsi que les filtres pays/catégorie, le rayon, le curseur et RLS. Le feed d'abonnements conserve son parcours distinct. Ce n'est pas un test de charge d'un catalogue mondial.

### Fiche salon et sélection de soins

Le soin d'origine reste le premier élément du panier ; jusqu'à sept autres prestations du même établissement et de la même devise peuvent être ajoutées. Les doublons sont refusés et la durée cumulée est plafonnée à douze heures. La durée et le prix visibles se mettent à jour ; le serveur recalcule le contrat sans recevoir de montant autoritaire du client.

Les options actives sont chargées séparément, avec validation Zod. Les options obligatoires sont cochées et non désélectionnables. Leurs suppléments sont inclus dans le bloc recherché. Une option ne peut pas être appliquée à une prestation non sélectionnée. Le chargement incomplet des options bloque la confirmation afin de ne pas réserver sur un tarif ou une durée partiels.

Un panier de plusieurs soins est actuellement réservé en salon et réglé sur place. Pour un seul soin à domicile avec variantes, la disponibilité tient compte de sa durée complète et la création conserve le contrat de localisation existant. Les frais géocodés dynamiques du déplacement ne sont pas certifiés par une prévision de prix statique.

### Calendrier et collaborateur

Les éléments recensés sont : cases de soins, cases de variantes, choix du lieu, tuiles de date, autre date native, sans préférence, personne nommée, créneaux horaires, réessai, actualisation et prochaines disponibilités.

Changer le panier, une variante, le lieu ou la personne invalide le créneau sélectionné. Les montants et durées sont établis à partir des lignes publiées et des options serveur. Le collaborateur doit être habilité pour tous les soins et disponible sur tout l'intervalle cumulé, avec son buffer. Les règles conservent le fuseau local, les transitions DST, le préavis et les fermetures.

Le contrôle GiST de chevauchement des rendez-vous actifs et le verrou transactionnel existants sont conservés. Les tests isolés vérifient qu'une interruption située après le premier soin interdit le bloc complet et qu'un collaborateur habilité au seul premier soin ne peut ni être choisi ni recevoir une réaffectation. Ils ne doivent pas être décrits comme deux sessions distantes de production simultanées.

### Confirmation

Le récapitulatif présente tout le contrat et la confirmation utilise les valeurs enregistrées par la base. Les identifiants de soins/options sont validés ; les prix ne viennent pas du payload. La confirmation est désactivée pendant l'envoi ou si le créneau a disparu après rafraîchissement. Une réponse de création invalide n'est pas annoncée comme une réussite.

Les retours de panne distinguent absence de disponibilité, panne de chargement et résultat de réservation non vérifiable. Le modal reste navigable au clavier ; fermer ou modifier est bloqué pendant la soumission. L'authentification imbriquée garde sa propre priorité de focus.

### Paiement

Les paniers composites et leurs variantes sont réglés sur place. Le refus des paiements en ligne existe aussi en base, sous les RPC : masquer un bouton n'est pas la protection financière. Le chemin mono existant conserve son contrôle d'idempotence et ses règles de fournisseur.

Le paiement réel et l'encaissement des acomptes restent désactivés conformément aux instructions du dépôt. Les acomptes prévus ne sont pas présentés comme un débit. Le revenue sharing, les remboursements PSP réels et les SMS/emails effectivement reçus nécessitent une recette opérationnelle supplémentaire.

### Espace client et report

Le bouton Déplacer est présenté pour un rendez-vous actif à plus de 48 heures. Le serveur vérifie de nouveau cette règle, l'identité propriétaire, l'état du compte et l'absence de tentative de paiement. Les professionnels disposant aussi du rôle client peuvent utiliser le parcours client ; aucun rôle n'est lu depuis des métadonnées utilisateur modifiables.

La date propose uniquement des créneaux compatibles avec la durée et le buffer historiques. Le prix, les soins et le collaborateur ne changent pas. Le verrou porte sur le professionnel puis la réservation. Répéter la même cible est idempotent. La liste et le message de succès ne changent qu'après réponse serveur validée. Les contrôles interdisent de dissimuler une modification de prix ou d'état dans un report.

### Espace professionnel, salon et équipe

Les agendas réutilisent les intitulés contractuels avec variantes. Les candidats à une réaffectation, les alertes de conflit et les reports appliquent le contrat complet. Les horaires, pauses et absences restent gérés par leurs contrôles de propriété actuels. Les durées et tarifs historiques restent figés même si le catalogue change.

### Erreurs, API et confidentialité

Une page `loading.tsx` fournit un état de chargement annoncé. Les routes maps, invitations et administration lisent désormais des corps bornés avant traitement. Le précédent correctif du portefeuille distingue toujours panne et solde nul.

Une lecture des métadonnées réelles a confirmé la fuite du champ `availability_exceptions.reason`. Le test reproduit d'abord la lecture anonyme, puis applique la migration : visiteurs et tiers ne voient plus l'absence, le propriétaire conserve lecture/modification et les RPC publics continuent d'exclure la période bloquée sans renvoyer de motif.

## 3. Modèles, sources et preuves inspectables

| Livrable | Contenu |
| :--- | :--- |
| `2026-11-09-production-schema.json` | Métadonnées de 18 tables centrales : colonnes, contraintes et politiques RLS, sans enregistrement utilisateur ; état de production avant cette seconde livraison |
| `2026-11-09-interactive-elements.csv` | Inventaire AST de tous les éléments JSX interactifs, avec fichier, ligne, label source, événements, disabled et attributs aria ; une boucle représente un modèle d'éléments dynamiques |
| `2026-11-09-static-inventory.csv` | Registre des pages, composants/modules et endpoints ; inventaire initial à lire avec les nouveaux fichiers de cette branche |
| `2026-11-09-api-rbac-followup.md` | Revue des routes existantes, contrôles d'accès, validation et idempotence ; nouvelle route `/api/bookings/reschedule` décrite dans le présent rapport |
| Migrations `20261109125316`, `20261109125333`, `20261109130527`, `20261109130832` | Report client, contrat composite/variantes, recherche serveur et confidentialité des absences |
| Tests SQL et API de la branche | Reproduction des défauts, pile réelle de triggers/tarification/RLS, cas négatifs et nouveaux scénarios navigateur |

Le schéma applicatif réel est PostgreSQL/Supabase. Le fichier Drizzle SQLite hérité du starter n'est pas utilisé comme ORM de production ; aucun modèle ORM fictif n'est présenté comme le schéma réel.

Les fichiers réécrits restent complets, TypeScript strict, sans ajout de `any` ni clé privilégiée dans le navigateur. Les migrations échouent explicitement si une définition SQL à modifier ne correspond pas à la version inspectée : ce garde évite d'écraser silencieusement un contrat divergent.

## 4. Validation et recette de livraison

Suite qualité locale terminée avec succès : **145 fichiers / 929 tests**, TypeScript strict et build de production réussis ; lint sans erreur, 8 avertissements préexistants. Les résultats des scénarios navigateur distants, de la compatibilité sur la base de recette et de la publication éventuelle sont consignés dans la PR de cette livraison. Les tests ciblés déjà exécutés couvrent la tarification réelle, le report, les options, le bloc continu, les ACL/RLS, les filtres paginés et les requêtes surdimensionnées.

L'inventaire statique n'est pas présenté comme une validation de tous les états hover, focus, disabled et loading sur tous les appareils. Les tests de charge, les comptes multiples distants concurrents, le PSP réel et les notifications physiques restent des limites explicites tant qu'aucune preuve d'exécution ne les valide.
