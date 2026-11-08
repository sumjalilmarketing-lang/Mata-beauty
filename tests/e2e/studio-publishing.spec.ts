import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { qaLogin, qaSession } from './helpers/qa-session';
import { auditService } from './fixtures/provider-audit.mjs';
import { fileURLToPath } from 'node:url';
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
const tusHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Location,Upload-Offset,Upload-Length,Tus-Resumable', 'Tus-Resumable': '1.0.0' };
test.beforeEach(async ({ page }) => {
  // UI fixture only: real byte decoding and attestation are tested separately.
  await page.route('**/api/studio/validate-video', route => route.fulfill({ json: { ok: true } }));
  const thumbnail = (await sharp({ create: { width: 4, height: 4, channels: 3, background: "pink" } }).jpeg().toBuffer()).toString('base64');
  await page.route('**/_qa/normalized.mp4', route => route.fulfill({ path: fileURLToPath(new URL('./fixtures/studio-formats.mov', import.meta.url)), contentType: 'video/mp4' }));
  await page.route('**/api/studio/prepare-video', route => {
    const id = route.request().postDataJSON().preparationId;
    return route.fulfill({ json: { ok: true, postId: id, videoPath: `${qaSession('provider').user.id}/${id}/video.mp4`, previewUrl: new URL('/_qa/normalized.mp4', route.request().url()).href, duration: 2, aspectRatio: 2 / 3, thumbnail } });
  });
  page.on('requestfailed' , request => console.log('STUDIO_REQUEST_FAILURE', request.method(), new URL(request.url()).pathname, request.failure()?.errorText)); });
test.afterEach(async ({ page }, info) => { if (info.status !== info.expectedStatus) console.log('STUDIO_FAILURE_STATE', (await page.locator('#video-publisher').innerText().catch(() => 'panel unavailable')).slice(-2500)); });
const video = fileURLToPath(new URL('./fixtures/studio-long.mp4', import.meta.url));

async function openStudio(page: Page, path = '/pro/videos', posts: unknown[] = []) {
  await page.route(`${api}/rest/v1/posts**`, route => route.fulfill({ json: posts }));
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Montrez votre talent' })).toBeVisible();
}

for (const format of ['mp4', 'avi', 'mkv', 'mov']) test(`video ${format}, service and hashtags remain together with no duration cap or navigation`, async ({ page, context }) => {
  test.setTimeout(120000);
  const session = await qaLogin(context, 'provider');
  await page.route('**/video-converter/**', route => route.abort('failed'));
  let published: Record<string, unknown> | null = null;
  const savedPublication = () => published;
  await page.route(`${api}/storage/v1/object/provider-social-media/**`, route => route.fulfill({ json: { Key: 'fixture' } }));
  await page.route(`${api}/storage/v1/object/sign/provider-social-media/**`, route => route.fulfill({ json: { signedURL: '/object/sign/provider-social-media/fixture?token=synthetic' } }));
  await page.route(`${api}/rest/v1/rpc/create_provider_video_post`, route => { published = route.request().postDataJSON(); return route.fulfill({ json: published!.target_post_id }); });
  await page.route(`${api}/rest/v1/social_feed**`, route => route.fulfill({ json: { id: published?.target_post_id, provider_service_id: auditService } }));
  await openStudio(page);
  await page.route(`${api}/rest/v1/posts**`, route => {
    if (!new URL(route.request().url()).searchParams.has('id')) return route.fulfill({ json: published ? [{ id: published.target_post_id, post_type: 'video', title: 'Vidéo longue', caption: 'Test', status: 'published', thumbnail_url: null, view_count: 0, like_count: 0, comment_count: 0, published_at: new Date().toISOString(), created_at: new Date().toISOString() }] : [] });
    return route.fulfill({ json: { id: published?.target_post_id, status: 'published', visibility: 'public', published_at: new Date().toISOString(), post_services: [{ provider_service_id: auditService, is_primary: true }], social_post_media: [{ bucket_id: 'provider-social-media', storage_path: published?.target_video_path, thumbnail_path: published?.target_thumbnail_path }] } });
  });
  const start = page.url();
  const panel = page.locator('#video-publisher');
  const transfer = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === `${api}/storage/v1/upload/resumable`);
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
  const transferResponse = await transfer;
  const location = (await transferResponse.allHeaders()).location;
  await expect.poll(() => published?.target_duration_seconds, { timeout: 90000 }).toBeGreaterThan(format === 'mp4' ? 90 : 0);
  expect(String(savedPublication()?.target_video_path)).toMatch(format === 'mov' ? /video[.]mov$/ : /video[.]mp4$/);
  expect(savedPublication()?.target_hashtags).toEqual(['#tresses', '#dakar']);
  expect(String(savedPublication()?.target_video_path)).toContain(session.user.id);
  const transferred = await page.request.head(location);
  const receivedBytes = Number(transferred.headers()["upload-offset"]);
  expect(receivedBytes).toBeGreaterThan(0);
  expect(receivedBytes).toBe(Number(transferred.headers()["upload-length"]));
  await expect(page.getByText('Vidéo longue', { exact: true })).toBeVisible();
  expect(page.url()).toBe(start);
});

test('an expired upload session is distinguished from network failure and preserves details', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  await page.route(`${api}/storage/v1/upload/resumable**`, route => route.fulfill({ status: 401, json: { message: 'synthetic expired session' } }));
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(video);
  await panel.getByLabel('Légende', { exact: true }).fill('Description conservée');
  await panel.getByText('Options de publication', { exact: true }).click();
  await panel.locator('select[name=status]').selectOption('draft');
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Votre session a expiré');
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Description conservée');
  await expect(panel.locator('video')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Publier la vidéo', exact: true })).toBeEnabled();
});

test('le Studio renvoie la gestion des prestations vers l’espace Salon', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  await openStudio(page, '/pro/videos');
  const panel = page.locator('#video-publisher');
  await expect(panel.getByRole('button', { name: /Ajouter une prestation dans le Studio/ })).toHaveCount(0);
  const catalogLink = panel.getByRole('link', { name: 'Gérer les prestations dans l’espace Salon' });
  await expect(catalogLink).toHaveAttribute('href', '/salon/services');
  await catalogLink.click();
  await expect(page).toHaveURL(/\/salon\/services$/);
  await expect(page.getByRole('heading', { name: 'Prestations', exact: true })).toBeVisible();
});

test('une prestation non publiée se valide depuis Salon, jamais depuis le Studio', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  await openStudio(page, '/pro/videos', [{
    id: '11111111-1111-4111-8111-111111111111',
    post_type: 'video',
    title: 'Publication liée à une prestation en brouillon',
    caption: '',
    status: 'published',
    thumbnail_url: null,
    view_count: 0,
    like_count: 0,
    comment_count: 0,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    post_services: [{
      is_primary: true,
      provider_services: { id: auditService, status: 'draft', is_active: false, archived_at: null },
    }],
  }]);
  await page.getByRole('button', { name: 'Mes vidéos', exact: true }).click();
  const post = page.locator('.studio-post-grid article').filter({ hasText: 'Publication liée à une prestation en brouillon' });
  await expect(post.getByRole('link', { name: 'Vérifier et publier la prestation dans l’espace Salon' })).toHaveAttribute('href', '/salon/services');
  await expect(post.getByRole('button', { name: /Publier la prestation/ })).toHaveCount(0);
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

test('a saved video does not claim bookable delivery when its service becomes private', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  await page.route('**/video-converter/**', route => route.abort());
  let published: Record<string, unknown> | undefined;
  let removed = 0;
  await page.route(`${api}/storage/v1/object/provider-social-media**`, route => { if (route.request().method() === 'DELETE') removed++; return route.fulfill({ json: { Key: 'fixture' } }); });
  await page.route(`${api}/rest/v1/rpc/create_provider_video_post`, route => { published = route.request().postDataJSON(); return route.fulfill({ json: published!.target_post_id }); });
  await page.route(`${api}/rest/v1/social_feed**`, route => route.fulfill({ json: { id: published?.target_post_id, provider_service_id: null } }));
  await page.route(`${api}/rest/v1/posts**`, route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('id') ? {
    id: published?.target_post_id, status: 'published', visibility: 'public', published_at: new Date().toISOString(), post_services: [{ provider_service_id: auditService, is_primary: true }], social_post_media: [{ bucket_id: 'provider-social-media', storage_path: published?.target_video_path, thumbnail_path: published?.target_thumbnail_path }],
  } : [] }));
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(fileURLToPath(new URL('./fixtures/studio-formats.avi', import.meta.url)));
  await expect(panel.getByLabel('Aperçu de votre vidéo', { exact: true })).toBeVisible();
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.locator('input[name=consent]').check();
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Actualiser le Studio', exact: true })).toBeVisible();
  await expect(panel.getByRole('status')).toContainText('La vidéo est enregistrée');
  expect(published).toBeDefined(); expect(removed).toBe(0);
});

for (const active of [false, true]) test(`a draft service (legacy active=${active}) is refused before video transfer`, async ({ page, context }) => {
  await qaLogin(context, 'provider');
  let transfers = 0;
  await page.route(`${api}/storage/v1/upload/resumable**`, route => { transfers++; return route.abort(); });
  await page.route(`${api}/rest/v1/provider_services**`, route => route.fulfill({ json: [{ id: auditService, title: 'Prestation en brouillon', is_active: active, status: 'draft', archived_at: null, duration_minutes: 60, price_amount: 10000, currency: 'XOF', services: null }] }));
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(video);
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.locator('input[name=consent]').check();
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Choisissez une prestation active et publiée');
  expect(transfers).toBe(0);
});

test('preview preparation failure can be retried without losing fields or publishing', async ({ page, context }) => {
  test.setTimeout(120000);
  await qaLogin(context, 'provider');
  let transfers = 0;
  await page.route(`${api}/storage/v1/upload/resumable**`, route => { transfers++; return route.fulfill({ status: 201, headers: { ...tusHeaders, Location: `${api}/storage/v1/upload/resumable/fixture`, 'Upload-Offset': String(route.request().postDataBuffer()?.length ?? 0) } }); });
  let failed = true;
  await page.route('**/api/studio/prepare-video', route => failed ? route.fulfill({ status: 503, json: { error: { message: 'Préparation indisponible. Réessayez.' } } }) : route.fallback());
  await openStudio(page);
  const panel = page.locator('#video-publisher');
  await panel.getByLabel('Légende', { exact: true }).fill('Ma légende reste ici');
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.getByLabel('Choisir une photo ou une vidéo', { exact: true }).setInputFiles(fileURLToPath(new URL('./fixtures/studio-formats.avi', import.meta.url)));
  const retry = panel.getByRole('button', { name: 'Réessayer la préparation de l’aperçu', exact: true });
  await expect(retry).toBeVisible({ timeout: 30000 });
  await expect(panel.getByRole('button', { name: 'Publier la vidéo', exact: true })).toBeDisabled();
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Ma légende reste ici');
  failed = false;
  await retry.click();
  await expect(panel.getByLabel('Aperçu de votre vidéo', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(panel.getByLabel('Aperçu de votre vidéo', { exact: true })).toHaveAttribute('poster', /^blob:/);
  await expect(panel.locator('select[name=serviceId]')).toHaveValue(auditService);
  await expect(panel.getByLabel('Légende', { exact: true })).toHaveValue('Ma légende reste ici');
  expect(transfers).toBe(2);
});

test('a late abandoned preparation cannot delete the newer published video', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  const preparations: string[] = [], removed: string[] = [];
  let releaseFirst: (() => Promise<void>) | undefined;
  let sourceDeletes = 0;
  let published: Record<string, unknown> | undefined;
  page.on('request', request => { if (request.url().endsWith('/api/studio/prepare-video')) preparations.push(request.postDataJSON().preparationId); });
  await page.route(`${api}/storage/v1/object/studio-video-inputs`, async route => {
    if (route.request().method() === 'DELETE' && ++sourceDeletes === 1) { releaseFirst = () => route.fulfill({ json: [] }); return; }
    await route.fulfill({ json: [] });
  });
  await page.route(`${api}/storage/v1/object/provider-social-media**`, route => {
    if (route.request().method() === 'DELETE') removed.push(...route.request().postDataJSON().prefixes);
    return route.fulfill({ json: { Key: 'fixture' } });
  });
  await page.route(`${api}/storage/v1/object/sign/provider-social-media/**`, route => route.fulfill({ json: { signedURL: '/object/sign/provider-social-media/fixture?token=synthetic' } }));
  await page.route(`${api}/rest/v1/rpc/create_provider_video_post`, route => { published = route.request().postDataJSON(); return route.fulfill({ json: published!.target_post_id }); });
  await page.route(`${api}/rest/v1/social_feed**`, route => route.fulfill({ json: { id: published?.target_post_id, provider_service_id: auditService } }));
  await openStudio(page);
  await page.route(`${api}/rest/v1/posts**`, route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('id') ? {
    id: published?.target_post_id, status: 'published', visibility: 'public', published_at: new Date().toISOString(), post_services: [{ provider_service_id: auditService, is_primary: true }], social_post_media: [{ bucket_id: 'provider-social-media', storage_path: published?.target_video_path, thumbnail_path: published?.target_thumbnail_path }],
  } : [] }));
  const panel = page.locator('#video-publisher'), picker = panel.getByLabel('Choisir une photo ou une vidéo', { exact: true });
  await picker.setInputFiles(fileURLToPath(new URL('./fixtures/studio-formats.avi', import.meta.url)));
  await expect.poll(() => Boolean(releaseFirst)).toBe(true);
  await picker.setInputFiles(fileURLToPath(new URL('./fixtures/studio-formats.mkv', import.meta.url)));
  await expect(panel.getByLabel('Aperçu de votre vidéo', { exact: true })).toBeVisible();
  await releaseFirst!();
  await expect.poll(() => removed.some(path => path.includes(preparations[0]))).toBe(true);
  await panel.locator('select[name=serviceId]').selectOption(auditService);
  await panel.locator('input[name=consent]').check();
  await panel.getByRole('button', { name: 'Publier la vidéo', exact: true }).click();
  await expect.poll(() => published?.target_post_id).toBe(preparations[1]);
  await expect(panel.getByLabel('Aperçu de votre vidéo', { exact: true })).toHaveCount(0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(removed.some(path => path.includes(preparations[1]))).toBe(false);
});
