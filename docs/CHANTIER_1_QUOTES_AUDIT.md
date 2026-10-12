# Chantier 1 — audit devis, réservation et paiement

Audit en lecture seule du 11 octobre 2026. Source : code local et catalogue PostgreSQL de production `qjdwxdbvrxedyfolnpol`. Aucune migration ni donnée métier modifiée. Les constats ci-dessous sont des inspections, pas des parcours navigateur PASS.

## Existant réutilisable

| Zone | État constaté | Point de réutilisation |
|---|---|---|
| Devis personnalisé | Aucun composant, table ou RPC métier devis. Aucun nom de table contenant quote/devis en production. | Ajouter le document commercial au système de conversation existant. |
| Calcul catalogue | `calculate_service_quote(uuid,uuid[],uuid,text)` en production calcule prestation publiée, options valides et obligatoires, promotion éligible, mode domicile, acompte, devise et durée. | Canonicalisation serveur des options, lieu et devise ; branche catalogue ordinaire conservée. |
| Réservation | INSERT depuis `app/mata-beauty-app.tsx:538` ; contrat imposé par triggers. Montant/devise/durée du client sont écrasés serveur. Statut initial pending. | Même table bookings, mêmes contrôles et mêmes notifications. |
| Équipe | Qualification, horaires, absences, fermeture salon, collaborateur actif, professionnel approuvé, tampon et exclusion de chevauchement. | `booking_private.can_assign(service,employee,starts,ends,ignore_booking)` accepte déjà la durée effective. |
| Concurrence | Verrou transactionnel par professionnel ; détection doublon client/prestation/créneau ; exclusion ressource et période. | Conserver ces triggers pour la conversion d'un devis. |
| Messagerie | conversations, conversation_members, messages, nonce client ; RPC d'envoi et suivi lecture ; historique des réservations. | Cartes devis dans messages et référence vers un devis, pas deuxième messagerie. |
| Commissions | commission_rules + resolve_commission_breakdown_at + trigger apply_payment_commission. Priorité professionnel, catégorie, défaut ; taux effectif figé à création du paiement. | Les commissions sont prélevées sur la part professionnel ; ne pas les ajouter une deuxième fois au prix client. |
| Paiement | Mock par défaut ; seule intégration admise PayDunya sandbox. Mode réel refusé explicitement. | Conserver paiement sur place / aucun débit ; aucun devis accepté ne devient paid. |
| Administration/MFA | is_admin et has_admin_permission exigent affectation active, rôle actif, compte non suspendu et aal2 via admin_mfa_required. | Aucun nouveau accès admin général aux devis privés ni contournement MFA. |

## Points précis à préserver

1. La définition réelle de `enforce_booking_contract` en production est plus riche que `20260804160000_full_audit_security_fixes.sql`. Elle intègre les options, les promotions et la distance domicile. La migration locale ancienne n'est pas une base suffisante pour la remplacer.
2. Copie exacte des 18 fonctions utiles conservée dans `work/chantier-1/audit/production-booking-pricing-functions.sql`. Ce fichier ignoré est une preuve, pas une migration à exécuter.
3. L'ordre effectif avant INSERT est : verrou ressource → doublon → activation équipe → contrat prix/durée → attribution équipe. Une surcharge de montant/durée après attribution serait incorrecte.
4. Le contrat de production vérifie actuellement les créneaux avec la durée catalogue avant de calculer les options. Le calcul indépendant utilise la durée de base ; le calcul équipe inclut les options obligatoires. Un devis de durée personnalisée exige une disponibilité évaluée avec sa durée exacte dès l'affichage et de nouveau à l'INSERT.
5. `can_assign` sait vérifier la période effective et le tampon. Le moteur indépendant doit recevoir une durée effective validée, tout en conservant les règles de disponibilités, exceptions et fermetures.
6. Les champs contractuels de bookings sont immuables via `validate_booking_update`. La future référence devis devra l'être aussi. Ne jamais modifier temporairement le catalogue pour réserver au prix d'un devis.
7. `BookingModal`, son bouton de confirmation et `BookingSuccess` affichent actuellement `service.price_amount` et la durée catalogue. Le chemin devis devra afficher le récapitulatif retourné par le serveur et les valeurs persistées, sans simuler ces valeurs en modifiant un objet catalogue.
8. Toutes les prestations actuelles utilisent XOF ; profils actuels SN. Aucune configuration marché/devise dédiée dans le catalogue public. Le seul marché ouvert confirmé reste Sénégal ; ne pas annoncer France ou Côte d'Ivoire ouvertes via ce chantier.
9. Les montants applicatifs actuels sont des entiers XOF. La conversion vers devises à décimales n'est pas opérationnelle dans le paiement ; ne pas ouvrir EUR en copiant le même calcul.
10. `paymentCapabilities` (`lib/payments/gateway.ts:47`) expose disabled/sandbox. `getPaymentGateway` (:145) refuse explicitement une production PSP. Aucun changement prévu à cette barrière.

## Réserves relevées par inspection

| Réserve | Impact | Action proposée |
|---|---|---|
| is_conversation_member ne vérifie que la présence dans conversation_members ; send_conversation_message et les politiques de lecture s'appuient dessus sans état de compte. | Risque de lecture/envoi avec JWT encore valide après suspension. Exploitation non exécutée pendant cet audit. | Test dédié QA compte suspendu/désactivé puis garde serveur commune aux messages/médias/devis. |
| Les conversations et leur liste sont centrées sur booking_id ; le trigger de création de réservation crée automatiquement une conversation. | Un parcours pré-réservation peut perdre l'historique ou créer deux conversations à la conversion. | Coordonner l'association à la conversation existante avant la conversion ; ne pas dupliquer les fils. |
| messages n'autorise que text, image, location, system. | Impossible d'insérer une carte devis/video/service proprement sans migration contrôlée. | Extension commune de message_type + référence validée côté serveur, coordonnée avec le chantier messagerie. |
| Pas de système de devis / historique de décisions. | Aucune expiration, décision ou idempotence à réutiliser telle quelle. | Tables minimales et RPC transactionnels ci-dessous. |
| Interface réservation utilise prix catalogue même si contrat serveur ajoute des options/frais. | Le futur devis afficherait un montant erroné sans récapitulatif serveur. | Utiliser les données de devis canonisées et la confirmation persistée. |

## Contrat proposé à valider avant implémentation

### Modèle minimal

- `conversation_quotes` : id, conversation_id, provider_id, client_id, provider_service_id, description, conditions, base_amount, currency, base_duration_minutes, selected_option_ids, snapshot des options/frais applicables, total_amount, duration_minutes, valid_until, status, version, nonce, sent_at, decided_at, created_at, updated_at.
- Statuts : draft, sent, accepted, declined, expired, cancelled. Le statut commercial reste distinct du paiement. Un devis envoyé est immuable ; renouveler crée un nouveau devis lié à l'ancien, pas une modification silencieuse.
- `conversation_quote_events` : devis, acteur, ancien/nouveau statut, version, date, cause. Journal append-only ; aucune écriture directe client.
- `bookings.conversation_quote_id` nullable et unique ; relation immuable. La réservation normale garde NULL et le comportement existant.
- Référence de carte message proposée : `messages.conversation_quote_id` (FK), ou référence typée équivalente décidée par le responsable messagerie. Le serveur valide toujours le lien devis/conversation/expéditeur. Un UUID dans metadata seul n'est pas une autorisation.
- RLS activée, lecture devis strictement candidat client et professionnel concernés ; un employé membre de conversation ne peut pas créer, modifier ni accepter un devis. Aucun INSERT/UPDATE/DELETE direct de devis depuis authenticated.

### API proposée au frontend

| RPC | Entrée | Sortie / règle |
|---|---|---|
| save_conversation_quote | conversation_id, optional quote_id, provider_service_id, description, conditions, proposed base price/duration, valid_until, nonce, expected_version | Devis canonique draft. Seul propriétaire professionnel approuvé/actif et participant ; destinataire client résolu serveur. Aucun client_id/provider_id arbitraire accepté. |
| send_conversation_quote | quote_id, expected_version, nonce | Devis sent + une carte message + une notification dans la même transaction. Relance idempotente. |
| respond_to_conversation_quote | quote_id, decision accept/decline, expected_version, nonce | Seul client destinataire actif ; verrou ligne, validité serveur, version attendue ; relance même décision idempotente. Événement + notification uniques. |
| cancel_conversation_quote | quote_id, expected_version, reason | Pro propriétaire, devis non consommé, journal et notification. |
| get_conversation_quote_availability | quote_id, day | Devis canonique, teamEnabled, slots avec slot_start et collaborateurs. Durée effective du devis, aucune durée fournie par le navigateur. |
| book_conversation_quote | quote_id, starts_at, optional collaborator_id, location_mode, données adresse permises, nonce | Booking persistant + récapitulatif total/devise/durée/état. Aucune entrée amount/currency/duration acceptée ; idempotence sur devis et nonce. |

Pour le formulaire devis, rendre explicite que le professionnel propose le **prix et la durée de base personnalisés**, puis afficher les options obligatoires et les frais qui composent le **total et la durée finale** avant Envoi. Le serveur reprend les options canoniques de calculate_service_quote. Aucun cumul implicite avec une promotion : la branche devis bloque promotion_id et affiche son propre prix contractuel ; la branche catalogue garde les promotions actuelles. Si l'interface souhaite saisir directement un total global, cette alternative doit être décidée avant codage pour éviter de compter deux fois les options.

### Conversion réservation

1. Authentifier le client actif ; résoudre le devis, la conversation et les acteurs côté serveur.
2. Prendre le verrou professionnel **avant** le verrou devis/booking pour rester cohérent avec le système équipe.
3. Verrouiller le devis ; vérifier accepted, validité, prestation toujours publiée/active, professionnel toujours approuvé, devise autorisée, version et absence de consommation.
4. Calculer le récapitulatif serveur : base personnalisée + options validées + frais applicables, durée de base + options. Vérifier de nouveau les frais domicile selon l'adresse finale ; exiger un récapitulatif frais final avant confirmation. Ne pas inventer de frais client : les commissions actuelles restent du côté professionnel.
5. Valider toute la période effective, pas seulement l'heure de début : disponibilités, absences, fermetures, qualification, tampon, collisions, marché actuel.
6. Insérer dans bookings via une branche explicite quote_id du contrat serveur. Garder intégralement la branche catalogue existante et les autres triggers. Aucun contournement par rôle service, variable de session éditable ou données reçues du navigateur.
7. Associer le fil de conversation existant selon le contrat commun de messagerie. Conserver notifications et agenda actuels.
8. Statut pending ; paiement sur place = aucun débit. La réponse n'affiche pas paid ni une confirmation PSP. Le pipeline paiement reste inchangé et utilise le montant persistant si un PSP validé est activé plus tard.

### Tests nécessaires avant application production

- Pro non propriétaire / client / employé refusés à la création ou modification.
- Client non destinataire refusé à la décision/conversion ; lecture devis et médias d'un tiers refusée.
- Comptes suspendus/désactivés refusés avec le même JWT ; MFA admin conservée.
- Devise non autorisée, option étrangère, promotion injectée, prix négatif/fractionnaire et durée invalide rejetés.
- Expiré non accepté/non réservé ; annulation, renouvellement, historique exact.
- Double clic et concurrence : un message, une décision, une notification et une réservation.
- Devis durée plus courte et plus longue que catalogue ; fin de journée ; options obligatoires ; collaborateur et indépendant ; buffer ; deux clients même ressource.
- Prix navigateur falsifié ignoré/rejeté ; tarif catalogue changé après envoi ne modifie pas silencieusement le devis contractuel.
- Frais domicile calculés sur l'adresse validée ; pas de double commission.
- On-site et PSP disabled : aucune ligne paid, aucun succès financier simulé.
- Réservation catalogue, équipe et historique existants inchangés.

## Statut de cette phase

**AUDIT TERMINÉ — PROPOSITION VALIDÉE PAR LE RESPONSABLE DU CHANTIER.**

Après cette phase d'inspection, l'implémentation locale a été autorisée. Migration préparée : `20261011101008_conversation_quotes_and_booking.sql` ; aucune application cloud effectuée par cet agent.

Route finale de réservation : `/quotes/[id]`, protégée par session serveur. RPC complémentaires : `get_conversation_quote`, `preview_conversation_quote_booking` puis `book_conversation_quote` avec `target_expected_total`. La conversion retourne `payment_status: not_initiated`, conserve le statut de réservation et ne crée aucun paiement.

Validation locale : lint ciblé PASS, typecheck PASS, 5 tests de contrat de données PASS. Scripts API QA préparés : `scripts/verify-conversation-quotes.mjs` et `scripts/verify-conversation-security.mjs`. Parcours SQL et navigateur : **NOT TESTED à ce stade**, en attente de l'application QA par le responsable.

### Compatibilité et frais contrôlés avant recette QA

La QA restaurée ne possède pas encore `service_options`, les colonnes commerciales/géographiques récentes, ni la liste historique `list_my_booking_conversations` ou la synchronisation des employés dans les conversations. La migration additive `20261011102400_quote_catalog_compatibility.sql` apporte uniquement les champs nécessaires aux options obligatoires, au statut/visuel catalogue et aux frais de déplacement, plus le calcul géographique exact lu en production. Les objets déjà présents restent inchangés. Les politiques du nouveau catalogue d'options limitent l'écriture au professionnel propriétaire actif. Aucune fonction de liste historique fictive n'est créée : le contrôle correspondant reste `NOT TESTED` lorsque la QA ne possède pas ce module.

Le terme « frais de service » a été rapproché du contrat existant : `resolve_commission_breakdown_at` calcule une commission prélevée sur le montant brut professionnel, et `apply_payment_commission` la comptabilise lors de la création d'un paiement. Il n'existe pas de supplément client distinct à ajouter arbitrairement. Le devis conserve les options obligatoires ; le récapitulatif ajoute le forfait de déplacement figé et les frais kilométriques configurés selon l'adresse réelle. La conversion ne crée aucune transaction et ne présente aucun paiement comme effectué. Le moteur de commission existant reste intact.

Les scripts préparés couvrent les falsifications de carte utilisant un vrai devis dans une autre conversation, les changements de destinataire, l'injection d'une promotion, l'immuabilité de la référence de devis, la RLS des options et les frais géographiques. Ils ne constituent pas des PASS tant que l'exécution n'est pas terminée. Au dernier contrôle de préparation, la QA avait repris le statut `COMING_UP` ; aucune relance de migration n'est faite sans vérifier d'abord l'issue de la précédente tentative.

