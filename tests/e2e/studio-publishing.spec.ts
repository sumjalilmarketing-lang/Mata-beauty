import { test, expect, type Page } from '@playwright/test';
import { qaLogin } from './helpers/qa-session';
import { auditBusiness, auditCategory, auditService } from './fixtures/provider-audit.mjs';
import { fileURLToPath } from 'node:url';
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
const tusHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Location,Upload-Offset,Upload-Length,Tus-Resumable', 'Tus-Resumable': '1.0.0' };
test.beforeEach(async ({ page }) => { page.on('requestfailed', request => console.log('STUDIO_REQUEST_FAILURE', request.method(), new URL(request.url()).pathname, request.failure()?.errorText)); });
test.afterEach(async ({ page }, info) => { if (info.status !== info.expectedStatus) console.log('STUDIO_FAILURE_STATE', (await page.locator('#video-publisher').innerText().catch(() => 'panel unavailable')).slice(-2500)); });
const video = fileURLToPath(new URL('./fixtures/studio-long.mp4', import.meta.url));

async function openStudio(page: Page, path = '/pro/videos') {
  await page.route(`${api}/rest/v1/posts**`, route => route.fulfill({ json: [] }));
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Montrez votre talent' })).toBeVisible();
}

for (const format of ['mp4', 'avi', 'mkv', 'mov']) test(`video ${format}, service and hashtags remain together with no duration cap or navigation`, async ({ page, context }) => {
  test.setTimeout(120000);
  const session = await qaLogin(context, 'provider');
  if (format === 'mov' || format === 'mp4') await page.route('**/video-converter/**', route => route.abort('failed'));
  let published: Record<string, unknown> | null = null;
  const savedPublication = () => published;
  let uploaded = 0;
  await page.route(`${api}/storage/v1/upload/resumable**`, route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-upsert,tus-resumable,upload-length,upload-metadata,upload-offset,x-http-method-override,cache-control','Access-Control-Allow-Methods':'POST,PATCH,HEAD,OPTIONS'}});
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, headers: { ...tusHeaders, Location: `${api}/storage/v1/upload/resumable/fixture`, 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0' } });
    if (route.request().method() === 'PATCH') { uploaded += route.request().postDataBuffer()?.length ?? 0; return route.fulfill({ status: 204, headers: { ...tusHeaders, 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(uploaded) } }); }
    return route.fulfill({ status: 200, headers: { ...tusHeaders, 'Upload-Offset': String(uploaded) } });
  });
  await page.route(`${api}/storage/v1/object/provider-social-media/**`, route => route.fulfill({ json: { Key: 'fixture' } }));
  await page.route(`${api}/storage/v1/object/sign/provider-social-media/**`, route => route.fulfill({ json: { signedURL: '/object/sign/provider-social-media/fixture?token=synthetic' } }));
  await page.route(`${api}/rest/v1/rpc/create_provider_video_post`, route => { published = route.request().postDataJSON(); return route.fulfill({ json: published!.target_post_id }); });
  await page.route(`${api}/rest/v1/social_feed**`, route => route.fulfill({ json: { id: published?.target_post_id } }));
  await openStudio(page);
  await page.route(`${api}/rest/v1/posts**`, route => {
    if (!new URL(route.request().url()).searchParams.has('id')) return route.fulfill({ json: published ? [{ id: published.target_post_id, post_type: 'video', title: 'Vidéo longue', caption: 'Test', status: 'published', thumbnail_url: null, view_count: 0, like_count: 0, comment_count: 0, published_at: new Date().toISOString(), created_at: new Date().toISOString() }] : [] });
    return route.fulfill({ json: { id: published?.target_post_id, status: 'published', visibility: 'public', published_at: new Date().toISOString(), post_services: [{ provider_service_id: auditService, is_primary: true }], social_post_media: [{ bucket_id: 'provider-social-media', storage_path: published?.target_video_path, thumbnail_path: published?.target_thumbnail_path }] } });
  });
  const start = page.url();
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(format === 'mp4' ? video : fileURLToPath(new URL(`./fixtures/studio-formats.${format}`, import.meta.url)));
  const preview = panel.getByLabel('Aperçu de votre vidéo', { exact: true });
  await expect(preview).toBeVisible({ timeout: 90000 });
  await expect.poll(() => preview.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  const visibleFrame = await preview.evaluate((element: HTMLVideoElement) => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.drawImage(element, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    return Array.from(pixels).some((value, index) => index % 4 !== 3 && value > 20);
  });
  // The long-duration MP4 fixture intentionally contains black frames.
  if (format !== 'mp4') expect(visibleFrame, 'Preview must show a decoded frame before publication').toBe(true);
  await panel.getByLabel('Légende', { exact: true }).fill('Réalisation longue depuis le Studio');
  await panel.getByLabel('Hashtags', { exact: true }).fill('#tresses #dakar');
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.locator('input[name=consent]').check();
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect.poll(() => published?.target_duration_seconds, { timeout: 90000 }).toBeGreaterThan(format === 'mp4' ? 90 : 0);
  expect(String(savedPublication()?.target_video_path)).toMatch(format === 'mov' ? /video[.]mov$/ : /video[.]mp4$/);
  expect(savedPublication()?.target_hashtags).toEqual(['#tresses', '#dakar']);
  expect(String(savedPublication()?.target_video_path)).toContain(session.user.id);
  expect(uploaded).toBeGreaterThan(0);
  await expect(page.getByText('Vidéo longue', { exact: true })).toBeVisible();
  expect(page.url()).toBe(start);
});

test('an interrupted video upload retains the selected media and details', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  await page.route(`${api}/storage/v1/upload/resumable**`, route => route.fulfill({ status: 401, json: { message: 'synthetic expired session' } }));
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(video);
  await panel.getByLabel('Légende', { exact: true }).fill('Description conservée');
  await panel.getByText('Options de publication', { exact: true }).click();
  await panel.locator('select[name=status]').selectOption('draft');
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('L’envoi a été interrompu');
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Description conservée');
  await expect(panel.locator('video')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Publier la vidéo', exact: true })).toBeEnabled();
});

test('creates and associates a service in the selected salon without losing publication fields', async ({ page, context }) => {
  const session = await qaLogin(context, 'provider');
  const second = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000999';
  await page.route(`${api}/rest/v1/businesses**`, route => route.fulfill({ json: [
    { id: auditBusiness, name: 'Premier salon', currency: 'XOF', country_code: 'SN', timezone: 'Africa/Dakar' },
    { id: second, name: 'Deuxième salon', currency: 'XOF', country_code: 'SN', timezone: 'Africa/Dakar' },
  ] }));
  let created = 0;
  await page.route(`${api}/rest/v1/provider_services**`, async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
    created++;
    const body = route.request().postDataJSON();
    expect(body.provider_id).toBe(session.user.id); expect(body.business_id).toBe(second); expect(body.currency).toBe('XOF');
    await route.fulfill({ json: { id: auditService, title: body.title, duration_minutes: body.duration_minutes, price_amount: body.price_amount, currency: body.currency, services: null } });
  });
  await openStudio(page, '/salon/videos');
  const start = page.url();
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Légende', { exact: true }).fill('Ne pas perdre ma publication');
  await panel.getByRole('button', { name: /Ajouter une prestation dans le Studio/ }).click();
  const service = page.getByRole('region', { name: 'Nouvelle prestation du Studio' });
  await service.getByLabel('Salon de la prestation', { exact: true }).selectOption(second);
  await service.locator('select[name=category]').selectOption(auditCategory);
  await service.getByLabel('Nom de la prestation', { exact: true }).fill('Tresses Studio');
  await service.getByLabel('Prix (XOF)', { exact: true }).fill('15000');
  await service.getByRole('button', { name: 'Enregistrer et associer' }).click();
  await expect(service).toHaveCount(0);
  expect(created).toBe(1);
  await expect(panel.locator('select[name=serviceId]')).toHaveValue(auditService);
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Ne pas perdre ma publication');
  expect(page.url()).toBe(start);
});

for (const mode of ['lost-response', 'verification-unavailable']) test(`a possibly saved video is never deleted or submitted twice: ${mode}`, async ({ page, context }) => {
  await qaLogin(context, 'provider');
  let removed = 0, calls = 0;
  await page.route(`${api}/storage/v1/upload/resumable**`, route => {
    const body = route.request().postDataBuffer();
    return route.fulfill({ status: 201, headers: { ...tusHeaders, Location: `${api}/storage/v1/upload/resumable/fixture`, 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(body?.length ?? 0) } });
  });
  await page.route(`${api}/storage/v1/object/provider-social-media/**`, route => { if (route.request().method() === 'DELETE') removed++; return route.fulfill({ json: { Key: 'fixture' } }); });
  await page.route(`${api}/storage/v1/object/**`, route => { if (route.request().method() === 'DELETE') removed++; return route.fulfill({ json: [] }); });
  await page.route(`${api}/rest/v1/rpc/create_provider_video_post`, route => { calls++; return mode === 'lost-response' ? route.abort('failed') : route.fulfill({ json: route.request().postDataJSON().target_post_id }); });
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(video);
  await panel.getByLabel('Légende', { exact: true }).fill('Publication à vérifier');
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.locator('input[name=consent]').check();
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Actualiser le Studio', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Publier la vidéo', exact: true })).toBeDisabled();
  expect(calls).toBe(1); expect(removed).toBe(0);
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Publication à vérifier');
});

test('an inactive service is refused before video transfer for public publication', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  let transfers = 0;
  await page.route(`${api}/storage/v1/upload/resumable**`, route => { transfers++; return route.abort(); });
  await page.route(`${api}/rest/v1/provider_services**`, route => route.fulfill({ json: [{ id: auditService, title: 'Prestation en brouillon', is_active: false, duration_minutes: 60, price_amount: 10000, currency: 'XOF', services: null }] }));
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(video);
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.locator('input[name=consent]').check();
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Choisissez une prestation active');
  expect(transfers).toBe(0);
});

test('preview preparation failure can be retried without losing fields or uploading', async ({ page, context }) => {
  test.setTimeout(120000);
  await qaLogin(context, 'provider');
  let transfers = 0;
  await page.route(`${api}/storage/v1/upload/resumable**`, route => { transfers++; return route.abort(); });
  await page.route('**/video-converter/ffmpeg-core.wasm', route => route.fulfill({ status: 503, body: 'synthetic preparation failure' }));
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Légende', { exact: true }).fill('Ma légende reste ici');
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(fileURLToPath(new URL('./fixtures/studio-formats.avi', import.meta.url)));
  const retry = panel.getByRole('button', { name: 'Réessayer la préparation de l’aperçu', exact: true });
  await expect(retry).toBeVisible({ timeout: 30000 });
  await expect(panel.getByRole('button', { name: 'Publier la vidéo', exact: true })).toBeDisabled();
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Ma légende reste ici');
  await page.unroute('**/video-converter/ffmpeg-core.wasm');
  await retry.click();
  await expect(panel.getByLabel('Aperçu de votre vidéo', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(panel.getByLabel('Aperçu de votre vidéo', { exact: true })).toHaveAttribute('poster', /^blob:/);
  await expect(panel.locator('select[name=serviceId]')).toHaveValue(auditService);
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Ma légende reste ici');
  expect(transfers).toBe(0);
});
