import { test, expect, type Page } from '@playwright/test';
import { qaLogin } from './helpers/qa-session';

// Fail a blocked click explicitly instead of consuming the entire crawl budget.
test.use({ actionTimeout: 10_000, navigationTimeout: 15_000 });

type LinkEvidence = { source: string; href: string; action: string; finalUrl?: string; status?: number };
const cases = [
  ['anonymous', '/'], ['client', '/app/profile'], ['provider', '/pro'], ['provider', '/salon'],
  ['staff', '/staff'], ['commercial_manager', '/commercial'], ['finance_manager', '/finance'],
  ['support_manager', '/support-agent'], ['hr_manager', '/admin/hr'],
  ['verification_agent', '/onboarding'], ['moderator', '/moderation'], ['content_manager', '/operations'],
  ['super_admin', '/admin'],
] as const;

async function healthy(page: Page) {
  await expect(page.locator('body')).not.toHaveText(/^\s*$/);
  await expect(page.getByRole('heading', { name: 'Cette page n’existe pas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Un problème est survenu', exact: true })).toHaveCount(0);
  await expect(page.getByText('Application error: a client-side exception has occurred', { exact: false })).toHaveCount(0);
}

for (const [role, seed] of cases) test(`internal links: ${role} ${seed}`, async ({ page, context }, info) => {
  test.setTimeout(300_000);
  if (role !== 'anonymous') await qaLogin(context, role);
  const base = new URL(String(info.project.use.baseURL));
  expect(base.hostname, 'Never run the click crawler against production').toBe('127.0.0.1');
  const crashes: string[] = [];
  context.on('page', p => p.on('pageerror', e => crashes.push(e.message)));
  page.on('pageerror', e => crashes.push(e.message));
  const seedResponse = await page.goto(seed);
  expect(seedResponse?.status()).toBeLessThan(400);
  await healthy(page);
  await expect(page.locator('main')).toBeVisible();
  // Wait for hydration/auth route links. Capture mobile menu entries explicitly.
  if (role !== 'anonymous') await expect.poll(() => page.locator('a[href]').count()).toBeGreaterThan(0);
  const queue = [new URL(seed, base).href], visited = new Set<string>(), evidence: LinkEvidence[] = [];
  const checkedTargets = new Map<string, { status: number; finalUrl: string }>();
  const scope = seed.startsWith('/app/') ? '/app' : seed === '/' ? '/' : seed;
  try {
    while (queue.length) {
      const source = queue.shift()!;
      if (visited.has(source)) continue;
      expect(visited.size, 'Unbounded navigation graph; investigate rather than silently truncate').toBeLessThan(300);
      visited.add(source);
      const response = await page.goto(source);
      expect(response?.status(), source).toBeLessThan(400);
      await healthy(page);
      const more = page.getByRole('button', { name: 'Plus', exact: true });
      if (await more.count() && await more.isVisible()) await more.click();
      const links = await page.locator('a[href]').evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute('href') ?? ''))]);
      for (const raw of links) {
        if (!raw || /^(mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
        const target = new URL(raw, source);
        if (target.origin !== base.origin) continue;
        expect(target.href, `${source}: invalid identifier`).not.toMatch(/\/(undefined|null)(?:[/?#]|$)/);
        if (target.hash && target.pathname === new URL(source).pathname && target.search === new URL(source).search) {
          await page.goto(source);
          const hash = decodeURIComponent(target.hash.slice(1));
          if (hash) expect(await page.evaluate(id => Boolean(document.getElementById(id) || document.getElementsByName(id).length), hash), `${source} → ${raw}`).toBe(true);
          evidence.push({ source, href: raw, action: 'fragment target checked' });
          continue;
        }
        // Token consumers, APIs and downloads are not generic navigation. Explicitly
        // record them; do not trigger invitations/logout or mutate via a GET URL.
        if (/^\/(api\/|auth\/(confirm|callback))/.test(target.pathname) || /\.(pdf|png|svg|webmanifest|csv|zip)$/.test(target.pathname) || target.searchParams.has('token') || target.searchParams.has('token_hash')) {
          evidence.push({ source, href: raw, action: 'separate token/action/resource test required' });
          continue;
        }
        const cached = checkedTargets.get(target.href);
        if (cached) {
          evidence.push({ source, href: raw, action: 'same destination previously checked; this instance not clicked', ...cached });
          continue;
        }
        const check = await context.request.get(target.href);
        expect(check.status(), `${source} → ${raw}`).toBeLessThan(400);
        checkedTargets.set(target.href, { status: check.status(), finalUrl: check.url() });
        await page.goto(source);
        const selector = `a[href=${JSON.stringify(raw)}]`;
        let anchor = page.locator(selector).filter({ visible: true }).first();
        if (!await anchor.isVisible()) {
          const menu = page.getByRole('button', { name: 'Plus', exact: true });
          if (await menu.count() && await menu.isVisible()) await menu.click();
        }
        // CSS-translated Super Admin drawer links have boxes but are outside
        // the viewport. Open the real drawer instead of force-clicking them.
        const box = await anchor.boundingBox();
        const viewport = page.viewportSize();
        if (box && viewport && (box.x + box.width <= 0 || box.x >= viewport.width)) {
          const adminMenu = page.getByRole('button', { name: 'Ouvrir le menu', exact: true });
          if (await adminMenu.count() && await adminMenu.isVisible()) await adminMenu.click();
        }
        const openMore = page.locator('#workspace-more-menu[open]');
        if (await openMore.count()) {
          const modalAnchor = openMore.locator(selector).filter({ visible: true }).first();
          if (await modalAnchor.isVisible()) anchor = modalAnchor;
          else await openMore.getByRole('button', { name: 'Fermer le menu', exact: true }).click();
        }
        let destination = page;
        if (await anchor.isVisible()) {
          const popupExpected = await anchor.getAttribute('target') === '_blank';
          if (popupExpected) { const popup = context.waitForEvent('page'); await anchor.click(); destination = await popup; await destination.waitForLoadState('domcontentloaded'); }
          else { await anchor.click(); await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(new URL(check.url()).pathname + new URL(check.url()).search); }
          await healthy(destination);
          evidence.push({ source, href: raw, action: 'actual visible click + GET', finalUrl: destination.url(), status: check.status() });
          if (destination !== page) await destination.close();
        } else evidence.push({ source, href: raw, action: 'GET only; hidden link not clicked', finalUrl: check.url(), status: check.status() });
        // Recurse inside this workspace only; out-of-scope links were still checked.
        if ((scope === '/' ? /^\/(legal|conseils)(\/|$)/.test(target.pathname) : target.pathname === scope || target.pathname.startsWith(scope + '/')) && !visited.has(target.href) && !queue.includes(target.href)) queue.push(target.href);
      }
    }
    expect(crashes).toEqual([]);
  } finally { await info.attach('internal-link-evidence', { body: JSON.stringify({ role, seed, visited: [...visited], evidence, crashes }, null, 2), contentType: 'application/json' }); }
});
