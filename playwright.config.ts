import { defineConfig, devices } from "@playwright/test";

const testPort = Number(process.env.MATA_PLAYWRIGHT_PORT ?? 3160);
const fixturePort = Number(process.env.MATA_SUPABASE_FIXTURE_PORT ?? 3161);
const testOrigin = `http://127.0.0.1:${testPort}`;
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
process.env.MATA_SUPABASE_FIXTURE_ORIGIN = fixtureOrigin;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  outputDir: ".next/playwright-results-pro-salon",
  use: {
    baseURL: testOrigin,
    // The app's PWA worker can take ownership of requests and bypass
    // Playwright's page.route fixtures. Block it in these deterministic
    // browser/API tests; PWA behavior is exercised separately.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-320", use: { viewport: { width: 320, height: 740 } } },
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 } } },
    { name: "mobile-430", use: { viewport: { width: 430, height: 932 } } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "tablet-1024", use: { viewport: { width: 1024, height: 1366 } } },
    { name: "laptop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "widescreen", use: { viewport: { width: 1920, height: 1080 } } },
  ],
});
