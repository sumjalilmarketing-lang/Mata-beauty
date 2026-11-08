# Vidéos publiées absentes du feed

Diagnostic en production, lecture seule : neuf vidéos publiques publiées, neuf médias présents ; la vue retournait neuf lignes avec les droits techniques mais huit pour un visiteur. Une prestation associée avait le statut brouillon et le marqueur actif. Sa politique RLS la masquait aux visiteurs et la jointure interne supprimait aussi la vidéo.

La migration sépare la publication de la vidéo de la disponibilité commerciale de la prestation. Elle conserve la prestation principale et les contrôles sur l'auteur, la visibilité et la modération. Les champs de réservation proviennent uniquement d'une prestation publiée, active et non archivée, y compris pour son propriétaire. Les publications futures ou sans date ne sont pas exposées. Le prédicat utilisé pour signer les médias ne dépend plus du marqueur actif de la prestation.

Aucun brouillon de prestation n'est publié, aucun statut de contenu n'est modifié, aucune politique RLS ni autorisation n'est élargie. Les gardes de création restent inchangées ; la modification d'une vidéo existante peut encore exiger une prestation active.

Validation : reproduction SQL sur PGlite avec rôles visiteur/propriétaire ; vidéo liée à un service publié, brouillon, en pause et archivé ; absence de fuite des champs privés ; exclusion des brouillons vidéo, abonnés, signalements, dates futures et nulles ; conservation des autorisations. Régression navigateur isolée ajoutée : vidéo visible sans bouton de réservation ni recherche de disponibilités.

Les comptes, fichiers et publications réels ne sont pas modifiés pour les tests. Le contrôle final de production doit vérifier les comptes agrégés sous le rôle visiteur après application de la migration.
