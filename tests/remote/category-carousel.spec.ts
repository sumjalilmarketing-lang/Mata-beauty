import { expect, test, type Page } from "@playwright/test";
import { categoryVisuals } from "../../lib/catalog/category-media";

async function prepare(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mata-launch-welcome", "done"));
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) await page.setExtraHTTPHeaders({ "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET });
  // Isolate editorial visual acceptance; professional provenance is tested separately.
  await page.route("**/rest/v1/provider_profiles?*", route => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/rest/v1/rpc/record_product_event", route => route.fulfill({ contentType: "application/json", body: "null" }));
  await page.goto("/discover");
  await expect(page.locator(".category-carousel")).toHaveCount(11, { timeout: 20000 });
}

test("all editorial images retain their category at mobile, tablet and desktop sizes", async ({ page }) => {
  test.setTimeout(150000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepare(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[390,844], [768,1024], [1366,768], [1440,900], [1920,1080]]) {
    await page.setViewportSize({ width, height });
    for (const slug of Object.keys(categoryVisuals)) {
      const card = page.locator(`[data-category="${slug}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator("img").first()).toHaveJSProperty("naturalWidth", 640);
      const box = await card.boundingBox();
      const before = await card.getAttribute("data-current-media");
      await card.press("ArrowRight");
      await expect(card).not.toHaveAttribute("data-current-media", before!);
      await expect(card.locator("img")).toHaveCount(1);
      await expect(card.locator("img")).toHaveJSProperty("naturalWidth", 640);
      await expect(card.locator("img")).toHaveCSS("opacity", "1");
      expect(await card.getAttribute("data-current-media")).toContain(`/images/categories/${slug}-`);
      expect((await card.boundingBox())?.height).toBe(box?.height);
      await card.screenshot({ path: `work/category-audit/${width}-${slug}.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.mouse.wheel(0, -3000);
    for (const card of await page.locator(".category-carousel").all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator("img")).toHaveCSS("opacity", "1");
    }
    await page.locator(".photo-category-grid").screenshot({ path: `work/category-audit/grid-${width}.png` });
  }
  expect(errors).toEqual([]);
});

test("reduced motion, manual swipe, category click and browser back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await prepare(page);
  const card = page.locator('[data-category="locks"]');
  await card.scrollIntoViewIfNeeded(); const original = await card.getAttribute("data-current-media");
  await page.waitForTimeout(10000); await expect(card).toHaveAttribute("data-current-media", original!);
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .2, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  await expect(card).not.toHaveAttribute("data-current-media", original!);
  await expect(page).toHaveURL(/\/discover$/);
  await card.click(); await expect(page).toHaveURL(/category=Locks/);
  await page.goBack(); await expect(page.getByRole("heading", { name: "Catégories populaires" })).toBeVisible();
});

test("slow or unavailable next image never removes the current image", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await prepare(page);
  const card = page.locator('[data-category="locks"]'); await card.scrollIntoViewIfNeeded();
  await expect(card.locator("img")).toHaveJSProperty("naturalWidth", 640);
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/locks-2.webp", async route => { await gate; await route.continue(); });
  await card.press("ArrowRight"); await page.waitForTimeout(1500);
  await expect(card).toHaveAttribute("data-current-media", /locks-1/);
  await expect(card.locator("img").first()).toBeVisible(); release!();
  await expect(card).toHaveAttribute("data-current-media", /locks-2/);
  await page.unroute("**/locks-2.webp");
  await page.route("**/locks-1.webp", route => route.fulfill({ status: 404, body: "QA intentional unavailable image" }));
  await card.press("ArrowRight"); await page.waitForTimeout(1000);
  await expect(card).toHaveAttribute("data-current-media", /locks-2/);
  await expect(card.locator("img")).toHaveCount(1);
  await expect(card.locator("img")).toBeVisible();
});

test("mobile touch swipe changes the image without opening the category", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.REMOTE_APP_URL ?? "http://localhost:3100", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" }); await prepare(page);
    const card = page.locator('[data-category="locks"]'); await card.scrollIntoViewIfNeeded();
    const before = await card.getAttribute("data-current-media");
    const box = (await card.boundingBox())!;
    const session = await context.newCDPSession(page);
    const y = box.y + box.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width * .9, y }] });
    for (let step = 1; step <= 8; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * (.9 - step * .1), y }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(card).not.toHaveAttribute("data-current-media", before!);
    await expect(page).toHaveURL(/\/discover$/);
    await card.tap(); await expect(page).toHaveURL(/category=Locks/);
  } finally { await context.close(); }
});

test("visible cards rotate separately, pause offscreen and allow clicks during a transition", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" }); await prepare(page);
  const cards = page.locator(".category-carousel");
  await page.mouse.move(0,0);
  await expect.poll(() => page.locator('.category-carousel[data-current-media$="-2.webp"]').count(), { timeout: 18000 }).toBeGreaterThan(0);
  expect(await page.locator(".category-photo-next").count()).toBeLessThanOrEqual(1);
  await page.mouse.wheel(0, 5000); await page.waitForTimeout(1000);
  const first = cards.first();
  expect((await first.boundingBox())!.y + (await first.boundingBox())!.height).toBeLessThan(0);
  const offscreen = await first.getAttribute("data-current-media");
  await page.waitForTimeout(5000); await expect(first).toHaveAttribute("data-current-media", offscreen!);
  await page.mouse.wheel(0, -5000);
  await page.getByRole("button", { name: "Mettre les images en pause" }).click();
  await page.waitForTimeout(900);
  const paused = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-current-media")));
  await page.waitForTimeout(4000);
  expect(await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-current-media")))).toEqual(paused);
  const card = cards.first(); await card.press("ArrowRight");
  await expect(card.locator(".category-photo-next")).toBeAttached();
  await card.click(); await expect(page).toHaveURL(/screen=results/);
});
