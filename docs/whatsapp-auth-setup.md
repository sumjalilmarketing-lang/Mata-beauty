# Inscription et connexion par WhatsApp, directement avec Meta

État : raccordement préparé, désactivé par défaut. Aucun compte Meta ni expéditeur réel n’est fourni dans le dépôt. Les tests simulent l’envoi ; ils ne prouvent pas la réception sur un téléphone.

## Configuration à effectuer dans les consoles des services

1. Connecter un compte WhatsApp Business Platform à Meta et enregistrer son numéro expéditeur. Faire approuver un modèle **Authentication** avec bouton **Copy code**, et sa langue.
2. Configurer dans Vercel les variables privées présentes dans `.env.example` : jeton Meta disposant du droit d’envoi, ID du numéro, nom/langue du modèle, version Graph API actuellement prise en charge. Ne jamais envoyer ces secrets dans une conversation ni les enregistrer dans Git.
3. Dans Supabase Auth, configurer un **Send SMS Hook HTTP** vers `https://mata-beauty.com/api/auth/whatsapp-hook`. Copier le secret de signature généré dans la variable privée `SUPABASE_SEND_SMS_HOOK_SECRET`. Ce hook remplace le transport SMS par WhatsApp ; Supabase continue de créer et vérifier les codes.
4. Activer la connexion par téléphone dans Supabase. Vérifier le délai et les limites de demandes de codes ; conserver l’autoconfirmation désactivée. Configurer le modèle Meta pour une expiration compatible avec celle du code Supabase.
5. Tester d’abord en recette avec un numéro autorisé. Passer `WHATSAPP_AUTH_ENABLED=true` seulement lorsque le hook, l’expéditeur et le modèle sont configurés. La page expose uniquement la disponibilité publique, jamais les identifiants.
6. Vérifier un vrai code reçu, son expiration, son usage unique, un numéro invalide, les limites de renvoi et l’absence d’accès avant validation. Tester inscription client puis demande professionnelle, qui doit rester soumise à validation documentaire.
7. Activer la production après cet essai réel. Aucun SMS de repli ni Twilio n’est utilisé par ce raccordement. Les messages d’authentification Meta sont facturables.

L’email et Google restent disponibles. Aucune fusion automatique de comptes email et téléphone n’est effectuée. Les invitations collaborateur partagées manuellement sur WhatsApp restent indépendantes de l’envoi automatique de codes.

Références :
- https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
- https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
- https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/copy-code-button-authentication-templates
- https://whatsappbusiness.com/products/platform-pricing/
