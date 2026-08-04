# Mata Beauty — vision produit de référence

Statut : document directeur
Propriétaire : Product & Engineering
Dernière mise à jour : 4 août 2026

## Ambition

Mata Beauty est la plateforme sociale de la beauté en Afrique où l’inspiration devient naturellement une réservation. Le produit réunit dans une seule expérience la découverte de contenus, la confiance envers un professionnel, le choix d’une prestation, la disponibilité, la réservation, le paiement, la messagerie, les rappels et l’avis.

Mata Beauty ne doit pas devenir un simple annuaire ou un agenda numérique. Le contenu est le moteur d’acquisition et chaque vidéo publiée par un professionnel doit pouvoir générer une réservation mesurable.

## Promesse utilisateur

Une cliente doit pouvoir :

1. ouvrir directement un feed vertical ;
2. découvrir une réalisation et comprendre immédiatement le résultat, le professionnel, la ville, le prix et la durée ;
3. ouvrir le profil ou toucher « Réserver » sans quitter le contexte de la vidéo ;
4. choisir un créneau et confirmer en moins de trente secondes lorsque sa session et son profil sont prêts ;
5. retrouver au même endroit le rendez-vous, son statut, le paiement, les messages, les rappels et l’avis.

La rapidité n’est considérée comme acquise qu’après une mesure Playwright réelle.

## Boucle produit

```text
Publication professionnelle
        ↓
Découverte dans le feed
        ↓
Confiance et engagement
        ↓
Prestation liée + disponibilité
        ↓
Réservation attribuée à la vidéo
        ↓
Prestation + avis
        ↓
Nouveau contenu et nouvelle découverte
```

Cette boucle doit être traçable sans faire confiance aux données envoyées par le navigateur.

## Principes d’expérience

- Mobile d’abord, utilisable à une main dès 320 px.
- Une action principale évidente par écran.
- « Réserver » reste immédiatement visible sur chaque contenu commercialisable.
- Prix, durée, lieu et prochain créneau sont lisibles avant l’engagement.
- Aucun écran marketing long ne bloque l’accès au produit.
- Les retours arrière conservent le contexte ; OAuth conserve la prestation et le créneau.
- Chargements, erreurs, états vides et indisponibilités sont explicites et récupérables.
- Les animations restent discrètes et respectent `prefers-reduced-motion`.
- Aucun bouton sans action réelle.

## Surfaces du produit

### Cliente

- Feed « Pour toi » et « Abonnements ».
- Recherche, catégories, tendances et proximité.
- Likes, commentaires, enregistrements, partages, abonnements et signalements.
- Profils professionnels, portfolio, prestations, avis et disponibilités.
- Réservations, calendrier, paiements, favoris, messages et notifications.

### Professionnel ou salon

- Publication vidéo en moins d’une minute.
- Liaison obligatoire ou fortement recommandée entre vidéo et prestation active.
- Agenda, disponibilités, clientes, services, revenus et paiements.
- Statistiques de contenu : vues, engagement et réservations attribuées.
- Messagerie, notifications et support.

### Opérations

- Agent onboarding, support, modération, finance et super administration.
- Permissions granulaires, audit des actions sensibles et séparation des responsabilités.
- Modération des professionnels, contenus, avis et signalements.

## Rôles de référence

- Client
- Professionnel
- Salon
- Agent onboarding
- Support
- Modérateur
- Finance
- Super Admin

Un même compte peut porter plusieurs rôles autorisés. Aucune donnée déclarative du navigateur ou des métadonnées OAuth ne peut attribuer un rôle privilégié.

## Règles de sécurité et de données

- Toutes les tables publiques utilisent RLS.
- Les prix, durées, commissions et montants sont recalculés côté serveur.
- Une vidéo ne peut attribuer une réservation qu’à sa propre prestation active et publique.
- L’attribution contenu → réservation est immuable pour les utilisateurs.
- Les compteurs sociaux sont calculés par des fonctions atomiques.
- Les documents KYC restent privés et séparés des médias sociaux publics.
- Les secrets et la clé Supabase `service_role` ne sont jamais envoyés au navigateur.
- Les paiements restent en mode `mock` tant qu’un fournisseur réel n’est pas contractuellement validé et testé en sandbox.

## Indicateurs directeurs

### Découverte

- utilisateurs actifs quotidiens et hebdomadaires ;
- vidéos vues par session ;
- taux de complétion vidéo ;
- rétention J1, J7 et J30.

### Confiance et engagement

- taux de like, commentaire, enregistrement, partage et abonnement ;
- ouverture du profil depuis une vidéo ;
- signalements et délai de modération.

### Conversion

- clics « Réserver » par vidéo ;
- réservations attribuées par vidéo et professionnel ;
- conversion vidéo → réservation confirmée ;
- valeur brute attribuée au contenu ;
- temps et nombre d’actions jusqu’à la réservation.

### Qualité opérationnelle

- taux d’acceptation, d’annulation et de `no-show` ;
- délai de réponse professionnel ;
- erreurs de paiement et de webhook ;
- disponibilité, erreurs front-end et latence perçue.

## État fonctionnel vérifié au 4 août 2026

Le dépôt contient déjà un feed vertical, des vidéos liées aux prestations, les actions sociales principales, la publication professionnelle, les profils, les disponibilités, la réservation sécurisée, les tableaux de bord, l’administration, Google OAuth, les politiques RLS et une infrastructure de paiement en mode mock.

Le lot `20260804180000_social_booking_attribution.sql` ajoute la première mesure fiable du moteur business : une réservation lancée depuis le feed conserve sa vidéo source, vérifiée côté serveur, et le professionnel peut obtenir ses conversions sans accéder aux données d’un autre professionnel.

## Roadmap par lots

1. **Conversion sociale** — attribution vidéo → réservation, statistiques professionnelles et mesure des clics.
2. **Conversation** — messagerie temps réel, accusés de lecture et lien avec le rendez-vous.
3. **Création** — montage léger, brouillons, hashtags, miniature et publication réellement mesurée sous une minute.
4. **Découverte** — tendances, proximité, recherche hashtags et personnalisation transparente.
5. **Confiance** — avis post-prestation, vérification renforcée, modération et recours.
6. **Paiement réel** — PSP Sénégal validé, sandbox, webhooks signés, rapprochement et remboursements.
7. **Croissance multi-pays** — devises, fiscalité, moyens de paiement, langues et règles locales.

## Définition de terminé

Une fonctionnalité n’est terminée que si :

- son parcours mobile est utilisable et accessible ;
- les données réelles sont persistées dans Supabase ;
- les RLS et fonctions serveur empêchent les accès ou mutations illégitimes ;
- les erreurs, chargements et états vides sont couverts ;
- les tests unitaires, intégration et E2E pertinents passent ;
- ESLint, TypeScript strict et le build de production réussissent ;
- une Preview Vercel a été contrôlée avant toute promotion ;
- aucun mock n’est présenté comme une intégration réelle.

Ce document arbitre les évolutions futures. Toute nouvelle fonctionnalité doit renforcer la boucle contenu → confiance → réservation → fidélisation, ou démontrer clairement pourquoi elle mérite d’y déroger.
