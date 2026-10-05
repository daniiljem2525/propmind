// Разовая разведка кабинета Профи.ру под сохранённым профилем:
// куда ведут ссылки «Мои задачи», как выглядят отклики и чаты.
// Запуск: node src/explore-cabinet.mjs
import { chromium } from "playwright";
import { config } from "./config.mjs";

const ctx = await chromium.launchPersistentContext(config.profileDir, {
  headless: true,
  viewport: { width: 1280, height: 900 },
  locale: "ru-RU",
});
const page = ctx.pages()[0] || (await ctx.newPage());
const log = (...a) => console.log(...a);

try {
  await page.goto("https://profi.ru/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const nav = await page.evaluate(() =>
    [...document.querySelectorAll("a")]
      .map((a) => ({ text: a.textContent.trim().slice(0, 50), href: a.getAttribute("href") }))
      .filter((x) => x.href && /задач|заказ|кабинет|чат|сообщен|мои/i.test(x.text)),
  );
  log("== Ссылки навигации ==");
  log(nav.map((n) => `${n.text} → ${n.href}`).join("\n"));

  // пробуем перейти в задачи клиента
  for (const path of ["/my-orders/", "/cabinet/orders/", "/orders/"]) {
    try {
      const resp = await page.goto(`https://profi.ru${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2500);
      log(`\n== ${path} → ${resp.status()} | url=${page.url()}`);
      log("title:", await page.title());
      break;
    } catch {
      log(`${path} не открылся`);
    }
  }
  await page.screenshot({ path: "debug-cabinet.png", fullPage: false });
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  log("\n== Текст страницы ==\n", text);
} finally {
  await ctx.close();
}
