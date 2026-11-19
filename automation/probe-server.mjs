// Диагностика на сервере: залогинен ли профиль + как выглядят шаги мастера
// (какие элементы-варианты реально есть в DOM). Запуск: node probe-server.mjs
import { chromium } from "playwright";

const ctx = await chromium.launchPersistentContext("./state/profi-profile", {
  headless: true,
  viewport: { width: 1280, height: 800 },
  locale: "ru-RU",
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());

// 1. Проверка логина на главной
await page.goto("https://profi.ru/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const login = await page.evaluate(() => ({
  authButtons: [...document.querySelectorAll("a,button")]
    .map((e) => e.textContent.trim())
    .filter((t) => /^(Вход и регистрация|Войти|Мой профиль|Сообщения)$/.test(t))
    .slice(0, 5),
}));
console.log("LOGIN:", JSON.stringify(login));

// 2. Мастер заказа: как в драйвере — услуга → «Выберу самостоятельно» → следующий шаг
await page.goto("https://profi.ru/order/seamless/?seamless=1&tabName=ORDER", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const clickBtn = (t) =>
  page.evaluate((txt) => {
    const b = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === txt);
    if (b.length) { b[b.length - 1].click(); return true; }
    return false;
  }, t);

const svc = page.getByRole("textbox", { name: /Услуга или специалист/ });
if ((await svc.count()) === 1) {
  await svc.fill("электрик");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const items = [...document.querySelectorAll('li, [role="option"]')].filter(
      (e) => e.offsetParent !== null && norm(e.textContent).startsWith("электрик"),
    );
    if (items.length) items[0].click();
  });
  await page.waitForTimeout(600);
  await clickBtn("Продолжить");
  await page.waitForTimeout(2000);
  await clickBtn("Продолжить");
  await page.waitForTimeout(2500);
}
await page.evaluate(() => {
  const els = [...document.querySelectorAll("span,div,label")].filter(
    (e) => e.childElementCount === 0 && e.textContent.trim() === "Выберу самостоятельно",
  );
  if (els.length) els[els.length - 1].click();
});
await clickBtn("Продолжить");
await page.waitForTimeout(3000);

// 3. Полный снимок текущего шага: заголовки, кнопки, ВСЕ элементы с role=radio/checkbox
const dump = await page.evaluate(() => {
  const heads = [...document.querySelectorAll("main h1, main h2, main h3")].map((h) => h.textContent.trim());
  const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  const roles = {};
  for (const el of document.querySelectorAll('[role="radio"],[role="checkbox"],input[type="radio"],input[type="checkbox"]')) {
    const key = el.tagName.toLowerCase() + (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "[native]");
    roles[key] = (roles[key] || 0) + 1;
  }
  const samples = [...document.querySelectorAll('[role="radio"],[role="checkbox"]')]
    .slice(0, 4)
    .map((e) => ({
      tag: e.tagName.toLowerCase(),
      cls: (e.className || "").toString().slice(0, 60),
      text: (e.closest("label") || e.parentElement || e).textContent.trim().slice(0, 40),
      visible: e.offsetParent !== null,
      checked: e.getAttribute("aria-checked"),
      html: e.outerHTML.slice(0, 150),
    }));
  return { url: location.href.slice(0, 100), heads, buttons, roles, samples };
});
console.log("STEP-DUMP:", JSON.stringify(dump, null, 1));
await page.screenshot({ path: "probe-step.png", fullPage: true });
await ctx.close();
