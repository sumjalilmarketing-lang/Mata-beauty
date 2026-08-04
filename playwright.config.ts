import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-320", use: { viewport: { width: 320, height: 740 } } },
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 } } },
    { name: "mobile-430", use: { viewport: { width: 430, height: 932 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "laptop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "widescreen", use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://audit.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "audit-public-anon-key",
    },
  },
});
