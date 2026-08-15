import { defineConfig, devices } from "@playwright/test";

const supabaseUrl = process.env.REMOTE_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.REMOTE_SUPABASE_ANON_KEY ?? "";
const remoteAppUrl = process.env.REMOTE_APP_URL;

export default defineConfig({
  testDir: "./tests/remote",
  testMatch: ["messaging-remote-ui.spec.ts", "social-feed-remote-ui.spec.ts", "client-profile-remote-ui.spec.ts", "admin-access-remote-ui.spec.ts", "continuous-real-acceptance.spec.ts"],
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: remoteAppUrl ?? "http://localhost:3100",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: remoteAppUrl ? undefined : {
    command: "node node_modules/next/dist/bin/next dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    },
  },
});
