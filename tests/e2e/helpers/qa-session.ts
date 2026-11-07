import { expect, type BrowserContext } from '@playwright/test';
import { syntheticSession } from '../fixtures/department-workspaces.mjs';
export function qaSession(role: string, profileFailure = false) {
  const endpoint = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
  expect(endpoint, 'This audit requires the isolated fixture runner').toBeTruthy();
  expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  const session = syntheticSession(role);
  if (profileFailure) {
    const parts = session.access_token.split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, unknown>;
    claims.fixture_profile_error = true;
    parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
    session.access_token = parts.join('.');
  }
  return session;
}
export async function qaLogin(context: BrowserContext, role: string, profileFailure = false) {
  const session = qaSession(role, profileFailure);
  await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
  return session;
}
