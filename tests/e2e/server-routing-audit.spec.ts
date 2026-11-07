import { test, expect } from '@playwright/test';
import { qaSession } from './helpers/qa-session';
function cookie(role: string, fault = false) { return 'sb-127-auth-token=base64-' + Buffer.from(JSON.stringify(qaSession(role, fault))).toString('base64url'); }

// HTTP-only end-to-end: real Next router → real local HTTP fixture.
// These tests do not claim browser/hydration/click coverage.
for (const [role, route] of [
  ['client', '/app/feed/qa-inexistant'], ['client', '/app/settings/qa-inexistant'],
  ['provider', '/pro/services/qa-inexistant'], ['provider', '/salon/services/qa-inexistant'],
  ['staff', '/staff/services/qa-inexistant'], ['commercial_manager', '/commercial/crm/qa-inexistant'],
  ['finance_manager', '/finance/transactions/qa-inexistant'], ['support_manager', '/support-agent/tickets/qa-inexistant'],
  ['hr_manager', '/admin/hr/time/qa-inexistant'], ['verification_agent', '/onboarding/new/qa-inexistant'],
  ['moderator', '/moderation/videos/qa-inexistant'], ['content_manager', '/operations/categories/qa-inexistant'],
]) test(`QA-N01 HTTP: ${route}`, async ({ request }) => {
  const response = await request.get(route, { headers: { cookie: cookie(role) }, maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain('Cette page n’existe pas');
});

test('QA-N02 HTTP: profile500 maps to unavailable', async ({ request }) => {
  const response = await request.get('/auth/workspace', { headers: { cookie: cookie('client', true) }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain('auth_error=workspace_unavailable');
});

test('anonymous protected route redirects to authentication', async ({ request }) => {
  const response = await request.get('/finance/transactions', { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers().location).toContain('connexion=requise');
});

test('client does not receive finance workspace', async ({ request }) => {
  const response = await request.get('/finance/transactions', { headers: { cookie: cookie('client') }, maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers().location).toContain('acces=refuse');
});

test('unknown top-level route has a real404 and return link', async ({ request }) => {
  const response = await request.get('/qa-completely-unknown-path');
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain('Cette page n’existe pas');
  expect(await response.text()).toContain('Retour à l’accueil');
});

for (const [legacy, destination] of [['/forgot-password', '/?auth=reset'], ['/posts/66666666-6666-4666-8666-666666666666', '/video/66666666-6666-4666-8666-666666666666']]) test(`legacy redirect ${legacy}`, async ({ request }) => {
  const response = await request.get(legacy, { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers().location).toContain(destination);
});
