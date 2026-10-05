// Эксперимент: редактор «Добавить услугу» на сводке. Каждый вопрос редактора
// отвечаем ОТЛИЧАЮЩИМСЯ вариантом — проверяем, продвигается ли цепочка.
// Запускать строго без воркера!
import { chromium } from "playwright";
import { config } from "./config.mjs";

process.on("unhandledRejection", (e) => console.log("REJECTION:", e && (e.message || e)));

const ctx = await chromium.launchPersistentContext(config.profileDir, {
  headless: true,
  viewport: { width: 1280, height: 900 },
  locale: "ru-RU",
});
const page = ctx.pages()[0] || (await ctx.newPage());

const state = () =>
  page.evaluate(() => ({
    heads: [...document.querySelectorAll("main h3")].map((h) => h.textContent.trim()),
    btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
    options: [...document.querySelectorAll('span[role="radio"], span[role="checkbox"]')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ text: e.textContent.trim(), checked: e.getAttribute("aria-checked") === "true" })),
    addr: !!document.querySelector('input[placeholder="Улица и номер дома"], input[aria-label="Улица и номер дома"]'),
    spin: !!document.querySelector('input[type="number"],input[inputmode="numeric"]'),
    ta: [...document.querySelectorAll("textarea")].filter((t) => t.offsetParent !== null).length,
  }));

const clickBtn = (t) =>
  page.evaluate((txt) => {
    const b = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === txt);
    if (b.length) { b[b.length - 1].click(); return true; }
    return false;
  }, t);

try {
  await page.goto("https://profi.ru/order/seamless/?seamless=1&tabName=ORDER", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const svc = page.getByRole("textbox", { name: /Услуга или специалист/ });
  await svc.fill("сантехник");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const items = [...document.querySelectorAll('li, [role="option"]')].filter(
      (e) => e.offsetParent !== null && norm(e.textContent) === "сантехник",
    );
    if (items.length) items[0].click();
  });
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

  for (let i = 0; i < 20; i++) {
    const st = await state();
    const heads = st.heads.join("|");
    console.log(`\n[шаг ${i}] ${heads} | кнопки: ${st.btns.join(",")}`);

    if (st.btns.includes("Найти профи")) {
      if (st.btns.includes("Добавить услугу")) {
        console.log(">>> сводка с предупреждением; открываю «Добавить услугу»");
        await clickBtn("Добавить услугу");
        await page.waitForTimeout(2500);
        continue;
      }
      console.log(">>> услуга привязана — жму «Найти профи»");
      await clickBtn("Найти профи");
      await page.waitForTimeout(15000);
      console.log(">>> итоговый url:", page.url());
      await page.screenshot({ path: "debug-exp-final.png", fullPage: true });
      break;
    }
    if (st.heads.some((h) => /пожелания/i.test(h)) && st.ta > 0) {
      await page.locator("textarea").locator("visible=true").first().fill("Протечка, срочный выезд");
      await page.waitForTimeout(1200);
      const after = await state();
      if (after.btns.includes("Подобрать специалистов")) {
        console.log(">>> «Подобрать специалистов» появилась");
        await clickBtn("Подобрать специалистов");
        await page.waitForTimeout(4000);
        continue;
      }
      await clickBtn("Пропустить");
      await page.waitForTimeout(3000);
      continue;
    }
    if (st.addr) {
      const inp = page.locator('input[placeholder="Улица и номер дома"], input[aria-label="Улица и номер дома"]').first();
      await inp.fill("Одинцовский р-н, пос. Жуковка, Клубный пер., 4");
      await page.waitForTimeout(3500);
      await page.evaluate(() => {
        const s = [...document.querySelectorAll('li[class*="Autosuggest_suggestion"]')];
        if (s.length) s[0].click();
      });
      await page.waitForTimeout(1500);
      await clickBtn("Продолжить");
      await page.waitForTimeout(2500);
      continue;
    }
    if (st.heads.some((h) => /Когда нужна услуга/i.test(h))) {
      await page.evaluate(() => {
        const els = [...document.querySelectorAll("span,div,label")].filter(
          (e) => e.childElementCount === 0 && e.textContent.trim().startsWith("В течение недели"),
        );
        if (els.length) els[els.length - 1].click();
      });
      await clickBtn("Продолжить");
      await page.waitForTimeout(2500);
      continue;
    }
    if (st.spin) {
      const sp = page.locator('input[type="number"],input[inputmode="numeric"]').first();
      await sp.fill("5000");
      await page.waitForTimeout(400);
      await clickBtn("Продолжить");
      await page.waitForTimeout(2500);
      continue;
    }
    if (st.options.length > 0) {
      // отвечаем отличающимся вариантом: снимок checked, кликаем unchecked
      const target = st.options.find((o) => !o.checked) || st.options[0];
      console.log(`>>> выбираю «${target.text}» (checked=${target.checked})`);
      await page.evaluate((t) => {
        const els = [...document.querySelectorAll('span[role="radio"], span[role="checkbox"]')].filter(
          (e) => e.offsetParent !== null && e.textContent.trim() === t,
        );
        if (els.length) els[els.length - 1].click();
      }, target.text);
      await page.waitForTimeout(700);
      if (st.btns.includes("Дальше")) await clickBtn("Дальше");
      else await clickBtn("Продолжить");
      await page.waitForTimeout(3000);
      continue;
    }
    if (st.btns.includes("Пропустить")) {
      await clickBtn("Пропустить");
      await page.waitForTimeout(3000);
      continue;
    }
    if (st.btns.includes("Продолжить")) {
      await clickBtn("Продолжить");
      await page.waitForTimeout(3000);
      continue;
    }
    console.log(">>> нет знакомых кнопок, стоп");
    await page.screenshot({ path: "debug-exp-stuck.png", fullPage: true });
    break;
  }
} catch (err) {
  console.error("ОШИБКА:", err.message);
  await page.screenshot({ path: "debug-exp-stuck.png", fullPage: true }).catch(() => {});
} finally {
  await ctx.close();
}
