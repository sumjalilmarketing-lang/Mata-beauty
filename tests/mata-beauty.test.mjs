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

test("the social video layer is server-counted, storage-isolated, and protected by RLS", async () => {
  const [schema, actions, guard, feed, publisher] = await Promise.all([
    readFile(new URL("supabase/migrations/20260804133000_social_video_feed.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260804134500_social_actions_and_publish.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260804143000_social_publication_guard.sql", root), "utf8"),
    readFile(new URL("app/social-feed.tsx", root), "utf8"),
    readFile(new URL("app/video-publisher.tsx", root), "utf8"),
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
  assert.match(feed, /IntersectionObserver/);
  assert.match(feed, /record_video_view/);
  assert.match(publisher, /100 \* 1024 \* 1024/);
  assert.doesNotMatch(feed + publisher, /SUPABASE_SERVICE_ROLE_KEY/);
});
