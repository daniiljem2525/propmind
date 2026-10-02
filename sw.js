// Arendora service worker.
// Назначение: мгновенный холодный старт PWA + web-push + кэш ассетов.
// Оболочка (index.html) отдаётся из кэша сразу, свежая версия подкачивается
// в фоне и применяется со следующего запуска (stale-while-revalidate).
// Навигации ВСЕГДА получают валидный ответ: кэш → сеть → сообщение,
// белого экрана быть не может (урок фиксa «без перехвата навигаций»).
const CACHE = "arendora-shell-v2";

self.addEventListener("install", (e) => {
  // Прогреваем оболочку сразу при установке воркера — тогда
  // уже следующий запуск приложения открывается мгновенно
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add("./index.html").catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) =>
  e.waitUntil(
    self.clients
      .claim()
      .then(() =>
        caches.keys().then((keys) =>
          Promise.all(
            keys.filter((k) => (k.startsWith("arendora-") || k.startsWith("propmind-")) && k !== CACHE).map((k) => caches.delete(k))
          )
        )
      )
  )
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  // Оболочка приложения: любой навигационный запрос отвечаем сохранённым
  // index.html (SPA сам разрулит маршрут), параллельно обновляя кэш.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const shell =
          (await cache.match("./index.html")) || (await cache.match("./"));
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              cache.put("./index.html", res.clone());
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => null);
        if (shell) {
          event.waitUntil(fresh);
          return shell;
        }
        const res = await fresh;
        return res || new Response("Arendora: нет сети и кэша", { status: 503 });
      })()
    );
    return;
  }

  // Кэшируем только тяжёлые ассеты; html и API — напрямую
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
  let data = { title: "Arendora", body: "Новое уведомление", url: "/app" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || "arendora",
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
