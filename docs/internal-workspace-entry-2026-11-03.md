# Entrée des responsables dans leur espace

Les liens email vérifiés aboutissent à `/auth/workspace`. Ce point d’entrée lit uniquement la session vérifiée et les rôles actifs en base. Un responsable commercial rejoint `/commercial`, un responsable financier `/finance`, un responsable support `/support-agent`. Aucun rôle ni destination transmis dans l’URL ou les métadonnées personnelles ne confère de permission.

La création ou réinitialisation du mot de passe conserve l’étape de reconnexion, mais le bouton final mène à ce même point d’entrée. La connexion ordinaire d’un compte interne depuis l’accueil ou le profil général utilise également cet aiguillage ; les destinations explicites de réservation et autres parcours demandés sont conservées.

Si le MFA n’est pas encore satisfait, la vérification commune est présentée avant l’espace. Après validation, le mécanisme existant ouvre la branche attribuée, sans afficher les modules Super Admin au responsable. Un lien direct permanent est aussi disponible : `/commercial` ; sans session il demande la connexion et conserve cette destination.

Vérification Production en lecture seule : le responsable signalé possède un rôle `commercial_manager` actif, une équipe commerciale active et les permissions `teams.manage`, `crm.manage`, `commercial.cases`. Son compte est actif et non suspendu. Aucun second facteur vérifié n’est encore enregistré au moment du contrôle. Aucun rôle, invitation ou facteur de ce compte n’a été modifié ; aucun email n’a été envoyé.

Validation : 430 tests unitaires, dont 11 nouveaux cas d’aiguillage ; 12 scénarios navigateur bureau/mobile des équipes, incluant l’entrée par rôle vers le CRM et les équipes. Les identités et le MFA de cette recette sont simulés localement. Le MFA réel du destinataire devra être configuré par lui ; aucune connexion en son nom n’a été effectuée.

Cette correction ne change ni les migrations, ni les réservations, ni les paiements, ni les périmètres des responsables. Retour arrière : restaurer le déploiement frontend précédent `dpl_6P2WjzrStgANArx6ccwcggSRiS8n`.
