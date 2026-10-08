# Préparation internationale — décision de périmètre

Décision utilisateur du 8 octobre 2026 : **Sénégal uniquement ouvert ; préparer Côte d’Ivoire et France**.

Ce document décrit une préparation et l’audit initial. Il ne certifie pas une internationalisation complète et ne prétend pas qu’un nouveau registre serveur de pays est déjà déployé.

| Pays | Code | Statut commercial demandé | Devise cible | Fuseau pilote | Indicatif | Langue initiale |
|---|---|---|---|---|---|---|
| Sénégal | SN | Seul marché ouvert | XOF | Africa/Dakar | +221 | Français |
| Côte d’Ivoire | CI | Préparation, non ouvert | XOF | Africa/Abidjan | +225 | Français |
| France | FR | Préparation, non ouvert | EUR | Europe/Paris pour le pilote métropolitain | +33 | Français |

Les autres territoires français ne doivent pas être assimilés automatiquement au fuseau Europe/Paris. Un pays préparé ne doit pas être annoncé comme réservable avant validation du parcours complet.

## Audit du code actuel

| Élément | Constat | Conséquence avant ouverture des pilotes |
|---|---|---|
| `lib/domain/availability.ts` | Créneaux construits avec un décalage UTC nul | Introduire le fuseau IANA du salon et tester les heures inexistantes/ambiguës |
| `app/mata-beauty-app.tsx`, messagerie, notifications, back-office | Nombreux affichages Africa/Dakar | Rendre le fuseau explicite et cohérent avec le salon |
| `lib/domain/booking.ts`, `lib/domain/payments.ts`, `lib/payments/gateway.ts`, API paiement | XOF imposé | Conserver montant et devise originaux ; ne jamais réinterpréter un prix XOF en EUR |
| Profil/salon/prestations/feed | FCFA affiché en dur à plusieurs endroits | Formateur de montant lié à la devise de la prestation |
| Profil/salon/localisation | Dakar par défaut et exemples +221 | Séparer exemples, valeurs héritées et choix explicites ; normaliser le téléphone sans imposer +221 |
| Interfaces | Texte français intégré aux composants | Catalogues complets, fallback contrôlé, préférences persistées et tests par langue |
| Documents | Quatre catégories actuellement communes | Valider les exigences locales avant d’accepter des dossiers CI/FR |
| Paiement | Mode mock ou sandbox ; aucun paiement réel ajouté par ce chantier | Pas d’ouverture de paiement sans fournisseur validé ; aucune simulation annoncée comme encaissement |

## Ordre de préparation

1. Registre serveur des marchés avec statut commercial distinct de l’état de préparation, permissions d’administration et journal des changements.
2. Pays, devise originale et fuseau du professionnel ; migration rétrocompatible des données sénégalaises sans modification de leurs prix.
3. Créneaux et réservations à instants UTC avec fuseau du salon ; tests DST France et chevauchements ; blocage serveur des marchés non ouverts.
4. Adresses et téléphone internationaux, recherche manuelle par pays/ville, messages distincts pour erreur GPS et absence d’offre.
5. Catalogues FR/EN/ES/PT/AR et RTL ; Wolof uniquement après validation humaine. Ne pas afficher un sélecteur promettant des traductions incomplètes.
6. Devises d’affichage uniquement avec fournisseur de taux réellement configuré et horodatage. Sans taux : montant original, aucune conversion inventée.
7. Documents, contrats, protection des données, facturation et modalités de paiement à valider pour chaque marché.
8. Recette complète de chaque pilote avant une décision explicite d’ouverture.

## État réel

- Sénégal : périmètre commercial confirmé par l’utilisateur ; cette décision n’efface pas les réserves générales de recette ni le mode paiement de test.
- Côte d’Ivoire et France : préparation cadrée, **non ouvertes** ; parcours étrangers **NOT TESTED**.
- Langue réellement présente : français. Traductions complètes supplémentaires, RTL et Wolof validé : **NOT TESTED**.
- Devise de transaction actuellement traitée : XOF. EUR et autres devises : **NOT TESTED**.
- Taux de change : aucun fournisseur ajouté ; aucune conversion fictive.
- Nouveaux paiements réels : aucun.

L’internationalisation complète reste un chantier à réaliser. Aucune page, annonce ou test de cette livraison ne doit la présenter comme terminée.
