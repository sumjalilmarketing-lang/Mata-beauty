import { defineConfig, devices } from "@playwright/test";

// A stable port keeps Playwright workers and global setup on the same origin.
// Global setup fails safely if another process already owns it.
const localPort = Number(process.env.MATA_PLAYWRIGHT_PORT ?? 4173);
process.env.MATA_PLAYWRIGHT_PORT = String(localPort);
const localBaseUrl = `http://127.0.0.1:${localPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Keep browser-driven pages deterministic on constrained local runners.
  workers: 2,
  reporter: "list",
  globalSetup: "./scripts/playwright-global-setup.mjs",
  use: {
    baseURL: localBaseUrl,
    // These tests exercise the application through Playwright route fixtures.
    // Keep the production PWA worker from bypassing those deterministic API
    // fixtures in browser engines with different service-worker scheduling.
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
