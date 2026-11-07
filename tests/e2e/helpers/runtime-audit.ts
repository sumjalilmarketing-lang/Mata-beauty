import { expect, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';

type CspEvent = { disposition: string; effectiveDirective: string; blockedURI: string; documentURI: string; sourceFile: string; lineNumber: number; columnNumber: number };
type Observation = { reportOnlyConsole: string[]; unexpectedConsole: string[]; pageErrors: string[]; fixtureCspAdapters: { url: string; originalPolicy: string }[] };
const observations = new WeakMap<Page, Observation>();

export async function startRuntimeAudit(page: Page) {
  const state: Observation = { reportOnlyConsole: [], unexpectedConsole: [], pageErrors: [], fixtureCspAdapters: [] };
  observations.set(page, state);
  const fixture = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
  if (!fixture || new URL(fixture).hostname !== '127.0.0.1') throw new Error('Runtime audit requires local isolated fixtures');
  const wsOrigin = fixture.replace(/^http/, 'ws');
  // Functional fixture parity: production permits wss://*.supabase.co, whereas
  // the local HTTP fixture needs its own ws origin. Preserve every other CSP
  // directive and retain the original header. Exact production CSP is tested
  // separately by csp-workspaces.spec.ts without this adapter.
  await page.route('**/*', async route => {
    const request = route.request();
    if (!request.isNavigationRequest() || request.resourceType() !== 'document' || new URL(request.url()).hostname !== '127.0.0.1') return route.fallback();
    const response = await route.fetch({ maxRedirects: 0 });
    const headers = response.headers();
    for (const key of ['content-security-policy', 'content-security-policy-report-only']) {
      const original = headers[key];
      if (original) {
        state.fixtureCspAdapters.push({ url: request.url(), originalPolicy: original });
        headers[key] = original.replace(/(^|;\s*)connect-src\s+([^;]+)/, (_, prefix: string, sources: string) => `${prefix}connect-src ${sources} ${wsOrigin}`);
      }
    }
    await route.fulfill({ response, headers });
  });
  await page.routeWebSocket(`${wsOrigin}/realtime/v1/**`, socket => {
    socket.onMessage(message => {
      const frame = JSON.parse(message.toString()) as Record<string, unknown> | unknown[];
      const array = Array.isArray(frame);
      const event = array ? frame[3] : frame.event;
      if (!['phx_join', 'phx_leave', 'heartbeat'].includes(String(event))) return;
      const payload = (array ? frame[4] : frame.payload) as { config?: { postgres_changes?: Record<string, unknown>[] } } | undefined;
      const filters = payload?.config?.postgres_changes ?? [];
      const reply = { status: 'ok', response: event === 'phx_join' ? { postgres_changes: filters.map((filter, id) => ({ ...filter, id: id + 1 })) } : {} };
      socket.send(JSON.stringify(array
        ? [frame[0], frame[1], frame[2], 'phx_reply', reply]
        : { join_ref: frame.join_ref, ref: frame.ref, topic: frame.topic, event: 'phx_reply', payload: reply }));
    });
  });
  await page.addInitScript(() => {
    const target = window as typeof window & { __qaCspEvents?: CspEvent[] };
    target.__qaCspEvents = [];
    document.addEventListener('securitypolicyviolation', event => {
      target.__qaCspEvents!.push({ disposition: event.disposition, effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, documentURI: event.documentURI, sourceFile: event.sourceFile, lineNumber: event.lineNumber, columnNumber: event.columnNumber });
    });
  });
  page.on('pageerror', error => state.pageErrors.push(error.message));
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Public CSP report-only is an intentional observed candidate, not an
    // execution block. Preserve these messages; never ignore enforced CSP.
    if (/^\[Report Only\]/i.test(text) && /Content[ -]Security[ -]Policy/i.test(text)) state.reportOnlyConsole.push(text);
    else if (!text.includes('Failed to load resource')) state.unexpectedConsole.push(text);
  });
}

export async function finishRuntimeAudit(page: Page, info: TestInfo) {
  const state = observations.get(page);
  if (!state) return;
  const events = page.isClosed() ? [] : await page.evaluate(() => (window as typeof window & { __qaCspEvents?: CspEvent[] }).__qaCspEvents ?? []).catch(() => [] as CspEvent[]);
  await info.attach('runtime-csp-observations', { body: JSON.stringify({ ...state, securityPolicyViolations: events }, null, 2), contentType: 'application/json' });
  expect(state.pageErrors, 'Uncaught page errors must fail').toEqual([]);
  expect(state.unexpectedConsole, 'Unexpected runtime console errors (report-only CSP retained separately)').toEqual([]);
  // Playwright UtilityScript.evaluate uses global.eval; Chrome emits an eval
  // denial for injected evaluations even when no app execution fails. Retain
  // these observations for attribution, without declaring them app defects.
  // All other enforced violations and all runtime/console errors still fail.
  expect(events.filter(event => event.disposition === 'enforce' && event.blockedURI !== 'eval'), 'Enforced non-automation CSP violations must fail').toEqual([]);
}
