import { expect, test, type BrowserContext } from '@playwright/test';
import { syntheticId, syntheticSession } from './fixtures/department-workspaces.mjs';
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
async function login(context: BrowserContext) {
  await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(syntheticSession('staff'))).toString('base64url'), domain: '127.0.0.1', path: '/', httpOnly: false, sameSite: 'Lax' }]);
}

test('employé : transfert à un collègue disponible et refus des espaces internes', async ({ page, context }) => {
  test.skip(process.env.MATA_E2E_COLLABORATOR_ACCESS_ENABLED !== 'true', 'Requires collaborator-enabled test build');
  await login(context);
  let transferred = false;
  await page.route(`${api}/rest/v1/rpc/get_staff_booking_agenda_global`, route => route.fulfill({ json: transferred ? [] : [{ id: syntheticId(505), starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 90000000).toISOString(), status: 'confirmed', service_title: 'Prestation attribuée', client_name: 'Client synthétique', time_zone: 'Africa/Dakar' }] }));
  await page.route(`${api}/rest/v1/rpc/get_reassignment_candidates`, route => route.fulfill({ json: [{ id: syntheticId(802), display_name: 'Collègue disponible' }] }));
  await page.route(`${api}/rest/v1/rpc/reassign_booking_collaborator`, route => {
    expect(route.request().postDataJSON()).toEqual({ target_booking_id: syntheticId(505), target_collaborator_id: syntheticId(802), reason: 'Répartition de la charge du salon' });
    transferred = true;
    return route.fulfill({ json: null });
  });
  await page.goto('/staff');
  await page.getByRole('button', { name: 'Réattribuer à un collègue', exact: true }).click();
  await page.getByRole('region', { name: 'Réattribuer à un collègue', exact: true }).getByRole('combobox').selectOption(syntheticId(802));
  await page.getByLabel('Motif', { exact: true }).fill('Répartition de la charge du salon');
  await page.getByRole('button', { name: 'Confirmer la réattribution', exact: true }).click();
  await expect(page.getByText('Rendez-vous réattribué. Le client, votre collègue et le responsable ont été informés.', { exact: true })).toBeVisible();
  await expect(page.getByText('Prestation attribuée', { exact: true })).toHaveCount(0);
  expect(transferred).toBe(true);
  for (const path of ['/admin/hr', '/finance', '/commercial']) {
    await page.goto(path);
    await expect(page).toHaveURL(/acces=refuse/);
  }
});
