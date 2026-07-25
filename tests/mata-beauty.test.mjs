import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the Mata Beauty experience replaces the starter preview", async () => {
  const [page, app, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/mata-beauty-app.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(page, /MataBeautyApp/);
  assert.match(app, /Votre beauté/);
  assert.match(app, /Réservation enregistrée/);
  assert.match(app, /Demande simulée/);
  assert.match(app, /Mode démonstration/);
  assert.match(layout, /Mata Beauty/);
  assert.doesNotMatch(page + layout, /codex-preview|SkeletonPreview/);
});

test("the database migration includes every MVP domain", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260725180000_initial_schema.sql", root), "utf8");
  const tables = [
    "profiles", "client_profiles", "provider_profiles", "provider_documents",
    "categories", "provider_categories", "services", "provider_services",
    "portfolio_items", "service_areas", "availability_rules",
    "availability_exceptions", "bookings", "booking_status_history",
    "favorites", "reviews", "conversations", "conversation_members",
    "messages", "notifications", "reports", "payments",
    "platform_commissions", "audit_logs",
  ];
  for (const table of tables) assert.match(sql, new RegExp(`create table public\\.${table}`));
  assert.match(sql, /enable row level security/);
  assert.match(sql, /exclude using gist/);
});

test("provider onboarding and moderation remain protected in SQL", async () => {
  const [onboarding, notifications] = await Promise.all([
    readFile(new URL("supabase/migrations/20260725194500_provider_onboarding_and_taxonomy.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260725200500_provider_moderation_notifications.sql", root), "utf8"),
  ]);
  assert.match(onboarding, /submit_provider_for_review/);
  assert.match(onboarding, /auth\.uid\(\) = old\.profile_id/);
  assert.match(onboarding, /new\.status = 'pending_review'/);
  assert.match(notifications, /after update of status/);
  assert.match(notifications, /insert into public\.notifications/);
});
