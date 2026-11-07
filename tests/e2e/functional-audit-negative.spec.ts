import { test, expect } from '@playwright/test';
import { qaLogin } from './helpers/qa-session';
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;

// These are acceptance tests, not test.fail() or skipped known bugs.
// Red results against the audited release are retained as audit evidence.
test('QA-F01: oversized registration name has a visible field error', async ({ page }) => {
  await page.goto('/?connexion=requise');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  const name = dialog.locator('input[name=displayName]');
  // Deliberately bypass maxLength so schema error rendering is also exercised.
  await name.evaluate((node: HTMLInputElement) => node.removeAttribute('maxlength'));
  await name.fill('A'.repeat(81));
  await dialog.getByLabel('Pays de résidence', { exact: true }).selectOption('SN');
  await dialog.locator('input[name=email]').fill('qa@example.test');
  await dialog.locator('input[name=password]').fill('Synthetic-Password-2026!');
  await dialog.locator('input[name=confirmation]').fill('Synthetic-Password-2026!');
  await dialog.locator('input[name=acceptLegal]').check();
  let signupCalls = 0;
  await page.route(`${api}/auth/v1/signup**`, route => { signupCalls++; return route.fulfill({ status: 500, json: { message: 'must not be reached' } }); });
  await dialog.getByRole('button', { name: 'Créer le compte', exact: true }).click();
  await expect(dialog.locator('.field-error').filter({ hasText: /80/ })).toBeVisible();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(signupCalls).toBe(0);
});

for (const [role, path] of [
  ['client', '/app/feed/qa-inexistant'], ['client', '/app/settings/qa-inexistant'],
  ['provider', '/pro/services/qa-inexistant'], ['provider', '/salon/services/qa-inexistant'],
  ['staff', '/staff/services/qa-inexistant'], ['commercial_manager', '/commercial/crm/qa-inexistant'],
  ['finance_manager', '/finance/transactions/qa-inexistant'], ['support_manager', '/support-agent/tickets/qa-inexistant'],
  ['hr_manager', '/admin/hr/time/qa-inexistant'], ['verification_agent', '/onboarding/new/qa-inexistant'],
  ['moderator', '/moderation/videos/qa-inexistant'], ['content_manager', '/operations/categories/qa-inexistant'],
]) test(`QA-N01: unknown extra path returns 404 ${path}`, async ({ page, context }) => {
  await qaLogin(context, role);
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(404);
  await expect(page.getByRole('heading', { name: 'Cette page n’existe pas', exact: true })).toBeVisible();
});

test('QA-N02: server profile outage is not labelled account suspension', async ({ page, context }) => {
  await qaLogin(context, 'client', true);
  const redirect = await context.request.get('/auth/workspace', { maxRedirects: 0 });
  expect(redirect.status()).toBe(303);
  expect(redirect.headers().location).toContain('auth_error=workspace_unavailable');
  await page.goto('/auth/workspace');
  // The app consumes and removes auth_error from the URL after showing it.
  await expect(page.getByText('Votre espace est momentanément indisponible. Réessayez dans quelques instants.', { exact: true })).toBeVisible();
  await expect(page.getByText('Ce compte est suspendu.', { exact: true })).toHaveCount(0);
});

test('QA-F03: support submission locks while its first request is pending', async ({ page, context }) => {
  await qaLogin(context, 'client');
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${api}/rest/v1/support_tickets**`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests++;
    await pending;
    await route.fulfill({ status: 201, json: null });
  });
  await page.goto('/app/support');
  await page.locator('#client-support input[name=subject]').fill('Question synthétique audit');
  const submit = page.locator('#client-support form button');
  try {
    await submit.click();
    await expect.poll(() => requests).toBe(1);
    await expect(submit).toBeDisabled();
    // A real second pointer action on a disabled button must not dispatch again.
    await submit.dispatchEvent('click');
    expect(requests).toBe(1);
  } finally { release(); }
});

test('QA-F02: salon closure submission locks during its insert', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${api}/rest/v1/business_closures**`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests++;
    await pending;
    await route.fulfill({ status: 201, json: null });
  });
  await page.goto('/salon/agenda');
  const form = page.locator('form').filter({ has: page.locator('input[name=startsAt]') });
  await form.locator('input[name=startsAt]').fill('2027-02-10T10:00');
  await form.locator('input[name=endsAt]').fill('2027-02-10T12:00');
  const submit = form.locator('button');
  try { await submit.click(); await expect.poll(() => requests).toBe(1); await expect(submit).toBeDisabled(); }
  finally { release(); }
});

test('QA-F02: gallery upload locks while its request is pending', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  let requests = 0, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/media/images', async route => {
    requests++; await pending;
    await route.fulfill({ json: { url: 'http://127.0.0.1:3160/brand/icon-512.png' } });
  });
  await page.goto('/salon/portfolio');
  await page.locator('select[name=mediaType]').selectOption('gallery');
  await page.locator('input[name=file]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF7sAAAAASUVORK5CYII=', 'base64') });
  const button = page.getByRole('button', { name: 'Envoyer l’image', exact: true });
  try { await button.click(); await expect.poll(() => requests).toBe(1); await expect(page.locator('form.salon-form button')).toBeDisabled(); }
  finally { release(); }
});
