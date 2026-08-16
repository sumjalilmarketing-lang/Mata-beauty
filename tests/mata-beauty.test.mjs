import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the public experience is a real booking application", async () => {
  const [page, app, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(page, /MataBeautyApp/);
  assert.match(app, /Prenez soin de vous/);
  assert.match(app, /Catégories populaires/);
  assert.match(app, /Étape \$\{step\} sur 2/);
  assert.match(app, /Voir les créneaux/);
  assert.match(app, /Mis à jour en direct/);
  assert.match(app, /waitingForAuthentication/);
  assert.match(app, /get_available_slots/);
  assert.match(app, /Votre rendez-vous est créé/);
  assert.doesNotMatch(app, /Awa Signature|Demande simulée|Mode démonstration/);
  assert.match(layout, /Mata Beauty/);
  assert.match(layout, /mata-category-atlas\.webp/);
  assert.doesNotMatch(page + layout, /codex-preview|SkeletonPreview/);
});

test("the database migrations cover the MVP and protected business domains", async () => {
  const [initial, application, availability] = await Promise.all([
    readFile(new URL("supabase/migrations/20260725180000_initial_schema.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260725204500_businesses_collaborators_promotions.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260725221000_secure_available_slots.sql", root), "utf8"),
  ]);
  const initialTables = [
    "profiles", "client_profiles", "provider_profiles", "provider_documents",
    "categories", "provider_categories", "services", "provider_services",
    "portfolio_items", "service_areas", "availability_rules",
    "availability_exceptions", "bookings", "booking_status_history",
    "favorites", "reviews", "conversations", "conversation_members",
    "messages", "notifications", "reports", "payments",
    "platform_commissions", "audit_logs",
  ];
  for (const table of initialTables) assert.match(initial, new RegExp(`create table public\\.${table}`));
  for (const table of ["businesses", "collaborators", "collaborator_services", "promotions"]) {
    assert.match(application, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(initial, /exclude using gist/);
  assert.match(application, /enable row level security/g);
  assert.match(application, /providers manage own promotions/);
  assert.match(availability, /get_available_slots/);
  assert.match(availability, /not exists[\s\S]*public\.bookings/);
  assert.match(availability, /pending', 'confirmed', 'in_progress/);
});

test("provider moderation and the PWA shell remain protected", async () => {
  const [onboarding, notifications, manifest, worker] = await Promise.all([
    readFile(new URL("supabase/migrations/20260725194500_provider_onboarding_and_taxonomy.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260725200500_provider_moderation_notifications.sql", root), "utf8"),
    readFile(new URL("app/manifest.ts", root), "utf8"),
    readFile(new URL("public/sw.js", root), "utf8"),
  ]);
  assert.match(onboarding, /submit_provider_for_review/);
  assert.match(onboarding, /auth\.uid\(\) = old\.profile_id/);
  assert.match(notifications, /after update of status/);
  assert.match(notifications, /insert into public\.notifications/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(worker, /\/offline/);
  assert.doesNotMatch(worker, /supabase|auth|api/);
});

test("the official Mata identity drives the design system and installable assets", async () => {
  const [styles, app, admin, manifest, lightLogo, darkLogo, appIcon] = await Promise.all([
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
    readFile(new URL("app/super-admin.tsx", root), "utf8"),
    readFile(new URL("app/manifest.ts", root), "utf8"),
    readFile(new URL("public/brand/mata-logo-light.webp", root)),
    readFile(new URL("public/brand/mata-logo-dark.webp", root)),
    readFile(new URL("public/brand/mata-app-icon.webp", root)),
  ]);
  for (const token of ["--mata-primary", "--mata-secondary", "--mata-accent", "--mata-background", "--mata-success", "--mata-danger"]) {
    assert.match(styles, new RegExp(token));
  }
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /data-theme="dark"/);
  assert.match(app, /mata-splash/);
  assert.match(app, /mata-hero-card/);
  assert.match(app + admin, /\/brand\/mata-app-icon\.webp/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /purpose: "maskable"/);
  for (const asset of [lightLogo, darkLogo, appIcon]) assert.ok(asset.byteLength > 10_000 && asset.byteLength < 120_000);
});

test("the admin login keeps readable colors on its white surface", async () => {
  const styles = await readFile(new URL("app/admin/admin.css", root), "utf8");
  const sharedTheme = styles.match(/\.super-admin-shell,\.admin-auth-shell\{([^}]+)\}/)?.[1] ?? "";
  const hexToRgb = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const luminance = (hex) => hexToRgb(hex)
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrastOnWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

  assert.match(sharedTheme, /--p:#5b0b45/);
  assert.match(sharedTheme, /--text:#24131f/);
  for (const token of ["--p", "--g", "--text", "--muted"]) {
    const color = sharedTheme.match(new RegExp(`${token}:(#[0-9a-f]{6})`, "i"))?.[1];
    assert.ok(color && contrastOnWhite(color) >= 4.5, `${token} must meet WCAG AA on white`);
  }
  assert.match(styles, /\.admin-login-card \.admin-login-brand small\{color:#7c4f0c\}/);
});

test("the Super Admin control center is protected by RBAC and audited RPCs", async () => {
  const [migration, adminPage, adminApp] = await Promise.all([
    readFile(new URL("supabase/migrations/20260725233000_super_admin_control_center.sql", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
    readFile(new URL("app/super-admin.tsx", root), "utf8"),
  ]);

  for (const role of ["super_admin", "support", "moderator", "verification_agent", "finance", "content_manager"]) {
    assert.match(migration, new RegExp(`'${role}'`));
  }
  for (const permission of ["roles.manage", "documents.review", "payments.refund", "settings.update", "audit.read"]) {
    assert.match(migration, new RegExp(permission.replace(".", "\\.")));
  }
  for (const rpc of ["has_admin_permission", "admin_assign_role", "admin_set_user_suspension", "admin_set_provider_status", "admin_update_booking_status", "admin_update_setting"]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(migration, /target_user_id = auth\.uid\(\).*Impossible de modifier ses propres permissions/s);
  assert.match(migration, /alter table public\..*enable row level security/);
  assert.doesNotMatch(adminPage + adminApp, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(adminApp, /Compte non autorisé/);
  assert.match(adminApp, /PermissionGuard/);
  assert.match(adminApp, /ConfirmationModal/);
});

test("the social video layer is server-counted, attributable, storage-isolated, and protected by RLS", async () => {
  const [schema, actions, guard, attribution, immersive, feed, publisher, app] = await Promise.all([
    readFile(new URL("supabase/migrations/20260804133000_social_video_feed.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260804134500_social_actions_and_publish.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260804143000_social_publication_guard.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260804180000_social_booking_attribution.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260816120000_immersive_social_feed.sql", root), "utf8"),
    readFile(new URL("app/social-feed.tsx", root), "utf8"),
    readFile(new URL("app/video-publisher.tsx", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
  ]);
  for (const table of ["posts", "post_services", "post_likes", "post_saves", "follows", "post_comments", "hashtags", "video_views"]) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(schema, /social-videos/);
  assert.match(schema, /social-thumbnails/);
  assert.match(schema, /protect_social_counters/);
  assert.match(actions, /record_post_share/);
  assert.match(actions, /report_social_post/);
  assert.match(actions, /create_video_post/);
  assert.match(guard, /provider\.status = 'approved'/);
  assert.match(guard, /client_consent_confirmed/);
  assert.match(attribution, /add column if not exists source_post_id/);
  assert.match(attribution, /validate_social_booking_source/);
  assert.match(attribution, /provider_social_conversion_summary/);
  assert.match(attribution, /post\.author_id = auth\.uid\(\)/);
  assert.match(attribution, /old\.source_post_id is distinct from new\.source_post_id/);
  assert.match(feed, /IntersectionObserver/);
  assert.match(feed, /record_video_view/);
  assert.match(feed, /FEED_BATCH_SIZE = 8/);
  assert.match(feed, /Math\.abs\(index-activeIndex\)<=1/);
  assert.match(feed, /socialFeedFilters/);
  assert.match(feed, /Réserver maintenant/);
  assert.match(feed, /onBook\(post\.authorId,.*post\.id\)/s);
  for (const model of ["social_post_views", "social_post_likes", "social_post_comments", "social_post_saves", "social_post_shares", "social_post_reports", "provider_follows"]) {
    assert.match(immersive, new RegExp(`view public\\.${model}`));
  }
  assert.match(immersive, /social_profile_visits enable row level security/);
  assert.match(immersive, /provider_id = auth\.uid\(\) or public\.is_admin\(\)/);
  assert.match(app, /source_post_id: booking\.sourcePostId \?\? null/);
  assert.match(app, /Inspiration<\/button>/);
  assert.match(publisher, /100 \* 1024 \* 1024/);
  assert.doesNotMatch(feed + publisher, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("the social content studio supports moderated formats and audited promotion", async () => {
  const [migration, admin, workspaces, moduleView] = await Promise.all([
    readFile(new URL("supabase/migrations/20260815170000_social_content_studio_and_moderation.sql", root), "utf8"),
    readFile(new URL("app/super-admin.tsx", root), "utf8"),
    readFile(new URL("lib/navigation/spaces.ts", root), "utf8"),
    readFile(new URL("app/workspace-module.tsx", root), "utf8"),
  ]);
  for (const format of ["video", "photo", "before_after", "promotion", "availability"]) assert.match(migration, new RegExp(`'${format}'`));
  for (const table of ["social_post_media", "social_post_features"]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /provider-social-media/);
  assert.match(migration, /providers upload own social media/);
  assert.match(migration, /function public\.admin_moderate_social_post/);
  assert.match(migration, /function public\.admin_feature_social_post/);
  assert.match(migration, /function public\.create_social_media_post/);
  assert.match(migration, /function public\.get_social_admin_dashboard/);
  assert.match(migration, /write_admin_audit\('social\.post\.'/);
  assert.match(migration, /Contenu volé|contenu_vole|faux_resultat/);
  assert.match(admin, /SocialContentModule/);
  assert.match(admin, /admin_moderate_social_post/);
  assert.match(admin, /admin_feature_social_post/);
  assert.match(admin, /Réservations générées/);
  assert.match(workspaces, /"Studio"/);
  assert.match(moduleView, /videos: \{ table: "posts"/);
  assert.doesNotMatch(migration + admin, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("booking conversations are participant-only, realtime, paginated, and read-aware", async () => {
  const [migration, notificationRepair, messages, dashboard] = await Promise.all([
    readFile(new URL("supabase/migrations/20260804190000_booking_conversations_realtime.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260804191000_repair_message_notifications.sql", root), "utf8"),
    readFile(new URL("app/booking-messages.tsx", root), "utf8"),
    readFile(new URL("app/live-dashboard.tsx", root), "utf8"),
  ]);
  assert.match(migration, /create unique index if not exists conversations_booking_unique_idx/);
  assert.match(migration, /function public\.ensure_booking_conversation/);
  assert.match(migration, /auth\.uid\(\) not in \(selected_booking\.client_id, selected_booking\.provider_id\)/);
  assert.match(migration, /function public\.mark_conversation_read/);
  assert.match(migration, /profile_id = auth\.uid\(\)/);
  assert.match(migration, /alter publication supabase_realtime add table public\.messages/);
  assert.match(notificationRepair, /create trigger messages_notify_created/);
  assert.match(notificationRepair, /insert into public\.notifications/);
  assert.match(notificationRepair, /member\.profile_id <> new\.sender_id/);
  assert.match(messages, /postgres_changes/);
  assert.match(messages, /\.limit\(pageSize\)/);
  assert.match(messages, /lastOwnMessageRead/);
  assert.match(messages, /sender_id: userId/);
  assert.match(dashboard, /<BookingMessages/);
  assert.doesNotMatch(messages + dashboard, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("the audit hardening keeps identity verification, booking prices, and sandbox activation server-owned", async () => {
  const [migration, releaseRoute, createRoute, refundRoute, webhookRoute, paymentServer, capabilitiesRoute, gateway, app] = await Promise.all([
    readFile(new URL("supabase/migrations/20260804160000_full_audit_security_fixes.sql", root), "utf8"),
    readFile(new URL("app/api/payments/confirm-service/route.ts", root), "utf8"),
    readFile(new URL("app/api/payments/create/route.ts", root), "utf8"),
    readFile(new URL("app/api/payments/refund/route.ts", root), "utf8"),
    readFile(new URL("app/api/payments/webhook/route.ts", root), "utf8"),
    readFile(new URL("lib/payments/server.ts", root), "utf8"),
    readFile(new URL("app/api/payments/capabilities/route.ts", root), "utf8"),
    readFile(new URL("lib/payments/gateway.ts", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
  ]);
  assert.match(migration, /email_confirmed_at is not null/);
  assert.match(migration, /phone_confirmed_at is not null/);
  assert.match(migration, /identite non verifiee/);
  assert.match(migration, /create or replace function public\.enforce_booking_contract/);
  assert.match(migration, /new\.total_amount := selected_service\.price_amount/);
  assert.match(migration, /new\.ends_at := new\.starts_at \+ make_interval/);
  assert.match(migration, /before insert on public\.bookings/);
  assert.match(releaseRoute, /hasTrustedOrigin/);
  assert.match(releaseRoute, /consumeRateLimit/);
  for (const route of [releaseRoute, createRoute, refundRoute, webhookRoute]) {
    assert.match(route, /SECURITY_CONTROL_UNAVAILABLE/);
  }
  assert.match(paymentServer, /VERCEL_ENV !== "production"/);
  assert.match(createRoute, /applicationOrigin\(request\)/);
  assert.match(createRoute, /PAYMENT_SANDBOX_UNAVAILABLE/);
  assert.match(createRoute, /checkoutUrlForReference/);
  assert.match(capabilitiesRoute, /paymentCapabilities\(\)/);
  assert.match(gateway, /PAYDUNYA_PRIVATE_KEY/);
  assert.match(gateway, /onlineCheckoutEnabled: false/);
  assert.match(app, /isTrustedSandboxCheckoutUrl/);
  assert.match(app, /window\.location\.assign\(checkout\.data\.checkoutUrl\)/);
});

test("Google OAuth uses PKCE, a server callback, and idempotent non-privileged profiles", async () => {
  const [client, modal, callback, providersRoute, migration, app] = await Promise.all([
    readFile(new URL("lib/supabase/client.ts", root), "utf8"),
    readFile(new URL("app/auth-modal.tsx", root), "utf8"),
    readFile(new URL("app/auth/callback/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/providers/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260804170000_google_oauth_identity.sql", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
  ]);
  assert.match(client, /createBrowserClient/);
  assert.match(client, /flowType: "pkce"/);
  assert.match(modal, /provider: "google"/);
  assert.match(modal, /Continuer avec Google/);
  const submitBlock = modal.slice(modal.indexOf("async function submit"), modal.indexOf("async function continueWithGoogle"));
  const googleBlock = modal.slice(modal.indexOf("async function continueWithGoogle"), modal.indexOf("const title ="));
  assert.doesNotMatch(submitBlock, /isGoogleAuthEnabled/);
  assert.match(googleBlock, /isGoogleAuthEnabled/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /safeOAuthDestination/);
  assert.match(providersRoute, /AbortSignal\.timeout\(5000\)/);
  assert.match(providersRoute, /Cache-Control/);
  assert.doesNotMatch(callback, /console\.(log|error)/);
  assert.match(migration, /on conflict\(id\) do nothing/);
  assert.match(migration, /request_professional_profile/);
  assert.match(migration, /values\(identity\.id, 'customer'\)/);
  assert.doesNotMatch(migration, /raw_user_meta_data->>'role'/);
  assert.match(app, /mata-booking-draft/);
  assert.match(app, /onAuthStateChange/);
});

test("the provider Studio publishes validated and bookable media", async () => {
  const [studio, publisher, moduleView, workspaceRoute, migration, navigation] = await Promise.all([
    readFile(new URL("app/creator-studio.tsx", root), "utf8"),
    readFile(new URL("app/video-publisher.tsx", root), "utf8"),
    readFile(new URL("app/workspace-module.tsx", root), "utf8"),
    readFile(new URL("app/workspace-route.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/20260815180000_video_studio_workflow.sql", root), "utf8"),
    readFile(new URL("lib/navigation/spaces.ts", root), "utf8"),
  ]);
  for (const label of ["Créer une publication", "Mes vidéos", "Mes photos", "Avant / Après", "Brouillons", "Publications programmées", "Statistiques"]) assert.match(studio, new RegExp(label.replace("/", "\\/")));
  assert.match(moduleView, /<CreatorStudio/);
  assert.match(workspaceRoute, /moduleKey === "studio" \? "videos"/);
  assert.match(navigation, /module\("videos", "Studio"/);
  assert.match(publisher, /provider-social-media/);
  assert.match(publisher, /\/video\.\$\{extension\}/);
  assert.match(publisher, /create_provider_video_post/);
  assert.match(publisher, /Miniature personnalisée/);
  assert.match(publisher, /Supprimer et recommencer/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /owner_id=auth\.uid\(\)::text/);
  assert.match(migration, /target_provider_service_id is null/);
  assert.match(migration, /manage_own_social_post/);
  assert.doesNotMatch(studio + publisher, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("private workspaces expose only functional controls and safe errors", async () => {
  const [shell, moduleView, clientCenter, admin, publicErrors] = await Promise.all([
    readFile(new URL("app/workspace-shell.tsx", root), "utf8"),
    readFile(new URL("app/workspace-module.tsx", root), "utf8"),
    readFile(new URL("app/client-control-center.tsx", root), "utf8"),
    readFile(new URL("app/super-admin.tsx", root), "utf8"),
    readFile(new URL("lib/ui/public-error.ts", root), "utf8"),
  ]);
  assert.match(shell, /role="search" onSubmit=\{search\}/);
  assert.match(shell, /workspaceHref\(space, notificationsModule\.key\)/);
  assert.doesNotMatch(moduleView, /Fonction non connectée/);
  assert.match(moduleView, /Données momentanément indisponibles/);
  assert.match(moduleView, /visibleRows/);
  assert.match(clientCenter, /publicErrorMessage/);
  assert.match(admin, /publicErrorMessage/);
  assert.match(publicErrors, /row-level security/);
  assert.doesNotMatch(clientCenter, /setNotice\(error\?\.message/);
  assert.doesNotMatch(admin, /notify\(error\.message/);
  for (const decorativeAction of ["Filtres avancés", ">Dossier<", ">Détail<", ">Rembourser<"]) assert.doesNotMatch(admin, new RegExp(decorativeAction));
  assert.match(admin, /admin_manage_category/);
  assert.match(admin, /Catégorie créée et disponible dans l’application/);
  assert.doesNotMatch(admin, /Lecture seule — workflow d’édition non connecté/);
  assert.doesNotMatch(admin, /\[42, 58, 34, 72, 88, 64/);
  assert.match(admin, /metrics\.bookings_week/);
});

test("salon workspace is connected, archived safely and protected by RLS", async () => {
  const [center, route, migration, paymentUi] = await Promise.all([
    readFile(new URL("app/salon-control-center.tsx", root), "utf8"),
    readFile(new URL("app/workspace-route.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/20260815210000_salon_production_workflows.sql", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
  ]);
  for (const table of ["businesses", "business_hours", "business_closures", "business_invitations", "business_media", "collaborators", "provider_services", "bookings"]) assert.match(center, new RegExp(`from\\(\\"${table}\\"\\)`));
  assert.match(center, /archive_owned_business/);
  assert.match(center, /12 \* 1024 \* 1024/);
  assert.match(center, /image\/jpeg/);
  assert.match(route, /salonWorkflows/);
  assert.match(migration, /alter table public\.business_media enable row level security/);
  assert.match(migration, /owners upload business media/);
  assert.match(migration, /archive_owned_business/);
  assert.match(migration, /resolve_commission_breakdown_at/);
  assert.match(migration, /target_effective_at/);
  assert.doesNotMatch(center + migration, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(paymentUi, /Paiement de démonstration/);
});

test("release candidate automates scheduled posts and centralizes commissions", async () => {
  const [migration, schedule, vercel, admin] = await Promise.all([
    readFile(new URL("supabase/migrations/20260815200000_release_candidate_integrations.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260815201000_schedule_social_posts_with_pg_cron.sql", root), "utf8"),
    readFile(new URL("vercel.json", root), "utf8"),
    readFile(new URL("app/super-admin.tsx", root), "utf8"),
  ]);
  assert.match(migration, /publish_due_social_posts/);
  assert.match(migration, /for update of p skip locked/);
  assert.match(migration, /resolve_commission_breakdown/);
  assert.match(migration, /payments_apply_commission/);
  assert.match(migration, /admin_manage_category/);
  assert.match(migration, /Suppression impossible : cette catégorie possède des dépendances/);
  assert.match(schedule, /mata-publish-due-social-posts/);
  assert.match(schedule, /\* \* \* \* \*/);
  assert.doesNotMatch(schedule + admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(vercel, /"crons"/);
  assert.match(admin, /Catégorie parente/);
});

test("server health verifies Supabase service access without exposing secrets", async () => {
  const route = await readFile(new URL("app/api/health/server/route.ts", root), "utf8");
  assert.match(route, /serviceSupabase\(\)/);
  assert.match(route, /serviceRole: true/);
  assert.match(route, /Cache-Control/);
  assert.doesNotMatch(route, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /JSON\.stringify\(process\.env/);
});

test("social engagement and completed-booking reviews create preference-aware notifications", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260815190000_integration_social_notifications.sql", root), "utf8");
  assert.match(migration, /notification_preferences/);
  assert.match(migration, /social_in_app/);
  assert.match(migration, /target_owner = actor/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /post_likes_notify_owner/);
  assert.match(migration, /post_comments_notify_owner/);
  assert.match(migration, /reviews_notify_provider/);
  assert.match(migration, /revoke all on function public\.notify_post_engagement/);
});

test("public categories and service filters come from Supabase data", async () => {
  const [catalog, app] = await Promise.all([
    readFile(new URL("lib/supabase/catalog.ts", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
  ]);
  assert.match(catalog, /from\("categories"\)/);
  assert.match(catalog, /eq\("is_active", true\)/);
  assert.match(catalog, /order\("sort_order"\)/);
  assert.match(app, /fetchActiveCategories/);
  assert.match(app, /categoryServices/);
  assert.doesNotMatch(app, /const categories = \[/);
  assert.doesNotMatch(app, /const subcategories:/);
});
