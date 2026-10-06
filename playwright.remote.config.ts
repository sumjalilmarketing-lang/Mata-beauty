import { defineConfig, devices } from "@playwright/test";

const supabaseUrl = process.env.REMOTE_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.REMOTE_SUPABASE_ANON_KEY ?? "";
const remoteAppUrl = process.env.REMOTE_APP_URL;

export default defineConfig({
  testDir: "./tests/remote",
  testMatch: ["degraded-public.spec.ts", "role-ux-part3.spec.ts", "professional-application-remote-ui.spec.ts", "public-final-audit.spec.ts", "messaging-remote-ui.spec.ts", "social-feed-remote-ui.spec.ts", "catalog-salon-remote-ui.spec.ts", "client-profile-remote-ui.spec.ts", "admin-access-remote-ui.spec.ts", "continuous-real-acceptance.spec.ts", "preview-health.spec.ts"],
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    actionTimeout: 30_000,
    baseURL: remoteAppUrl ?? "http://localhost:3100",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    ...(process.env.QA_FULL_CHROMIUM === "1" ? { channel: "chromium" } : {}),
  },
  webServer: [
    ...remoteAppUrl ? [] : [{
      command: "node node_modules/next/dist/bin/next dev --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_APP_URL: "http://localhost:3100",
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
      },
    }],
    ...(process.env.REMOTE_HEALTH_ONLY === "1" ? [] : [{
      command: "node scripts/final-acceptance-server.mjs",
      url: "http://127.0.0.1:4399/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
        MATA_PREVIEW_URL: remoteAppUrl ?? "http://localhost:3100",
      },
    }]),
  ],
});
