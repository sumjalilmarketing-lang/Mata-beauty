# Suspension temporaire individuelle du MFA commercial

À la demande explicite du propriétaire, une suspension individuelle peut être inscrite sur l’appartenance d’un responsable commercial. La migration seule ne suspend aucun compte. Les anciens indicateurs `requires_mfa=false` restent sans effet.

La suspension exige une échéance finie future, un motif, un compte actif non suspendu, une équipe commerciale active et le seul rôle actif `commercial_manager`. Un autre rôle actif, la vérification d’un facteur ou l’échéance rétablit automatiquement le MFA. Les agents, la finance, le support et le Super Admin restent soumis au MFA. Les permissions commerciales et l’isolation des équipes ne changent pas.

Les colonnes ne sont modifiables ni par un formulaire ni par une nouvelle API. Les politiques RLS existantes de `admin_user_roles` n’autorisent aucune mise à jour directe par le titulaire. Aucune activation automatique d’invitation ni élévation de rôle n’est ajoutée.

La demande du 3 novembre concerne uniquement Henri Jean Baptiste Gomis, dont l’identité et le rôle commercial actif ont été vérifiés en Production. L’activation opérationnelle doit cibler cette seule appartenance, dans une transaction qui exige exactement une ligne, pour 24 heures. Aucun identifiant personnel n’est inscrit dans la migration.

Révocation anticipée : mettre `mfa_suspended_until` à NULL sur cette appartenance. Le MFA est alors de nouveau requis pour les requêtes internes suivantes. Conserver les colonnes et la fonction ne donne aucun accès lorsque l’échéance est absente, passée ou révoquée. Ne pas supprimer les données commerciales pour revenir en arrière.

Validation : 15 nouveaux scénarios PostgreSQL locaux (périmètre individuel, autres rôles, expiration, retrait, facteur vérifié, cumul de rôles, compte/équipe désactivés, échéance infinie, motif absent, AAL2 et refus de modification par le titulaire). Suite complète : 445 tests unitaires réussis ; TypeScript, lint sans erreur et compilation contrôlés avant publication. Aucune connexion réelle sous l’identité du destinataire n’est réalisée par ces tests.
