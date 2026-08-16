import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnvironment() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const apply = process.argv.includes("--apply");
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  assert.ifError(error);
  const users = data.users.filter((user) => /^codex-[^@]+@example\.test$/u.test(user.email ?? ""));
  testUsers.push(...users);
  if (data.users.length < 1000) break;
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", matchingTestAccounts: testUsers.length }));
if (!apply || testUsers.length === 0) process.exit(0);

const ids = testUsers.map((user) => user.id);
const blockers = [
  ["support_messages", ["sender_id"]],
  ["dispute_events", ["actor_id"]],
  ["refunds", ["requested_by", "approved_by"]],
  ["invoices", ["customer_id", "professional_id"]],
  ["messages", ["sender_id"]],
  ["reports", ["reporter_id"]],
  ["internal_notes", ["created_by"]],
  ["document_reviews", ["reviewer_id"]],
  ["support_tickets", ["requester_id"]],
  ["disputes", ["opened_by"]],
  ["moderation_actions", ["actor_id"]],
  ["notification_campaigns", ["created_by"]],
  ["content_versions", ["created_by"]],
  ["commission_rules", ["created_by"]],
  ["payout_batches", ["created_by", "approved_by"]],
  ["payments", ["customer_id", "professional_id"]],
  ["account_deletion_requests", ["profile_id"]],
  ["social_post_features", ["created_by"]],
  ["business_invitations", ["invited_by"]],
];

let removedRows = 0;
for (const [table, columns] of blockers) {
  for (const column of columns) {
    const { data, error } = await admin.from(table).delete().in(column, ids).select("*");
    if (error && error.code !== "42P01" && error.code !== "42703") throw error;
    removedRows += data?.length ?? 0;
  }
}

let deletedAccounts = 0;
let anonymizedAccounts = 0;
const failures = [];
for (const user of testUsers) {
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (!error) {
    deletedAccounts += 1;
    continue;
  }

  const anonymizedEmail = `deleted-test-${randomUUID()}@example.invalid`;
  const { error: authUpdateError } = await admin.auth.admin.updateUserById(user.id, {
    email: anonymizedEmail,
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: { display_name: "Compte de test supprimé", legal_accepted: "true" },
  });
  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({
      account_status: "deleted",
      display_name: "Compte de test supprimé",
      first_name: null,
      last_name: null,
    })
    .eq("id", user.id);
  if (authUpdateError || profileUpdateError) {
    failures.push({ id: user.id, message: authUpdateError?.message ?? profileUpdateError?.message });
  } else {
    anonymizedAccounts += 1;
  }
}

console.log(JSON.stringify({ removedBlockingRows: removedRows, deletedAccounts, anonymizedAccounts, failures: failures.length }));
if (failures.length > 0) process.exitCode = 1;
