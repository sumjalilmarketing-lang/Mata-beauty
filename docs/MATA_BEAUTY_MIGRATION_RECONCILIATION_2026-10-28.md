# MATA Beauty — Réconciliation des migrations — 2026-10-28

> Lecture seule : aucune migration de cette table n’a été rejouée ni renommée.

## Limite de preuve

Supabase conserve la version et le nom dans `supabase_migrations.schema_migrations`, mais pas le SQL ni son checksum. Une égalité de contenu historique ne peut donc pas être affirmée à partir de l’API. Les checksums ci-dessous sont ceux des fichiers Git locaux.

## Correspondance des 114 entrées distantes

| # | Version distante | Nom distant | Correspondance locale | État | SHA-256 local |
|---:|---|---|---|---|---|
| 1 | 20260725180000 | initial_schema | 20260725180000_initial_schema.sql | version + nom identiques | 754df4923405c452 |
| 2 | 20260725193000 | security_and_workflows | 20260725193000_security_and_workflows.sql | version + nom identiques | 8250e478743a2633 |
| 3 | 20260725194500 | provider_onboarding_and_taxonomy | 20260725194500_provider_onboarding_and_taxonomy.sql | version + nom identiques | b5ccc9b62a7ca2b7 |
| 4 | 20260725200500 | provider_moderation_notifications | 20260725200500_provider_moderation_notifications.sql | version + nom identiques | 299732e7de60b68c |
| 5 | 20260725204500 | businesses_collaborators_promotions | 20260725204500_businesses_collaborators_promotions.sql | version + nom identiques | 967df50391ab15e5 |
| 6 | 20260725221000 | secure_available_slots | 20260725221000_secure_available_slots.sql | version + nom identiques | 65a09010ea1eac8a |
| 7 | 20260725233000 | super_admin_control_center | 20260725233000_super_admin_control_center.sql | version + nom identiques | d88a4106abafddf0 |
| 8 | 20260803120000 | payment_statuses | 20260803120000_payment_statuses.sql | version + nom identiques | 585a5902cc0b2a63 |
| 9 | 20260803120050 | legacy_payment_statuses | 20260803120050_legacy_payment_statuses.sql | version + nom identiques | 958e99ff4d3ba1df |
| 10 | 20260803120100 | payment_infrastructure | 20260803120100_payment_infrastructure.sql | version + nom identiques | 41aad96c280b8db4 |
| 11 | 20260803120200 | authenticated_payment_operations | 20260803120200_authenticated_payment_operations.sql | version + nom identiques | 7e6d9da835da0f96 |
| 12 | 20260803200000 | identity_and_onboarding_lot1 | 20260803200000_identity_and_onboarding_lot1.sql | version + nom identiques | 446bcda93b150d38 |
| 13 | 20260804120000 | bank_grade_payment_hardening | 20260804120000_bank_grade_payment_hardening.sql | version + nom identiques | 15e085dd4f3b193a |
| 14 | 20260804133000 | social_video_feed | 20260804133000_social_video_feed.sql | version + nom identiques | 3ea07b49d1b5bd86 |
| 15 | 20260804134500 | social_actions_and_publish | 20260804134500_social_actions_and_publish.sql | version + nom identiques | 71193a7101047ab7 |
| 16 | 20260804143000 | social_publication_guard | 20260804143000_social_publication_guard.sql | version + nom identiques | 90ddfe2b60ccef8b |
| 17 | 20260804160000 | full_audit_security_fixes | 20260804160000_full_audit_security_fixes.sql | version + nom identiques | c73102960c60c8ba |
| 18 | 20260804170000 | google_oauth_identity | 20260804170000_google_oauth_identity.sql | version + nom identiques | c04277b0aa272da4 |
| 19 | 20260804180000 | social_booking_attribution | 20260804180000_social_booking_attribution.sql | version + nom identiques | acae1e8f633b0609 |
| 20 | 20260804190000 | booking_conversations_realtime | 20260804190000_booking_conversations_realtime.sql | version + nom identiques | 8cff7f9560905853 |
| 21 | 20260804191000 | repair_message_notifications | 20260804191000_repair_message_notifications.sql | version + nom identiques | 58e9623a556fbfad |
| 22 | 20260804200000 | social_feed_completion | 20260804200000_social_feed_completion.sql | version + nom identiques | e2b0fd72de866867 |
| 23 | 20260804210000 | client_personal_profiles | 20260804210000_client_personal_profiles.sql | version + nom identiques | 636a1b03efc410e9 |
| 24 | 20260804211000 | client_provider_upgrade | 20260804211000_client_provider_upgrade.sql | version + nom identiques | 36a6e2088a1b048c |
| 25 | 20260805113000 | restore_service_role_profile_guard | 20260805113000_restore_service_role_profile_guard.sql | version + nom identiques | 5a4f425a3444587d |
| 26 | 20260805114000 | use_jwt_role_in_profile_guards | 20260805114000_use_jwt_role_in_profile_guards.sql | version + nom identiques | 8e9abc9b58793952 |
| 27 | 20260805130000 | admin_access_hardening | 20260805130000_admin_access_hardening.sql | version + nom identiques | 2f2cced8ce4208b5 |
| 28 | 20260815170000 | social_content_studio_and_moderation | 20260815170000_social_content_studio_and_moderation.sql | version + nom identiques | 0b6236c44352b73c |
| 29 | 20260815180000 | video_studio_workflow | 20260815180000_video_studio_workflow.sql | version + nom identiques | 743263a5e791720b |
| 30 | 20260815181000 | private_provider_social_media | 20260815181000_private_provider_social_media.sql | version + nom identiques | dd6a99daf935d6ab |
| 31 | 20260815190000 | integration_social_notifications | 20260815190000_integration_social_notifications.sql | version + nom identiques | 729eef3f82079850 |
| 32 | 20260815200000 | release_candidate_integrations | 20260815200000_release_candidate_integrations.sql | version + nom identiques | d15070fc8c2ce435 |
| 33 | 20260815201000 | schedule_social_posts_with_pg_cron | 20260815201000_schedule_social_posts_with_pg_cron.sql | version + nom identiques | c81985986f56b83a |
| 34 | 20260815210000 | salon_production_workflows | 20260815210000_salon_production_workflows.sql | version + nom identiques | a4dcf85589fb00d8 |
| 35 | 20260815211000 | repair_review_rating_refresh | 20260815211000_repair_review_rating_refresh.sql | version + nom identiques | 5fd4648d2ce96085 |
| 36 | 20260815212000 | repair_social_engagement_notification | 20260815212000_repair_social_engagement_notification.sql | version + nom identiques | c60d877d9ba9ee7e |
| 37 | 20260816120000 | immersive_social_feed | 20260816120000_immersive_social_feed.sql | version + nom identiques | a1806e0077502141 |
| 38 | 20260816150000 | repair_booking_created_notification | 20260816150000_repair_booking_created_notification.sql | version + nom identiques | f5eb4689635f5fbe |
| 39 | 20260816170000 | complete_beauty_catalog | 20260816170000_complete_beauty_catalog.sql | version + nom identiques | d203d5d70c854e2b |
| 40 | 20260816171000 | repair_business_media_storage_rls | 20260816171000_repair_business_media_storage_rls.sql | version + nom identiques | 0b4835d375ff790f |
| 41 | 20260817100000 | video_path_hardening | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 42 | 20260818100000 | staff_membership_rls | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 43 | 20260818130000 | commercial_offers | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 44 | 20260818133000 | commercial_quote_hardening | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 45 | 20260829120000 | maps_and_messaging | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 46 | 20260829150000 | message_anti_circumvention | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 47 | 20260829153000 | message_inbox_metadata | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 48 | 20260829170000 | harden_message_anti_circumvention | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 49 | 20260830160000 | operational_workspaces | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 50 | 20260830161000 | operational_workspaces_completion | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 51 | 20261005164009 | restore_production_launch_dependencies | 20261005163809_restore_production_launch_dependencies.sql | même nom, version différente — contenu distant non vérifiable | ed873f27819e1a68 |
| 52 | 20261005165509 | restore_product_event_endpoint | 20261005165335_restore_product_event_endpoint.sql | même nom, version différente — contenu distant non vérifiable | 66995bb67c00ac8e |
| 53 | 20261005170859 | restore_launch_feed_selection | 20261005170418_restore_launch_feed_selection.sql | même nom, version différente — contenu distant non vérifiable | 071a9808ad8c4baa |
| 54 | 20261005222315 | finalize_professional_application_workflow | 20261005202610_finalize_professional_application_workflow.sql | même nom, version différente — contenu distant non vérifiable | ea5685bca9456b94 |
| 55 | 20261005222320 | welcome_email_delivery | 20261005205325_welcome_email_delivery.sql | même nom, version différente — contenu distant non vérifiable | 50c4ac31f4e95de2 |
| 56 | 20261005222324 | restore_reviewed_professional_access | 20261005211600_restore_reviewed_professional_access.sql | même nom, version différente — contenu distant non vérifiable | af5ca7abdf5a5384 |
| 57 | 20261005222328 | reconcile_professional_approval_roles | 20261006002500_reconcile_professional_approval_roles.sql | même nom, version différente — contenu distant non vérifiable | 715818ca35c4c4f9 |
| 58 | 20261006001816 | dossier_notifications_part_three | 20261005231621_dossier_notifications_part_three.sql | même nom, version différente — contenu distant non vérifiable | f8e10a7bd0148292 |
| 59 | 20261006001830 | notification_dispatch_and_event_completion | 20261005232415_notification_dispatch_and_event_completion.sql | même nom, version différente — contenu distant non vérifiable | 6ea66c58b1d75b63 |
| 60 | 20261006001841 | harden_notification_dispatch_extension | 20261005233155_harden_notification_dispatch_extension.sql | même nom, version différente — contenu distant non vérifiable | 8bcb616f483ee7f0 |
| 61 | 20261006001851 | complete_notification_navigation | 20261005233531_complete_notification_navigation.sql | même nom, version différente — contenu distant non vérifiable | a0447662327cdd28 |
| 62 | 20261006001907 | notification_delivery_health | 20261005235622_notification_delivery_health.sql | même nom, version différente — contenu distant non vérifiable | 94e745985f02bc41 |
| 63 | 20261006012045 | enforce_professional_approval_and_admin_mfa | 20261006010731_enforce_professional_approval_and_admin_mfa.sql | même nom, version différente — contenu distant non vérifiable | a16d798d71ab56ad |
| 64 | 20261006015710 | enforce_active_admin_membership | 20261006015600_enforce_active_admin_membership.sql | même nom, version différente — contenu distant non vérifiable | b65d2c684b956c00 |
| 65 | 20261006020910 | correct_admin_financial_metrics | 20261006020550_correct_admin_financial_metrics.sql | même nom, version différente — contenu distant non vérifiable | f73028edf7584c81 |
| 66 | 20261006021554 | require_authenticated_service_management | 20261006021316_require_authenticated_service_management.sql | même nom, version différente — contenu distant non vérifiable | a98c21b2c7f68fbb |
| 67 | 20261006021640 | normalize_booking_slot_conflicts | 20261006021614_normalize_booking_slot_conflicts.sql | même nom, version différente — contenu distant non vérifiable | ea054c31de181703 |
| 68 | 20261006022353 | restrict_legacy_privileged_entrypoints | 20261006021727_restrict_legacy_privileged_entrypoints.sql | même nom, version différente — contenu distant non vérifiable | 296df584bda6aaee |
| 69 | 20261006022445 | align_existing_support_moderation_workflows | 20261006020941_align_existing_support_moderation_workflows.sql | même nom, version différente — contenu distant non vérifiable | c59da23e5c17a1a5 |
| 70 | 20261007084711 | internal_team_access | 20261006174629_internal_team_access.sql | même nom, version différente — contenu distant non vérifiable | 7bec8e30c4bbc571 |
| 71 | 20261007084725 | internal_activation_server | 20261006175531_internal_activation_server.sql | même nom, version différente — contenu distant non vérifiable | 8b4c86a3c8fd02a0 |
| 72 | 20261007084735 | scope_internal_role_access | 20261006175747_scope_internal_role_access.sql | même nom, version différente — contenu distant non vérifiable | dc9ce5b312c6134b |
| 73 | 20261007084743 | internal_mfa_audit | 20261006180904_internal_mfa_audit.sql | même nom, version différente — contenu distant non vérifiable | 9e86377143a6ef13 |
| 74 | 20261007084752 | internal_suspension_auth_compatibility | 20261006181323_internal_suspension_auth_compatibility.sql | même nom, version différente — contenu distant non vérifiable | ccf1d16186c31961 |
| 75 | 20261007084802 | restrict_business_archive_role | 20261006181832_restrict_business_archive_role.sql | même nom, version différente — contenu distant non vérifiable | 8e91753bab1ecf30 |
| 76 | 20261007100840 | close_permission_audit_exposures | 20261007094545_close_permission_audit_exposures.sql | même nom, version différente — contenu distant non vérifiable | 4a3a9258032de697 |
| 77 | 20261007100845 | restore_document_and_review_guards | 20261007095500_restore_document_and_review_guards.sql | même nom, version différente — contenu distant non vérifiable | 768d7a0283e9821a |
| 78 | 20261007100858 | retire_unused_workflow_entrypoints | 20261007100147_retire_unused_workflow_entrypoints.sql | même nom, version différente — contenu distant non vérifiable | 3b79f80e88b088b8 |
| 79 | 20261007144826 | scope_internal_dashboard_aggregates | 20261007144455_scope_internal_dashboard_aggregates.sql | même nom, version différente — contenu distant non vérifiable | 11c68b77705c340a |
| 80 | 20261007152614 | enforce_social_record_integrity | 20261007150828_enforce_social_record_integrity.sql | même nom, version différente — contenu distant non vérifiable | 8827d55d74342c30 |
| 81 | 20261007152631 | audit_comment_visibility_changes | 20261007151445_audit_comment_visibility_changes.sql | même nom, version différente — contenu distant non vérifiable | 807b1a1acdb15439 |
| 82 | 20261007154705 | restore_health_abuse_dependency | 20261007153936_restore_health_abuse_dependency.sql | même nom, version différente — contenu distant non vérifiable | c068545090d1d423 |
| 83 | 20261007155510 | restore_private_profile_access | 20261007155416_restore_private_profile_access.sql | même nom, version différente — contenu distant non vérifiable | fb00cc01c300300c |
| 84 | 20261007160206 | restrict_profile_private_columns_and_status | 20261007155527_restrict_profile_private_columns_and_status.sql | même nom, version différente — contenu distant non vérifiable | 55917523fb895922 |
| 85 | 20261007161643 | restore_existing_launch_admin_dependencies | 20261007160629_restore_existing_launch_admin_dependencies.sql | même nom, version différente — contenu distant non vérifiable | 5d6ffd389f56c5de |
| 86 | 20261007162302 | isolate_support_from_content_moderation | 20261007161717_isolate_support_from_content_moderation.sql | même nom, version différente — contenu distant non vérifiable | d97f8f53c35267e4 |
| 87 | 20261007163622 | reserve_pending_refund_amounts | 20261007162636_reserve_pending_refund_amounts.sql | même nom, version différente — contenu distant non vérifiable | 10613acd5f2647ed |
| 88 | 20261007164844 | audit_review_visibility_changes | 20261007163632_audit_review_visibility_changes.sql | même nom, version différente — contenu distant non vérifiable | 2ee4a903e44852f6 |
| 89 | 20261007165956 | process_account_deletion_requests | 20261007170500_process_account_deletion_requests.sql | même nom, version différente — contenu distant non vérifiable | 97d907045cd90849 |
| 90 | 20261007171347 | require_mfa_for_legacy_internal_access | 20261007173000_require_mfa_for_legacy_internal_access.sql | même nom, version différente — contenu distant non vérifiable | f39a6dfb67dbbfb4 |
| 91 | 20261007171453 | move_btree_gist_to_extensions | 20261007171500_move_btree_gist_to_extensions.sql | même nom, version différente — contenu distant non vérifiable | 5cb87dfcb61e550b |
| 92 | 20261007173502 | expose_public_maintenance_state | 20261007174500_expose_public_maintenance_state.sql | même nom, version différente — contenu distant non vérifiable | cec9e3d1b9c24e2c |
| 93 | 20261008120100 | secure_admin_account_lifecycle | 20261008112317_secure_admin_account_lifecycle.sql | même nom, version différente — contenu distant non vérifiable | c512639f5a7b2f09 |
| 94 | 20261008120114 | retain_analytics_after_account_deletion | 20261008113756_retain_analytics_after_account_deletion.sql | même nom, version différente — contenu distant non vérifiable | 4cc01125026a14d8 |
| 95 | 20261008120125 | idempotent_account_deletion_finalization | 20261008114401_idempotent_account_deletion_finalization.sql | même nom, version différente — contenu distant non vérifiable | 97d9fac8834d8777 |
| 96 | 20261008151039 | guard_feed_comment_rate | 20261008122831_guard_feed_comment_rate.sql | même nom, version différente — contenu distant non vérifiable | 2c892b14132a8db3 |
| 97 | 20261008152541 | distinguish_video_comment_reports | 20261008131259_distinguish_video_comment_reports.sql | même nom, version différente — contenu distant non vérifiable | 89cb287b7647f838 |
| 98 | 20261008152555 | count_only_video_reports_for_feed_visibility | 20261008150824_count_only_video_reports_for_feed_visibility.sql | même nom, version différente — contenu distant non vérifiable | f75ea4872cb3d8a4 |
| 99 | 20261011094416 | employee_booking_assignment | 20261008170112_employee_booking_assignment.sql | même nom, version différente — contenu distant non vérifiable | 86ece2292d65e468 |
| 100 | 20261011094423 | employee_assignment_guards | 20261008172740_employee_assignment_guards.sql | même nom, version différente — contenu distant non vérifiable | da23a009261822ce |
| 101 | 20261011094426 | employee_calendar_contract | 20261008173647_employee_calendar_contract.sql | même nom, version différente — contenu distant non vérifiable | 0811a63f6e9eb1f4 |
| 102 | 20261011094433 | employee_resource_namespace | 20261008174332_employee_resource_namespace.sql | même nom, version différente — contenu distant non vérifiable | b3cc8100a266f377 |
| 103 | 20261011094436 | require_enabled_team_assignment | 20261008174522_require_enabled_team_assignment.sql | même nom, version différente — contenu distant non vérifiable | 69de4adb966f0392 |
| 104 | 20261011094440 | harden_employee_account_access | 20261011092427_harden_employee_account_access.sql | même nom, version différente — contenu distant non vérifiable | 498649f496450612 |
| 105 | 20261011095542 | fix_independent_team_availability_shape | 20261011095523_fix_independent_team_availability_shape.sql | même nom, version différente — contenu distant non vérifiable | c8e70029848f0a82 |
| 106 | 20261011101004 | conversation_multimedia_foundation | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 107 | 20261011101008 | conversation_quotes_and_booking | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 108 | 20261011101047 | video_comment_likes | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 109 | 20261011102400 | quote_catalog_compatibility | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 110 | 20261011102928 | conversation_history_pagination | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 111 | 20261011103238 | message_attachment_validation_leases | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 112 | 20261011103442 | ensure_booking_conversation_trigger | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 113 | 20261012120044 | fix_validated_media_object_path | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |
| 114 | 20261012121500 | align_provider_profile_location_fields | historique Git à restaurer séparément | absente du commit Production, ne pas rejouer | — |

## Migrations locales sans entrée distante

| Fichier local | Analyse |
|---|---|
| 20260816180000_launch_commercial_foundation.sql | effets observés dans le schéma distant, mais entrée historique absente ou remplacée ; ne pas rejouer sans preuve |
| 20260831010000_harden_video_delivery_chain.sql | effets observés dans le schéma distant, mais entrée historique absente ou remplacée ; ne pas rejouer sans preuve |
| 20260831020000_repair_launch_event_profile_phone.sql | effets observés dans le schéma distant, mais entrée historique absente ou remplacée ; ne pas rejouer sans preuve |
| 20260831021000_repair_sensitive_audit_entity_id.sql | effets observés dans le schéma distant, mais entrée historique absente ou remplacée ; ne pas rejouer sans preuve |
| 20260831022000_repair_provider_admin_approval.sql | effets observés dans le schéma distant, mais entrée historique absente ou remplacée ; ne pas rejouer sans preuve |
| 20260906010000_repair_launch_event_status_dispatch.sql | effets observés dans le schéma distant, mais entrée historique absente ou remplacée ; ne pas rejouer sans preuve |
| 20261015001940_salon_collaborator_access.sql | réellement manquante à distance ; application Production en attente d’autorisation finale |
| 20261028083825_production_health_security.sql | nouvelle migration préparée, non appliquée |

## Procédure sans écrasement

1. Ne renommer et ne supprimer aucun fichier existant.
2. Exporter un snapshot de schéma et les ACL des objets concernés.
3. Restaurer dans une branche dédiée les migrations distantes absentes depuis leur commit Git d’origine, sans les exécuter en Production.
4. Comparer un reset local neuf au schéma distant avec `supabase db diff`.
5. Pour les migrations locales dont les effets existent déjà, créer une migration de réconciliation idempotente séparée ou documenter une réparation d’historique explicitement approuvée.
6. Appliquer uniquement les migrations réellement manquantes après sauvegarde et autorisation finale.
7. Vérifier ensuite que les listes locale et distante ne diffèrent que par les migrations nouvelles explicitement appliquées.

