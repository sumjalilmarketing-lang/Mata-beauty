import { expect, test, type BrowserContext } from '@playwright/test';
import { syntheticSession } from './fixtures/department-workspaces.mjs';

async function login(context: BrowserContext, role: string) {
  const session = syntheticSession(role);
  await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: '127.0.0.1', path: '/', httpOnly: false, sameSite: 'Lax' }]);
}

const spaces = [
  ['client', '/app/profile'], ['provider', '/pro'], ['provider', '/salon'],
  ['commercial_manager', '/commercial'], ['commercial_agent', '/commercial'],
  ['finance_manager', '/finance'], ['finance_agent', '/finance'],
  ['support_manager', '/support-agent'], ['support_agent', '/support-agent'],
  ['hr_manager', '/admin/hr'], ['hr_agent', '/admin/hr'],
  ['verification_agent', '/onboarding'], ['moderator', '/moderation'], ['content_manager', '/operations'],
  ['finance', '/finance'], ['support', '/support-agent'], ['commercial', '/commercial'], ['admin', '/operations'],
  ['super_admin', '/onboarding'], ['super_admin', '/moderation'], ['super_admin', '/operations'],
  ...(process.env.MATA_E2E_COLLABORATOR_ACCESS_ENABLED === 'true' ? [['staff', '/staff'] as const] : []),
] as const;

for (const [role, entry] of spaces) {
  test(`${role} ${entry}: every advertised workspace route opens without crash`, async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    await login(context, role);
    const crashes: string[] = [];
    page.on('pageerror', error => crashes.push(error.message));
    await page.goto(entry);
    const title = page.locator('main h1').first();
    await expect(title).toBeVisible();
    await expect.poll(() => page.locator('.workspace-sidebar nav a, [aria-label="Raccourcis personnels"] a').count()).toBeGreaterThan(0);
    const links = await page.locator('.workspace-sidebar nav a, [aria-label="Raccourcis personnels"] a').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('href')).filter((href): href is string => !!href))]);
    const results: { path: string; status: number; heading: string }[] = [];
    for (const path of links.filter(path => path.startsWith(entry === '/app/profile' ? '/app' : entry))) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.locator('main h1').first(), path).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Un problème est survenu', exact: true })).toHaveCount(0);
      await expect(page.getByText('Application error: a client-side exception has occurred', { exact: false })).toHaveCount(0);
      results.push({ path, status: response?.status() ?? 0, heading: await page.locator('main h1').first().innerText() });
    }
    expect(crashes).toEqual([]);
    expect(results.length).toBeGreaterThan(0);
    await testInfo.attach('route-inventory', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  });
}
