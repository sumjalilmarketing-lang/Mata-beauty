# Confirmation et récupération des comptes — correctif

## Problème et comportement corrigé

L’interface renvoyait une inscription sans session vers la connexion et orientait les liens expirés vers « Mot de passe oublié ». Elle ne proposait pas de renvoyer la confirmation d’inscription. Le retour serveur n’acceptait pas le type `email` de la documentation Supabase, bien qu’il acceptât déjà `signup` utilisé par le modèle actuel du test.

Le formulaire possède maintenant un parcours « Renvoyer la confirmation », sans demander le mot de passe. Après inscription sans session, il conserve l’adresse et efface les deux champs de mot de passe. Le renvoi appelle uniquement `auth.resend` avec le type `signup` et le retour `/auth/confirm`. Le message reste générique et ne révèle pas l’existence d’un compte. Les erreurs de destinataire indisponible et d’envoi sont affichées sans détails du fournisseur.

Le retour serveur accepte `email` et `signup`, toujours après vérification du jeton par Supabase et vérification du profil. Les liens expirés et les types non pris en charge restent refusés. Aucun compte n’est confirmé par SQL, aucune attribution de rôle, aucune modification de RLS ou de MFA et aucune nouvelle clé privilégiée.

## Diagnostic des environnements

- Test international : confirmation d’adresse activée, service e-mail intégré affiché par Supabase, Google désactivé. Sur la fenêtre de journaux de 24 heures examinée : 23 erreurs `invalid_credentials`, quatre limitations d’envoi et deux liens expirés. Ces nombres agrégés n’attribuent pas une cause à chaque utilisateur.
- Le propriétaire fictif du dossier de recette utilise une adresse de démonstration sans boîte de réception contrôlée. Une récupération e-mail de ce compte ne peut pas constituer une procédure de recette reproductible. Le formulaire préparé précédemment n’en résout pas le mot de passe inconnu.
- Production : le réglage SMTP personnalisé est activé, vérifié en lecture seule ; aucun réglage, secret, modèle ou destinataire modifié. Ce constat ne certifie pas la délivrabilité.
- Le défaut de type `email` est un problème de compatibilité corrigé ; le modèle actuel du test utilise déjà `signup`. Il n’est pas présenté comme la cause des erreurs d’identifiants observées.

## Validation avant publication

- National : 209 tests dans 41 fichiers, 26 contrôles structurels, TypeScript et build PASS ; lint zéro erreur et huit avertissements de navigation préexistants.
- International : 252 tests dans 46 fichiers, 26 contrôles structurels, TypeScript et build PASS ; lint zéro erreur et huit avertissements préexistants.
- Sept cas de régression ajoutés : confirmations `email` et `signup`, trois types refusés, lien `email` expiré et messages de livraison sans fuite de détails.
- Aucun e-mail réel envoyé par ces tests. Aucun paiement réel ni migration Production.

## Limite de la clôture

Le correctif améliore le parcours d’authentification ; il ne recrée pas un mot de passe perdu et ne rend pas une adresse fictive joignable. La recette normale de Studio Test Paris, les quatre espaces avec comptes distincts, la concurrence réelle et le candidat Production international restent ouverts. Le GO international complet n’est pas délivré par ce correctif.

## Publication et contrôle sur le site

Code national final `67358b2d09d0d9feefdb6cd57e77f717b003143c`, déploiement Production `dpl_A8bjqtpzfUN83wvXe3V8ZbSjFjTS`, READY, mata-beauty.com attribué sans erreur. Build distant : environ 24 secondes. Le dernier ajout efface aussi un ancien message de succès quand une nouvelle soumission échoue à la validation du formulaire.

Après rechargement de mata-beauty.com dans Chrome : le parcours de renvoi est présent, la saisie d’une adresse volontairement invalide affiche uniquement l’erreur de validation, et le parcours distinct « Mot de passe oublié » est accessible. Une réponse générique du parcours de renvoi a été observée ; elle ne prouve pas la réception d’un e-mail. Aucun test de délivrabilité n’est annoncé comme réussi.

La session Super Admin Production accède après ce déploiement à « Rôles et permissions » et à la matrice serveur des sept rôles. Aucune attribution ni modification de compte effectuée. Aucun log error/fatal retourné dans la fenêtre initiale de quinze minutes examinée sur ce déploiement.

Code international final `6feaa7bd7836c3b388e5942e658f9684585a7807`, Preview isolée `dpl_7JSQnvsRFw7W546P6mSjac2NJHdm` READY. Configuration de test conservée ; aucune promotion de cette Preview sur la Production. L’accès Super Admin au test est encore fonctionnel. La tentative depuis le formulaire du propriétaire fictif s’arrête sur « Saisissez votre mot de passe » : aucun mot de passe n’y est renseigné. Il n’a été ni lu, ni deviné, ni remplacé.

Le second contrôle complet conserve 209 tests nationaux et 252 internationaux, lint sans erreur, TypeScript et builds PASS. Le build national a nécessité un cache généré neuf après une erreur locale ENOTEMPTY ; le build propre et le build distant passent. Les onze migrations internationales et leurs empreintes sont inchangées et ne sont pas appliquées en Production.


## Solution de transport e-mail préparée

Une boîte SMTP de capture Ethereal dédiée a été créée pour la recette. Ce service capture les messages envoyés par le SMTP configuré et ne les livre pas aux destinataires. Il permet donc d’utiliser des adresses fictives pour vérifier les confirmations et récupérations normales, sans désactiver la vérification des comptes. Documentation : https://ethereal.email/faq et https://ethereal.email/help ; Supabase recommande le principe d’un SMTP de test : https://supabase.com/kb/troubleshooting/not-receiving-auth-emails-from-the-supabase-project-OFSNzw.

Le formulaire SMTP du seul projet mata-beauty-global-test est préparé avec le serveur smtp.ethereal.email, port 587/STARTTLS et un expéditeur explicitement marqué RECETTE. La boîte et le formulaire sont conservés dans Chrome. Aucun secret n’a été lu ni publié ; le champ Password du formulaire Supabase reste vide et Save changes n’a pas été cliqué. Le service intégré reste donc la configuration enregistrée tant que la saisie privée et la validation ne sont pas terminées. Le SMTP de Production n’a pas été modifié.

La validation doit porter uniquement sur les e-mails d’authentification du test vers cette nouvelle boîte. Après activation, vérifier un véritable message capturé et la validité du lien avant d’annoncer le transport opérationnel. Puis récupérer le propriétaire fictif par le parcours normal ou créer de nouvelles identités fictives vérifiées, soumettre le dossier et terminer la recette. Ni le raccordement SMTP ni la réception d’un lien ne constituent encore le GO international. Ne jamais publier les URL privées de messages, qui contiennent des informations d’accès, ni utiliser cette boîte éphémère pour les utilisateurs de Production.


## SMTP et connexion du professionnel effectivement validés

Après l’enregistrement effectué par l’opérateur, le SMTP personnalisé du seul projet mata-beauty-global-test a été vérifié comme activé dans une nouvelle page de configuration, sans modification non enregistrée. Le premier e-mail de connexion a été capturé dans la boîte de recette. Son lien a été suivi normalement après vérification de la destination Supabase du projet de test et de l’origine de retour autorisée. Le propriétaire fictif de Studio Test Paris a atteint son profil puis sa candidature professionnelle dans Chrome. Le blocage d’accès lié au mot de passe indisponible est donc levé, sans changement de mot de passe, activation SQL forcée ou attribution de rôle.

Le formulaire propose « Recevoir un lien de connexion ». Il appelle signInWithOtp avec shouldCreateUser:false : comptes existants uniquement, aucune inscription implicite, aucun droit accordé par le formulaire. Les refus de compte absent restent génériques et les échecs de livraison ou limitations sont conservés. Les contrôles MFA des accès internes restent en place. Documentation : https://supabase.com/docs/guides/auth/auth-email-passwordless.

Un défaut reproductible a aussi été corrigé : le profil à 100 % cochait « Justificatifs » malgré 0/4 documents. Le compteur et l’état du dossier tiennent maintenant compte des quatre types distincts et de leur version la plus récente. Une pièce rejetée doit être remplacée ; une ancienne version acceptée ne la masque pas. Le bouton d’envoi reste désactivé tant que les pièces ne sont pas complètes. Les contrôles serveur de soumission et d’approbation restent inchangés.

Validation : 217 tests nationaux dans 42 fichiers et 260 tests internationaux dans 47 fichiers PASS ; TypeScript, lint sans erreur et builds PASS, avec les huit avertissements de navigation préexistants. Code national b1370e96b5dc05b05e8bac052d49572c168de262, déploiement Production dpl_5VhSM2myj4MfvaS533mZhvHCfvgw READY, mata-beauty.com attribué sans erreur ; aucun log error/fatal dans la fenêtre initiale de quinze minutes examinée. Le formulaire de connexion par lien et son refus d’adresse invalide ont été observés sur le domaine public sans envoyer d’e-mail de recette depuis Production. La réception et la connexion complètes ont été testées dans l’environnement isolé.

La connexion réelle du professionnel utilise le code international a0e63bd83487d32fb1da0e81eae3ebef4cb0943a, Preview dpl_84Nh6VUp2D5DPoCorKXQmsQaKxvA READY. Le correctif international supplémentaire du compteur, code 4e26025378f440b69dcf8ec7f4c3fb1b42fe5d66, est demandé dans la Preview isolée dpl_BpXmtwA3y8RTM6WV3KB7PHkT31vU ; état encore QUEUED au dernier contrôle. Les deux tentatives d’annulation de builds Preview inutilisés ont été refusées par le contrôle automatique ; aucune annulation ni réglage de file de build effectué.

Quatre PDF clairement marqués TEST, sans valeur officielle ni données personnelles réelles, sont versionnés dans tests/fixtures/onboarding. Le dossier reste en brouillon à 0/4 : le sélecteur de fichier a refusé l’envoi parce que l’extension Chrome n’a pas l’autorisation « Allow access to file URLs ». Cette permission locale doit être activée par l’opérateur dans chrome://extensions, Details de l’extension ChatGPT. Le refus n’a pas été contourné. Les documents ne sont pas annoncés comme déposés, soumis ou approuvés.

Aucune migration, donnée, configuration SMTP ou attribution de rôle de Supabase Production modifiée. Aucun paiement réel ni intervention sur YOBALELMA. Le GO international complet reste conditionné au dépôt et à l’approbation normaux du dossier, aux parcours multi-comptes et au contrôle de concurrence encore ouverts. Les onze migrations autorisées sont inchangées et ne sont pas appliquées en Production.
