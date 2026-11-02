const CACHE_NAME = "mata-beauty-shell-v2";
const SAFE_ASSETS = ["/offline", "/brand/icon-192.png", "/brand/mata-app-icon.webp", "/images/categories/mata-category-atlas.webp"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SAFE_ASSETS)));
  self.skipWaiting();
});

function pushDestination(value) {
  if (typeof value !== "string") return "/app/notifications";
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && /^\/(app|pro|salon|staff)(\/|$)/.test(url.pathname) ? url.href : "/app/notifications";
  } catch { return "/app/notifications"; }
}
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const data = event.data?.json();
    payload = data && typeof data === "object" ? data : {};
  } catch { /* Still show a user-visible notification. */ }
  event.waitUntil(self.registration.showNotification("Mata Beauty", {
    body: typeof payload.body === "string" ? payload.body.slice(0, 240) : "Vous avez une nouvelle notification. Ouvrez Mata Beauty.",
    icon: "/brand/icon-192.png",
    badge: "/brand/icon-192.png",
    tag: typeof payload.tag === "string" ? payload.tag : "mata-notification",
    silent: payload.silent === true,
    data: { url: pushDestination(payload.url) },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(pushDestination(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.navigate(target);
      await client.focus();
      return;
    }
    await self.clients.openWindow(target);
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline")));
    return;
  }
  if (SAFE_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
