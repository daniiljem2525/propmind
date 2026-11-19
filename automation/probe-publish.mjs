// Диагностика момента публикации: публикуем задачу и снимаем всё, что
// происходит сразу после «Найти профи» (диалоги, баннеры, статус задачи).
import { chromium } from "playwright";
import { config } from "./src/config.mjs";

const ctx = await chromium.launchPersistentContext(config.profileDir, {
  headless: true,
  viewport: { width: 1280, height: 800 },
  locale: "ru-RU",
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());

// кабинет: есть ли баннер подтверждения email/телефона?
await page.goto("https://profi.ru/cabinet/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const banner = await page.evaluate(() => {
  const t = (document.body.innerText || "").replace(/\s+/g, " ");
  const m = t.match(/Подтвердите[^.!?]*[.!?]/g);
  return m ? m.slice(0, 4) : [];
});
console.log("CABINET-BANNERS:", JSON.stringify(banner));

// мастер: услуга → электрик → адрес из заказа → минимум шагов до публикации
await page.goto("https://profi.ru/order/seamless/?seamless=1&tabName=ORDER", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const clickBtn = (t) =>
  page.evaluate((txt) => {
    const b = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === txt);
    if (b.length) { b[b.length - 1].click(); return true; }
    return false;
  }, t);

const svc = page.getByRole("textbox", { name: /Услуга или специалист/ }).or(page.getByPlaceholder(/Услуга или специалист/)).first();
await svc.fill("электрик");
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const items = [...document.querySelectorAll('li, [role="option"]')].filter(
    (e) => e.offsetParent !== null && norm(e.textContent).includes("электромонтаж"),
  );
  if (items.length) items[0].click();
});
await page.waitForTimeout(600);
await clickBtn("Продолжить");
await page.waitForTimeout(2000);
await clickBtn("Продолжить");
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const els = [...document.querySelectorAll("span,div,label")].filter(
    (e) => e.childElementCount === 0 && e.textContent.trim() === "Выберу самостоятельно",
  );
  if (els.length) els[els.length - 1].click();
});
await clickBtn("Продолжить");
await page.waitForTimeout(2500);

// адрес и остальные шаги — до появления финальной кнопки
for (let i = 0; i < 15; i++) {
  const st = await page.evaluate(() => ({
    heads: [...document.querySelectorAll("main h1, main h2, main h3")].map((h) => h.textContent.trim()).join(" | "),
    btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
    hasAddr: !!document.querySelector('input[placeholder="Улица и номер дома"], input[aria-label="Улица и номер дома"]'),
    hasTa: !!document.querySelector("textarea"),
  }));
  if (/готовы выбрать|Ваша задача/.test(st.heads) && st.btns.includes("Найти профи")) break;
  if (st.hasAddr) {
    const inp = page.locator('input[placeholder="Улица и номер дома"], input[aria-label="Улица и номер дома"]').first();
    await inp.fill("Москва, ул. Павла Корчагина, 12");
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      const s = [...document.querySelectorAll('li[class*="Autosuggest_suggestion"]')];
      if (s.length) s[0].click();
    });
    await page.waitForTimeout(1200);
    await clickBtn("Продолжить");
    await page.waitForTimeout(2200);
    continue;
  }
  if (st.hasTa) {
    await page.locator("textarea").first().fill("Тест публикации: проверить, что задача не отменяется. Розетка не работает.");
    await page.waitForTimeout(800);
    await clickBtn("Продолжить");
    await page.waitForTimeout(2200);
    continue;
  }
  if (st.btns.includes("Пропустить")) { await clickBtn("Пропустить"); await page.waitForTimeout(2200); continue; }
  const radio = await page.evaluate(() => {
    const el = [...document.querySelectorAll('span[role="radio"], input[type="radio"], span[role="checkbox"], input[type="checkbox"]')]
      .find((x) => x.offsetParent !== null);
    if (el) { el.click(); return true; }
    return false;
  });
  await page.waitForTimeout(400);
  await clickBtn("Продолжить");
  await page.waitForTimeout(2200);
}

console.log("publishing...");
await clickBtn("Найти профи");
// снимаем состояние сразу после публикации каждые 10 сек
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(10000);
  const st = await page.evaluate(() => ({
    url: location.href.slice(0, 90),
    dialogs: [...document.querySelectorAll('[role="dialog"], [class*="Modal"]')].filter((d) => d.offsetParent !== null)
      .map((d) => d.innerText.replace(/\s+/g, " ").slice(0, 150)),
    body: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 220),
  }));
  console.log(`T+${(i + 1) * 10}s:`, JSON.stringify(st));
  await page.screenshot({ path: `publish-t${i + 1}.png`, fullPage: false }).catch(() => {});
}
await ctx.close();
