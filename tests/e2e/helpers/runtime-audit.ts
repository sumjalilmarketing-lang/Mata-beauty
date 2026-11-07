import { expect, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';

type CspEvent = { disposition: string; effectiveDirective: string; blockedURI: string; documentURI: string };
type Observation = { reportOnlyConsole: string[]; unexpectedConsole: string[]; pageErrors: string[] };
const observations = new WeakMap<Page, Observation>();

export async function startRuntimeAudit(page: Page) {
  const state: Observation = { reportOnlyConsole: [], unexpectedConsole: [], pageErrors: [] };
  observations.set(page, state);
  await page.addInitScript(() => {
    const target = window as typeof window & { __qaCspEvents?: CspEvent[] };
    target.__qaCspEvents = [];
    document.addEventListener('securitypolicyviolation', event => {
      target.__qaCspEvents!.push({ disposition: event.disposition, effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, documentURI: event.documentURI });
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
  expect(events.filter(event => event.disposition === 'enforce'), 'Enforced CSP violations must fail').toEqual([]);
}
