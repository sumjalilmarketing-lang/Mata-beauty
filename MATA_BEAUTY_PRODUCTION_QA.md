# MATA Beauty — audit de production en cours

Date : 5 octobre 2026. Domaine confirmé explicitement par le propriétaire : **https://mata-beauty.com/**. La mention initiale `matasbeauty.com` était incorrecte ; aucune modification de ses DNS n'a été effectuée.

## État de validation

**Audit incomplet ; ouverture au grand public non validée.** Aucun déploiement de production effectué pendant cet audit à ce stade.

Production au début de l'audit : `dpl_D2M73dHwwTLtc34QzPHcotooEpSS`, `mata-beauty-p48ihaevn-africrm.vercel.app`, Vercel READY. Le champ Git SHA interrogé est absent ; ce déploiement ne peut pas être assimilé au dernier commit. Son interface contient encore l'ancienne navigation et le splash.

Preview de référence : https://mata-beauty-cdcgpyt24-africrm.vercel.app/ (`dpl_2frcJJCJ1of23Jhnm3Z5iPKiPvYf`, code applicatif `b3f5962`). Voir les réserves du rapport `MATA_BEAUTY_ULTRA_SIMPLE_FINAL_ACCEPTANCE.md` : les anciens résultats ne prouvent pas une validation intégrale de production.

| Zone | Action testée | Résultat attendu | Résultat observé | Statut | Correction |
|---|---|---|---|---|---|
| Production | GET HTTPS domaine principal | Application accessible | HTTP 200, serveur Vercel ; interface ancienne | PARTIEL | Dernière version à déployer après QA |
| Production | GET HTTPS www | HTTPS accessible | HTTP 200 | PASS accès | Redirection canonique à approfondir |
| Configuration | URL publique de production | Domaine confirmé | NEXT_PUBLIC_APP_URL = https://mata-beauty.com | PASS | Aucune |
| Configuration | Backend de production | Projet de production | qjdwxdbvrxedyfolnpol.supabase.co | PASS identification | Aucune |
| Paiement | Variables et API capabilities | Pas de paiement réel | Mode mock ; onlineCheckoutEnabled=false | PASS | Aucune |
| Google | API providers | Google activé | HTTP 200, google=true | PASS activation | Aucune |
| Google | Profil → Continuer avec Google | Redirection OAuth valide | Écran de connexion Google atteint ; callback Supabase de production et retour mata-beauty.com/auth/callback | PARTIEL | Saisie/consentement utilisateur en attente ; session non validée |
| Vidéo | Feed actuel de production | Contenu ou état vide clair | État « Les premières inspirations arrivent » | PASS état vide uniquement | Lecture impossible à qualifier sans vidéo |
| Réservation | Disponibilités HTTP 503 | Erreur distincte de zéro créneau, reprise possible | Avant : faux état vide ; après : erreur, Réessayer, créneaux rechargés | PASS local desktop/mobile 390 | QA-BOOK-001 |
| Réservation | Parcours classiques et vidéo, reprise du brouillon | Confirmation et contexte conservés | 8 tests existants PASS desktop/mobile ; API simulée | PASS local, portée limitée | Aucune |
| Auth locale | Faux jeton vers route protégée | Refus serveur et redirection | 4 tests dépassent 15 s ; échec reproduit isolément | À INVESTIGUER | Ne pas assimiler à un test RLS réel |
| Production | Réservation réelle, publication, sessions | Parcours de bout en bout | Non exécutés dans cet audit | NON TESTÉ | À faire |

## QA-BOOK-001

**Écran :** réservation, choix du créneau.

**Étapes de reproduction :** ouvrir une vidéo, cliquer Réserver, répondre HTTP 503 à `get_available_slots`.

**Résultat observé avant correction :** « Aucun créneau publié ce jour », sans mention de panne ni possibilité explicite de relance.

**Résultat attendu :** distinguer une indisponibilité technique d'une réponse valide vide ; permettre une nouvelle tentative ; borner l'attente réseau.

**Cause technique :** la réponse en erreur était convertie en tableau vide, puis rendue par la branche « aucun créneau » ; pas de délai maximal explicite.

**Fichiers concernés :** `app/mata-beauty-app.tsx`, `tests/e2e/booking-audit.spec.ts`.

**Correction effectuée :** état d'erreur dédié, bouton Réessayer, annulation après 15 secondes et à la fermeture/changement de date. Le module vidéo n'est pas modifié.

**Test après correction :** reproduction échouant avant correction ; test HTTP 503 → message → relance → créneau 10:00 PASS sur desktop et mobile 390. Le délai maximal est implémenté mais son scénario chronométré n'est pas encore testé.

**Statut Preview :** pas encore déployé.

**Statut production / mata-beauty.com :** pas encore déployé.

## Contrôles restant à terminer

- Google : terminer la connexion réelle avec le propriétaire puis vérifier callback, session, refresh, logout/reconnexion, comptes existants et refus/annulation.
- Vidéo : reproduire et diagnostiquer l'erreur intermittente `record_video_view` du précédent audit ; tester erreurs, mémoire, lecteurs concurrents et mobile.
- Réservation : concurrence et rejouage réels, annulation, notifications, adresse exacte du salon, cohérence prix/durée et historique des deux parties.
- Inventaire complet des interactions de tous les espaces réellement accessibles ; recherche et filtres ; publication et services professionnels ; états de panne.
- Déploiement Preview du correctif, retest réel, puis production et preuve de version réellement servie sur le domaine confirmé.

Les comptes Google et secrets ne sont pas consignés dans ce rapport. Le document utilisateur `docs/PRODUCTION_READINESS_2026-08-16.md` est laissé intact.
