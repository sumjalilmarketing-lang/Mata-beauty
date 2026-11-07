import { test, expect } from '@playwright/test';
import { syntheticSession } from './fixtures/department-workspaces.mjs';

test('avis : sélectionner trois étoiles et publier un commentaire', async ({ page, context }) => {
  const session = syntheticSession('client');
  await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
  const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
  let submitted = false;
  await page.route(`${api}/rest/v1/bookings**`, route => route.fulfill({ json: [{ id: '11111111-1111-4111-8111-111111111111', starts_at: '2026-11-01T12:00:00Z', provider_services: { title: 'Soin visage test' } }] }));
  await page.route(`${api}/rest/v1/rpc/get_booking_reviews`, route => route.fulfill({ json: submitted ? [{ id: 'review-test', reviewer_id: session.user.id, type: 'client_to_provider', rating: 3, comment: 'Une belle expérience.', visibility: 'public' }] : [] }));
  await page.route('**/api/bookings/reviews', route => {
    expect(route.request().postDataJSON()).toMatchObject({ rating: 3, comment: 'Une belle expérience.', type: 'client_to_provider' });
    submitted = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/app/reviews');
  await page.getByText(/Soin visage test.*Donner ou consulter mon avis/).click();
  await page.getByText('Donner mon avis', { exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(5);
  await page.getByRole('radio', { name: '3 étoiles', exact: true }).check();
  await expect(page.getByRole('radio', { name: '3 étoiles', exact: true })).toBeChecked();
  await page.getByLabel('Votre commentaire').fill('Une belle expérience.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `outputs/reviews-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Publier mon avis' }).click();
  await expect(page.getByText('Votre évaluation est enregistrée.')).toBeVisible();
  await expect(page.getByLabel('3 sur 5 étoiles')).toBeVisible();
  expect(submitted).toBe(true);
});
