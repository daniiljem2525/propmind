// PropMind service worker: приём и показ web-push уведомлений
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    self.clients
      .claim()
      .then(() =>
        caches.keys().then((keys) =>
          Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("propmind-")).map((k) => caches.delete(k)))
        )
      )
  )
);
const CACHE = "propmind-runtime-v1";

self.addEventListener("push", (event) => {
  let data = { title: "PropMind", body: "Новое уведомление", url: "/app" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || "propmind",
      data: { url: data.url },
    })
  );
});

// Кэш: хэшированные ассеты — cache-first, html — network-first
const CACHE = "propmind-runtime-v1";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  if (req.url.includes("/rest/v1") || req.url.includes("/auth/v1") || req.url.includes("/functions/v1")) return;

  const isAsset = req.url.includes("/assets/") || req.url.includes("/video/");

  if (isAsset) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // html: сначала сеть, при офлайне — кэш
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // url может быть относительным (/app) — резолвим от корня приложения
  const url = new URL(
    (event.notification.data && event.notification.data.url) || "/app",
    self.registration.scope
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.startsWith(self.location.origin)) {
            client.focus();
            if (client.navigate) client.navigate(url).catch(() => {});
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
