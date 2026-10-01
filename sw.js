// PropMind service worker: приём и показ web-push уведомлений
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
