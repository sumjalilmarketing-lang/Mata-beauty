# MATA Beauty — inventaire des réserves SECURITY DEFINER

Relevé production du 6 octobre 2026, avant le correctif `822ea08` : 40 surfaces exécutables par `anon`, 99 par `authenticated`, avec recouvrement. Une autorisation EXECUTE ne prouve pas une faille : les contrôles internes doivent être examinés et éprouvés pour chaque fonction. Le correctif ajoute `admin_mfa_required`, réservé à authenticated/service_role.

**Problème :** fonctions à privilèges élevés exposées par l’API. **Risque :** contournement RLS si un contrôle interne manque. **Correction nécessaire :** qualifier chaque exposition, retirer les grants inutiles, tester refus et accès légitimes. **Bloquant avant lancement public : OUI tant que cet examen complet n’est pas terminé.** Le test des rôles et de deux failles ne constitue pas un audit exhaustif de toutes ces fonctions.

Le statut ci-dessous désigne l’examen complet de la surface et de ses variantes, pas l’exécution ponctuelle d’un parcours qui l’utilise. Les appels `get_admin_context`, `admin_assign_role`, `has_admin_permission` et les parcours métier testés sont détaillés dans le rapport principal.

| Fonction concernée | EXECUTE constaté | Examen complet | Bloquant avant lancement |
|---|---|---|---|
| `admin_assign_role(target_user_id uuid, target_role_key text, reason text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_feature_social_post(target_post_id uuid, target_feature_type text, target_starts_at timestamp with time zone, target_ends_at timestamp with time zone, target_position integer, target_audience jsonb, target_geographic_zone text, reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_global_search(search_term text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_list_users(search_term text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_manage_category(target_action text, target_category_id uuid, target_name text, target_slug text, target_description text, target_icon text, target_image_url text, target_parent_id uuid, target_sort_order integer, target_is_active boolean)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_moderate_social_post(target_post_id uuid, decision text, reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_set_provider_status(target_provider_id uuid, next_status public.provider_status, reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_set_user_suspension(target_user_id uuid, suspended boolean, reason text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_update_booking_status(target_booking_id uuid, next_status public.booking_status, reason text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `admin_update_setting(setting_key text, setting_value jsonb, reason text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `apply_payment_commission()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `archive_owned_business(target_business_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `attach_payment_provider(target_payment_id uuid, target_provider text, target_provider_reference text, target_is_test boolean)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `calculate_service_quote(target_provider_service_id uuid, target_option_ids uuid[], target_promotion_id uuid, target_location_mode text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `close_admin_session()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `complete_provider_onboarding_information(target_note text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `compute_provider_launch_completeness(target_provider_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `confirm_service_and_release(target_booking_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `create_provider_video_post(target_post_id uuid, target_title text, target_caption text, target_video_path text, target_video_url text, target_thumbnail_path text, target_thumbnail_url text, target_duration_seconds numeric, target_aspect_ratio numeric, target_provider_service_id uuid, target_status text, target_allow_comments boolean, target_client_consent boolean, target_scheduled_for timestamp with time zone, target_visibility text, target_hashtags text[], target_location text, target_available_at timestamp with time zone)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `create_social_media_post(target_post_type text, target_title text, target_caption text, target_media_urls text[], target_provider_service_id uuid, target_status text, target_allow_comments boolean, target_client_consent boolean, target_scheduled_for timestamp with time zone, target_visibility text, target_hashtags text[], target_location text, target_available_at timestamp with time zone, target_discount numeric, target_promotion_ends_at timestamp with time zone, target_promotion_slots integer)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `create_video_post(target_caption text, target_video_url text, target_thumbnail_url text, target_duration_seconds numeric, target_aspect_ratio numeric, target_provider_service_id uuid, target_status text, target_allow_comments boolean, target_client_consent boolean, target_scheduled_for timestamp with time zone, target_visibility text, target_hashtags text[])` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `ensure_authenticated_profile()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `ensure_booking_conversation(target_booking_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `fail_payment_initialization(target_payment_id uuid, target_failure_code text, target_source_ip_hash text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `get_admin_context()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `get_admin_dashboard()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `get_available_slots(target_provider_id uuid, target_provider_service_id uuid, from_date date, days integer)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `get_provider_follower_counts(target_provider_ids uuid[])` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `get_provider_launch_checklist(target_provider_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `get_social_admin_dashboard()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `grant_support_conversation_access(target_conversation_id uuid, target_support_agent_id uuid, target_reason text, target_expires_at timestamp with time zone)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `guard_published_post_service()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `handle_new_user()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `has_admin_permission(required_permission text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `has_business_commercial_permission(target_business_id uuid, required_permission text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `has_conversation_access(target_conversation_id uuid)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `increment_video_view_once()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `initialize_client_control_center()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `initialize_payment(target_booking_id uuid, target_method text, target_attempt text, target_provider_reference text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `initialize_payment_v2(target_booking_id uuid, target_method text, target_attempt text, target_internal_reference text, target_request_fingerprint text, target_source_ip_hash text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `is_admin()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `is_conversation_member(target_conversation_id uuid)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `is_super_admin()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `list_my_booking_conversations()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `manage_moderation_report(target_report_id uuid, target_action text, target_reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `manage_own_social_post(target_post_id uuid, target_action text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `manage_provider_onboarding(target_provider_id uuid, target_action text, target_reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `manage_refund_request(target_refund_id uuid, target_action text, target_reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `manage_support_ticket(target_ticket_id uuid, target_action text, target_value text, target_message text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `mark_conversation_read(target_conversation_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `nearby_providers(target_latitude double precision, target_longitude double precision, target_radius_km double precision, target_query text, target_category_slug text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `notification_delivery_health()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `notify_booking_status_changed()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `notify_provider_status_change()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `owns_business(target_business_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `professional_application_detail(target_provider_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `professional_application_history(target_provider_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `provider_creator_statistics(target_from timestamp with time zone, target_to timestamp with time zone)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `provider_social_conversion_summary(target_from timestamp with time zone, target_to timestamp with time zone)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_admin_session(client_user_agent text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_booking_status()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_platform_commission()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_post_booking_click(target_post_id uuid, target_session_hash text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_post_share(target_post_id uuid, target_session_hash text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_product_event(target_event_name text, target_properties jsonb, target_session_hash text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_social_profile_visit(target_provider_id uuid, target_post_id uuid, target_session_hash text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_support_ticket_opened()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `record_video_view(target_post_id uuid, target_session_hash text, target_watched_ms integer, target_completed boolean)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `refresh_post_comment_count()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `report_post_comment(target_comment_id uuid, target_reason text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `report_social_post(target_post_id uuid, target_reason text, target_details text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `request_account_deletion(target_reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `request_payment_refund(target_payment_id uuid, target_amount integer, target_reason text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `request_payment_refund_v2(target_payment_id uuid, target_amount integer, target_reason text, target_attempt text, target_source_ip_hash text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `request_professional_document_update(target_document_id uuid, public_message text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `request_professional_profile()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `request_provider_onboarding(target_business_name text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `resolve_commission_breakdown(target_booking_id uuid, target_gross integer)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `resolve_commission_breakdown_at(target_booking_id uuid, target_gross integer, target_effective_at timestamp with time zone)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `review_professional_application(target_provider_id uuid, decision text, public_message text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `revoke_support_conversation_access(target_conversation_id uuid, target_support_agent_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `save_client_location(target_address text, target_city text, target_place_id text, target_latitude double precision, target_longitude double precision)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `save_client_profile(target_first_name text, target_last_name text, target_phone text, target_city text, target_address text, target_preferences jsonb, target_marketing_consent boolean)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `save_professional_onboarding(target_business_name text, target_bio text, target_city text, target_service_mode text, target_activity_type text, target_years_experience integer, target_base_address text, target_languages text[], target_cancellation_policy text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `save_provider_location(target_address text, target_city text, target_area text, target_place_id text, target_latitude double precision, target_longitude double precision, target_radius_km integer, target_fee_per_km integer, target_free_radius_km numeric)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `send_conversation_message(target_conversation_id uuid, target_body text, target_client_nonce uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `set_conversation_archived(target_conversation_id uuid, target_archived boolean)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `set_owned_service_status(target_service_id uuid, next_status text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `social_post_not_strongly_reported(target_post_id uuid)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `submit_provider_for_review()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `sync_booking_staff_conversation_member()` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `synchronize_account_status()` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `toggle_follow_provider(target_provider_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `toggle_follow_provider_from_post(target_provider_id uuid, target_source_post_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `toggle_post_like(target_post_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `toggle_post_save(target_post_id uuid)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `update_client_identity(target_first_name text, target_last_name text, target_username text, target_phone text, target_bio text, target_city text, target_neighborhood text, target_locale text)` | authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `update_owned_service_pricing(target_service_id uuid, target_price_amount integer, target_pricing_mode text, target_price_from_amount integer, target_home_price_amount integer, target_travel_fee_amount integer, target_deposit_amount integer)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |
| `write_admin_audit(audit_action text, resource_type text, resource_id uuid, previous_value jsonb, next_value jsonb, justification text)` | anon, authenticated | NOT TESTED | OUI, jusqu’à qualification |

Source : Supabase Security Advisors. [Documentation des fonctions SECURITY DEFINER exposées](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

