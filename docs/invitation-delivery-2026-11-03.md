# Invitations salon — diagnostic du 3 novembre 2026

## Constats vérifiés

- Production : une invitation Gmail acceptée ; une invitation Outlook encore en attente, avec `sent_at` renseigné. Ce champ prouve l'acceptation initiale par l'API d'envoi, pas la réception du destinataire.
- L'envoi utilisait Resend mais ne conservait pas son identifiant de message. Le motif de cet ancien envoi n’était pas disponible depuis ces seules données applicatives ; il a ensuite été retrouvé directement via Resend.
- DNS public interrogé : SPF présent sur send.mata-beauty.com, clé DKIM présente sur resend._domainkey.mata-beauty.com ; aucun TXT DMARC trouvé sur _dmarc.mata-beauty.com. Cela ne démontre pas que l'absence de DMARC est la cause de l'incident. Aucun DNS modifié.
- Logs Vercel : le message ancien est hors de la fenêtre de rétention accessible. Aucun résultat dans la fenêtre récente interrogée ; cela ne prouve pas l'absence d'un incident ancien.

## Motif désormais vérifié directement chez Resend

L’envoi Outlook correspondant à la capture est `bounced`, type `Permanent`, sous-type `General`. Microsoft a répondu : `550 5.5.0 Requested action not taken: mailbox unavailable (S2017062302)`.
Cela établit que la boîte était indisponible pour cet envoi ; cela ne prouve ni une faute de frappe ni un blocage général d’Outlook/Hotmail. Il faut confirmer l’adresse et l’accès à la boîte avec son titulaire avant une nouvelle invitation. Le propriétaire a ensuite confirmé que le titulaire accède à la boîte. Le blocage d’origine bounce a été retiré uniquement pour cette adresse ; une seconde lecture Resend a confirmé son absence (404). Aucun nouvel email n’a été envoyé.

La liste récente Resend contient aussi un autre envoi Outlook livré : elle ne démontre donc pas un blocage général du domaine. L’adresse concernée a été placée en suppression après son rejet permanent ; ce blocage a ensuite été levé après la confirmation du titulaire rapportée par le propriétaire.

Le domaine Resend est vérifié, SPF et DKIM sont vérifiés, et le suivi des ouvertures/liens est désactivé. L’absence de DMARC ne doit pas être annoncée comme la cause de ce rejet précis.

## Correction développée

- Contrôle de suppression avant tout nouvel envoi, après vérification du propriétaire : une adresse rejetée ou ayant signalé un message ne crée plus une nouvelle invitation affichée à tort comme envoyée.
- Conservation du reçu Resend dans les événements privés existants via une nouvelle fonction, réservée au propriétaire actif du salon.
- Le serveur consulte le statut d'un message seulement après les contrôles RPC du propriétaire. Il ne retourne ni destinataire, ni contenu, ni clé API.
- Bouton « Vérifier la livraison » pour les invitations en attente : distingue prise en charge, acceptation du serveur destinataire, retard, rejet et suppression côté prestataire.
- Un échec de conservation du reçu ne révoque pas une invitation déjà envoyée.
- Aucune invitation n'est envoyée par les tests. Aucune invitation réelle n'a été révoquée ou acceptée durant le diagnostic.
- Migration appliquée uniquement à mata-beauty-global-test. Vérifié : anon ne peut pas exécuter la fonction ; authenticated ne peut pas modifier directement la table privée des événements.

## Reste nécessaire pour conclure sur Outlook/Hotmail

1. Confirmer avec le titulaire l’adresse exacte et l’accès à la boîte. Le rejet permanent et la suppression sont désormais vérifiés chez Resend. Après vérification de la boîte seulement, décider d’une nouvelle invitation et du traitement de la suppression ; ne jamais contourner un signalement.
2. Confirmer dans Resend le statut du domaine, l'alignement SPF/DKIM et le suivi des liens. Le fragment du lien contient un secret : ne jamais le copier dans les logs ou un ticket.
3. Si nécessaire, publier un enregistrement DMARC adapté après examen du domaine et de ses autres expéditeurs. Proposition de départ à examiner, sans modifier les MX/SPF/DKIM : nom `_dmarc`, TXT `v=DMARC1; p=none; adkim=r; aspf=r`. Une politique p=none ne garantit ni la réception ni une boîte principale.
4. La clé Resend utilisée par le serveur doit permettre la lecture du statut pour le nouveau bouton ; sinon celui-ci signale honnêtement l'indisponibilité. Aucun élargissement des permissions de clé réalisé.
5. Sur une recette complète, envoyer avec autorisation explicite vers des comptes Gmail, Outlook et Hotmail contrôlés. Vérifier réception, dossier indésirable, lien après authentification, adresse différente refusée, rôle attribué exactement et expiration/usage unique. Ne pas confondre test simulé et remise réelle.
6. Production : après validation, appliquer la migration avant le déploiement applicatif. Pas de réécriture des invitations existantes. Les invitations sans reçu afficheront un suivi indisponible.

Références : https://resend.com/features/webhooks ; https://resend.com/changelog/message-id-for-sent-emails ; https://resend.com/blog/open-and-click-tracking
