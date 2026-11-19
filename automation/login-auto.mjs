// Разовый вход в Профи.ру без подтверждения из консоли: скрипт сам ждёт,
// пока пользователь залогинится в открывшемся окне (проверка раз в 3 сек),
// затем аккуратно закрывает браузер, сохраняя профиль.
import { chromium } from "playwright";
import { config } from "./src/config.mjs";

const TIMEOUT_MS = 15 * 60 * 1000;

const ctx = await chromium.launchPersistentContext(config.profileDir, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  locale: "ru-RU",
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://profi.ru/cabinet/login/", { waitUntil: "domcontentloaded" });
console.log("Окно браузера открыто — войдите в аккаунт Профи.ру. Скрипт дождётся входа сам.");

const started = Date.now();
let loggedIn = false;
while (Date.now() - started < TIMEOUT_MS) {
  await page.waitForTimeout(3000).catch(() => {});
  try {
    const url = page.url();
    if (!/cabinet\/login/.test(url)) {
      // проверяем, что кабинет не отбрасывает обратно на логин
      await page.goto("https://profi.ru/cabinet/", { waitUntil: "domcontentloaded", timeout: 20000 });
      if (!/cabinet\/login/.test(page.url())) {
        loggedIn = true;
        break;
      }
    }
  } catch {
    // страница могла перезагружаться в момент проверки — пробуем дальше
  }
}

if (loggedIn) {
  console.log("Вход выполнен — сохраняю профиль:", config.profileDir);
  await page.waitForTimeout(2000);
} else {
  console.log("Время ожидания истекло — вход не зафиксирован.");
}
await ctx.close();
process.exit(loggedIn ? 0 : 1);
