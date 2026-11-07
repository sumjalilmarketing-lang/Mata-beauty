import { test, expect } from '@playwright/test';
import { qaLogin } from './helpers/qa-session';
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
for (const status of [400, 401, 403, 500]) test(`reviews: HTTP ${status}, no false success, retry and one pending submission`, async ({ page, context }) => {
  const session = await qaLogin(context, 'client');
  let calls = 0, saved = false, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${api}/rest/v1/bookings**`, route => route.fulfill({ json: [{ id: '11111111-1111-4111-8111-111111111111', starts_at: '2026-11-01T12:00:00Z', provider_services: { title: 'Audit résilience avis' } }] }));
  await page.route(`${api}/rest/v1/rpc/get_booking_reviews`, route => route.fulfill({ json: saved ? [{ id: 'qa-review', reviewer_id: session.user.id, type: 'client_to_provider', rating: 4, comment: 'Commentaire préservé.', visibility: 'public' }] : [] }));
  await page.route('**/api/bookings/reviews', async route => {
    calls++;
    expect(route.request().postDataJSON()).toMatchObject({ rating: 4, comment: 'Commentaire préservé.' });
    if (calls === 1) return route.fulfill({ status, json: { error: 'Synthetic refusal' } });
    await pending; saved = true; await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/app/reviews');
  await page.getByText(/Audit résilience avis.*Donner ou consulter mon avis/).click();
  await page.getByText('Donner mon avis', { exact: true }).click();
  await page.getByRole('radio', { name: '4 étoiles', exact: true }).check();
  const comment = page.getByLabel('Votre commentaire');
  await comment.fill('Commentaire préservé.');
  const button = page.getByRole('button', { name: 'Publier mon avis', exact: true });
  await button.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Avis non enregistré' })).toBeVisible();
  await expect(page.getByText('Votre évaluation est enregistrée.', { exact: true })).toHaveCount(0);
  await expect(comment).toHaveValue('Commentaire préservé.');
  await expect(button).toBeEnabled();
  try { await button.click(); await expect.poll(() => calls).toBe(2); await expect(page.getByRole('button', { name: 'Enregistrement…', exact: true })).toBeDisabled(); }
  finally { release(); }
  await expect(page.getByText('Votre évaluation est enregistrée.', { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

test('QA-B03: pending review request expires and preserves the comment', async ({ page, context }) => {
  test.setTimeout(35_000);
  await qaLogin(context, 'client');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${api}/rest/v1/bookings**`, route => route.fulfill({ json: [{ id: '11111111-1111-4111-8111-111111111111', starts_at: '2026-11-01T12:00:00Z', provider_services: { title: 'Audit délai avis' } }] }));
  await page.route(`${api}/rest/v1/rpc/get_booking_reviews`, route => route.fulfill({ json: [] }));
  await page.route('**/api/bookings/reviews', async route => { await pending; await route.fulfill({ status: 504, json: { error: 'Synthetic timeout' } }).catch(() => undefined); });
  await page.goto('/app/reviews');
  await page.getByText(/Audit délai avis.*Donner ou consulter mon avis/).click();
  await page.getByText('Donner mon avis', { exact: true }).click();
  await page.getByRole('radio', { name: '4 étoiles', exact: true }).check();
  await page.getByLabel('Votre commentaire').fill('Commentaire conservé après délai.');
  try {
    await page.getByRole('button', { name: 'Publier mon avis', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enregistrement de l’avis non confirmé' })).toBeVisible({ timeout: 18_000 });
    await expect(page.getByRole('button', { name: 'Réessayer les avis', exact: true })).toBeVisible();
    await expect(page.getByLabel('Votre commentaire')).toHaveValue('Commentaire conservé après délai.');
    await expect(page.getByRole('button', { name: 'Publier mon avis', exact: true })).toBeEnabled();
  } finally { release(); }
});
