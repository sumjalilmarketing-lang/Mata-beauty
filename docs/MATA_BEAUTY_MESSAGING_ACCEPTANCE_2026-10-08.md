# Recette messagerie — 8 octobre 2026

État : correction validée en Preview/QA ; publication et contrôle du domaine en cours.

Code applicatif : `b14221f`. Preview testée : https://mata-beauty-gtjcb51ph-africrm.vercel.app (backend QA isolé).

## Défaut reproduit et correction

**MSG-01 — message reçu illisible.** L'ancien `.message-bubble` imposait un fond blanc sans définir sa couleur de texte. Dans les panneaux sombres des espaces Client/Professionnel, le texte clair hérité devenait presque invisible. L'horodatage était également trop petit (8 px).

Correction : composant `MessageBubble` partagé entre réservations et support, couples fond/texte explicites, bulles reçues neutres, bulles envoyées rose profond, corps 15 px et horaires 12 px. Les messages envoyés restent à droite, reçus à gauche. Le support suit les thèmes clair et sombre ; les espaces Client/Pro conservent leur thème sombre.

**MSG-02 — contexte incomplet.** L'en-tête ne montrait que la prestation. Il affiche désormais le nom public du correspondant, la prestation, la date et le statut réel du rendez-vous. Une route serveur contrôle la session, la visibilité RLS de la réservation puis l'appartenance Client/Pro avant de renvoyer uniquement le nom et le contexte. Aucune ouverture de la politique de lecture des profils.

**MSG-03 — protection contre les doubles clics.** Un verrou synchrone empêche deux soumissions avant le prochain rendu React. Les erreurs sont traitées et le brouillon conservé. Cela ne constitue pas une garantie globale d'idempotence après une réponse réseau ambiguë ou une nouvelle saisie volontaire.

Le défilement automatique reste dans l'historique et ne déplace plus toute la page ; le chargement des anciens messages conserve la position. Un changement de rendez-vous remonte un composant distinct pour éviter de garder le contexte précédent. Le champ et son placeholder possèdent leurs propres couleurs ; la navigation mobile se masque pendant la saisie pour libérer de l'espace.

## Actions réellement exécutées

| Zone | Action | Résultat observé | Environnement | Statut |
|---|---|---|---|---|
| Avant correction | Client envoie, Pro lit et répond | Échange fonctionnel ; bulle reçue presque illisible, capture conservée | Ancienne Preview/QA | FAIL visuel reproduit puis corrigé |
| Messages | Client envoie → Pro reçoit → Pro répond → Client reçoit | Textes réels retrouvés des deux côtés | Nouvelle Preview/QA, Chromium | PASS |
| Notifications | Pro puis Client ouvrent une notification « Nouveau message » | Bonne conversation ouverte | Preview/QA | PASS |
| Lecture | Ouvrir le message chez le destinataire | Accusé « Lu » affiché chez l'expéditeur | Preview/QA | PASS |
| Agenda Pro | Agenda → Messages sur le rendez-vous de test | Même historique, nom Client et contexte corrects | Preview/QA | PASS |
| Lisibilité | Couleurs calculées dans le navigateur | Reçu 11,97:1 ; envoyé 9,56:1 ; horaires 8,34:1 / 8,08:1 | Preview/QA | PASS |
| Double clic | Double clic réel sur Envoyer puis lecture en base | Une seule ligne enregistrée pour le texte | Preview/QA | PASS |
| Erreur serveur | Réponse POST 503 injectée, puis réessai | Erreur visible, saisie conservée, réception après réessai | Preview/QA, Chromium | PASS |
| Historique | Message multiligne long puis actualisation | Contenu intact, retours à la ligne conservés | Preview/QA | PASS |
| Responsive | Largeurs 393, 412, 768, 1366 px | Pas de débordement horizontal, Envoyer accessible | Preview/QA, Chromium | PASS |
| Clavier simulé | Fenêtre réduite à 393 × 380 px, champ focalisé | Brouillon conservé et bouton visible après défilement | Preview/QA | PASS — simulation uniquement |
| Confidentialité réservation | Autre Client et autre Pro : lire, envoyer, s'ajouter, ouvrir le contexte | Lecture vide, écritures refusées, contexte HTTP 404 | API réelle QA | PASS |
| Support | Client crée une demande et écrit ; équipe avec MFA lit/répond ; Client actualise | Messages reçus et envoyés visibles, thèmes clair/sombre | Preview/QA | PASS |
| Support privé | Autre Pro lit/répond ; Client tente de voir une note interne | Lecture vide, réponse refusée, note interne absente côté Client | Preview/QA | PASS |
| JavaScript | Parcours réservation complet | Aucune erreur `pageerror` | Preview/QA, Chromium | PASS |
| Qualité locale | lint, typecheck, tests, build | 105 tests passent ; contrôles et build réussis | Local | PASS |
| Safari/WebKit | Même scénario réservation, sécurité, réseau et responsive | Scénario complet réussi (1,5 minute) | Navigateur WebKit automatisé | PASS — pas un iPhone physique |
| Domaine officiel | Version et smoke test public après publication | En attente du déploiement | Production | NOT TESTED |
| Échange réel production | Deux participants sur un même rendez-vous | Utilisateur disponible pour le contrôle sur ses appareils | Production | NOT TESTED |
| Matériel réel | iPhone Safari/Chrome, Android Chrome, tablette, clavier natif | L'émulation ne constitue pas un test matériel | Matériel physique | NOT TESTED |

## Sécurité et limites

- Comptes et écritures de recette créés uniquement dans le projet QA `kazlvtxkbsdhbfvtqqdp`, puis supprimés. Le compte interne QA utilise MFA. Aucun compte réel n'a reçu de nouveau rôle.
- Vérification en lecture seule du projet production `qjdwxdbvrxedyfolnpol` : RLS active sur `messages`, `conversation_members` et `support_messages` ; insertion d'un message liée à `auth.uid()` et à l'appartenance à la conversation.
- La lecture de réservation utilise `has_conversation_access` : participant, ou agent support ayant une autorisation spécifique non révoquée et non expirée sur cette conversation, plus `support.manage`. Cette exception support préexistante est conservée, pas élargie.
- Les notes internes du support sont exclues pour le demandeur. La nouvelle route de contexte est encore plus restrictive : deux participants uniquement, sans e-mail, téléphone ou adresse.
- Aucune migration ni modification de politique RLS dans ce correctif. Aucun changement aux paiements, à OAuth, au feed vidéo ou aux marchés ouverts.
- Le navigateur utilisateur fourni à Codex a échoué deux fois à l'initialisation (`trusted Node process exited unexpectedly`). Les contrôles authentifiés de production ne sont donc pas déclarés PASS sur la seule base de la QA.
- Instrumentation WebKit : le service worker est bloqué uniquement dans le contexte de test afin que la panne 503 soit réellement interceptée. Une tentative antérieure a envoyé normalement le message faute d'interception ; elle n'a pas été présentée comme un test de panne réussi. WebKit peut également signaler une requête `conversation_members` annulée par un rechargement forcé (statut réseau -1, aucun HTTP 403). Le test conserve ces annulations dans une pièce jointe séparée et continue d'échouer sur toute autre erreur JavaScript. L'historique après rechargement est vérifié.
- La conservation visuelle de position lors du chargement de plus de 50 messages est corrigée dans le code mais son scénario paginé n'a pas été exécuté : NOT TESTED.

## Preuves

- [Avant : Professionnel](evidence/messaging-2026-10-08/before-professional.png)
- [Après : Professionnel](evidence/messaging-2026-10-08/professional-conversation.png)
- [Après : Client](evidence/messaging-2026-10-08/client-conversation.png)
- [Agenda Professionnel](evidence/messaging-2026-10-08/professional-agenda.png)
- [Mobile 393 px](evidence/messaging-2026-10-08/conversation-393.png)
- [Tablette 768 px](evidence/messaging-2026-10-08/conversation-768.png)
- [Support clair](evidence/messaging-2026-10-08/support-light.png), [support sombre](evidence/messaging-2026-10-08/support-dark.png)

Tests reproductibles : `tests/remote/messaging-remote-ui.spec.ts` (comptes temporaires, double sens, notifications, MFA support, confidentialité, panne réseau, persistance, responsive) ; `tests/domain/conversation-context.test.ts` (5 cas de contrôle serveur inclus dans les 105 tests).
