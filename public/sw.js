// PropMind service worker.
// Назначение: web-push уведомления + кэш тяжёлых ассетов.
// Навигации НЕ перехватываем: на iOS fetch(navigate) внутри SW
// ненадёжен и давал белый экран при переходах по меню.
const CACHE = "propmind-assets-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    self.clients
      .claim()
      .then(() =>
        caches.keys().then((keys) =>
          Promise.all(
            keys.filter((k) => k.startsWith("propmind-") && k !== CACHE).map((k) => caches.delete(k))
          )
        )
      )
  )
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  // кэшируем только тяжёлые ассеты; html и API — напрямую
  if (!req.url.includes("/assets/") && !req.url.includes("/video/")) return;
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
});

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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
