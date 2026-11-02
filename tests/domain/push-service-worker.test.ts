import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("shows background push with sound preference and blocks external click destinations", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync("public/sw.js", "utf8"), { URL, self: {
    location: { origin: "https://mata-beauty.com" },
    addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; },
    registration: { showNotification }, clients: { matchAll: async () => [], openWindow },
  } });
  let completion: Promise<unknown> | undefined;
  handlers.push({ data: { json: () => ({ body: "Nouvelle réservation", silent: true, url: "https://attacker.example/app/bookings" }) }, waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
  await completion;
  expect(showNotification).toHaveBeenCalledWith("Mata Beauty", expect.objectContaining({ silent: true, data: { url: "/app/notifications" } }));
  handlers.notificationclick({ notification: { close: vi.fn(), data: { url: "//attacker.example/app" } }, waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
  await completion;
  expect(openWindow).toHaveBeenCalledWith("https://mata-beauty.com/app/notifications");
});
