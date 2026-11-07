import { expect, test } from "@playwright/test";
import { syntheticSession } from "./fixtures/department-workspaces.mjs";

test("workspace nonce authorizes Next hydration and profile interactions", async ({ page, context }) => {
  const session = syntheticSession("client");
  await context.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/", httpOnly: false, sameSite: "Lax" }]);
  let saved = false;
  await page.route(`${process.env.MATA_SUPABASE_FIXTURE_ORIGIN}/rest/v1/rpc/update_client_identity_global`, route => {
    saved = true;
    return route.fulfill({ json: null });
  });
  const response = await page.goto("/app/profile?edit=1");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(response?.headers()["cache-control"]).toContain("no-store");
  const scriptDirective = policy.split(";").find(value => value.trim().startsWith("script-src")) ?? "";
  const nonce = /'nonce-([^']+)'/.exec(scriptDirective)?.[1];
  expect(nonce).toBeTruthy();
  expect(scriptDirective).not.toContain("'unsafe-inline'");
  const bootstrapNonces = await page.locator("script:not([type='application/ld+json'])").evaluateAll(elements => elements.map(element => (element as HTMLScriptElement).nonce));
  expect(bootstrapNonces.length).toBeGreaterThan(0);
  expect(bootstrapNonces.every(value => value === nonce)).toBe(true);
  await page.getByLabel("Prénom", { exact: true }).fill("Profil nonce");
  await page.locator("#edit-client-profile").getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Profil mis à jour.", { exact: true })).toBeVisible();
  expect(saved).toBe(true);
});

test("public static HTML keeps a non-blocking CSP rollout", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  const enforced = headers["content-security-policy"]?.split(";").find(value => value.trim().startsWith("script-src")) ?? "";
  const candidate = headers["content-security-policy-report-only"]?.split(";").find(value => value.trim().startsWith("script-src")) ?? "";
  expect(enforced).toContain("'unsafe-inline'");
  expect(candidate).not.toContain("'unsafe-inline'");
  expect(enforced).not.toContain("'nonce-");
});

for (const path of ["/admin", "/app/social-profile", "/auth/update-password", "/salon/invitation/accept"]) {
  test(`prerendered ${path} keeps compatible script headers`, async ({ page }) => {
    const response = await page.goto(path);
    const enforced = response?.headers()["content-security-policy"]?.split(";").find(value => value.trim().startsWith("script-src")) ?? "";
    expect(enforced).toContain("'unsafe-inline'");
    expect(enforced).not.toContain("'nonce-");
    await expect(page.locator("body")).toBeVisible();
  });
}
