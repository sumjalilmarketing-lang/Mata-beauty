import { expect, type Page } from "@playwright/test";

export async function checkWheel(page: Page, width: number, height: number) {
  await page.mouse.move(width - 90, Math.floor(height / 2));
  const canScroll = await page.evaluate(({ x, y }) => {
    let element = document.elementFromPoint(x, y);
    while (element) {
      if (element.scrollHeight > element.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(element).overflowY)) return true;
      element = element.parentElement;
    }
    return (document.scrollingElement?.scrollHeight ?? 0) > innerHeight + 5;
  }, { x: width - 90, y: Math.floor(height / 2) });
  if (!canScroll) return; // This viewport fits the page; no scroll is required.
  const position = () => page.evaluate(() => Array.from(document.querySelectorAll("*")).filter(element => !element.closest(".admin-sidebar,.workspace-sidebar")).reduce((sum, element) => sum + element.scrollTop, 0));
  await page.mouse.wheel(0, -20000);
  await expect.poll(position).toBe(0);
  const initial = await position();
  await page.mouse.wheel(0, 900);
  await expect.poll(position).toBeGreaterThan(initial);
  await page.mouse.wheel(0, -20000);
  await expect.poll(position).toBeLessThanOrEqual(initial);
}
