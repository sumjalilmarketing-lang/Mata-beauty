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
  assert.match(app, /De quoi avez-vous envie aujourd’hui/);
  assert.match(app, /Professionnels disponibles/);
  assert.match(app, /Étape \$\{step\} sur 8/);
  assert.match(app, /Votre rendez-vous est créé/);
  assert.doesNotMatch(app, /Awa Signature|Demande simulée|Mode démonstration/);
  assert.match(layout, /Mata Beauty/);
  assert.doesNotMatch(page + layout, /codex-preview|SkeletonPreview/);
});

test("the database migrations cover the MVP and protected business domains", async () => {
  const [initial, application] = await Promise.all([
    readFile(new URL("supabase/migrations/20260725180000_initial_schema.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260725204500_businesses_collaborators_promotions.sql", root), "utf8"),
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
