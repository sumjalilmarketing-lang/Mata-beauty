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

it("updates the icon count in the background without suppressing the notification", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const setAppBadge = vi.fn().mockResolvedValue(undefined);
  const clearAppBadge = vi.fn().mockResolvedValue(undefined);
  const showNotification = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync("public/sw.js", "utf8"), { URL, self: {
    navigator: { setAppBadge, clearAppBadge }, location: { origin: "https://mata-beauty.com" },
    addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; },
    registration: { showNotification },
  } });
  let completion: Promise<unknown> | undefined;
  const send = async (unreadCount: number) => { handlers.push({ data: { json: () => ({ unreadCount }) }, waitUntil: (p: Promise<unknown>) => { completion = p; } }); await completion; };
  await send(7); expect(setAppBadge).toHaveBeenCalledWith(7);
  await send(0); expect(clearAppBadge).toHaveBeenCalledOnce();
  setAppBadge.mockRejectedValueOnce(new Error("unsupported"));
  await send(3); expect(showNotification).toHaveBeenCalledTimes(3);
});
