import { expect, test } from "@playwright/test";

const providerId = "11111111-1111-4111-8111-111111111111";

test.beforeEach(async ({ context, baseURL }) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: providerId, role: "authenticated", exp: expires })}.workspace-menu-fixture`;
  const session = { access_token: accessToken, refresh_token: "workspace-fixture-refresh", token_type: "bearer", expires_in: 3600, expires_at: expires, user: { id: providerId, aud: "authenticated", role: "authenticated", email: "workspace@example.test", app_metadata: {}, user_metadata: {} } };
  const fixtureOrigin = process.env.MATA_SUPABASE_FIXTURE_ORIGIN!;
  const storageKey = `sb-${new URL(fixtureOrigin).hostname.split(".")[0]}-auth-token`;
  await context.addCookies([{ name: storageKey, value: `base64-${encode(session)}`, url: baseURL!, sameSite: "Lax" }]);
});

for (const space of ["pro", "salon"] as const) {
  test(`${space}: Plus opens and closes without dashboard navigation`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1000) > 767, "Mobile navigation only");
    await page.goto(`/${space}/settings`);
    const navigation = page.getByRole("navigation", { name: "Navigation mobile", exact: true });
    const more = navigation.getByRole("button", { name: "Plus", exact: true });
    await expect(more).toBeVisible();
    const originalUrl = page.url();
    await more.click();
    const dialog = page.getByRole("dialog", { name: "Plus", exact: true });
    await expect(dialog).toBeVisible();
    expect(page.url()).toBe(originalUrl);
    await expect(dialog.getByRole("link").first()).toHaveText(/Paramètres/);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(more).toBeFocused();
    await more.click();
    await dialog.getByRole("button", { name: "Fermer le menu", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await more.click();
    await dialog.getByRole("link", { name: /Paramètres/ }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${space}/settings$`));
    const geometry = await navigation.evaluate(element => {
      const parent = element.getBoundingClientRect();
      const children = Array.from(element.children).map(child => child.getBoundingClientRect());
      return children.every(child => child.left >= parent.left - 1 && child.right <= parent.right + 1 && child.height >= 44);
    });
    expect(geometry).toBe(true);
  });

  test(`${space}: old menu URL resolves to settings`, async ({ page }) => {
    await page.goto(`/${space}/menu`);
    await expect(page.getByRole("heading", { level: 1, name: "Paramètres", exact: true })).toBeVisible();
    if (space === "pro") await expect(page.getByRole("heading", { name: "Confidentialité et compte", exact: true })).toBeVisible();
  });
}
