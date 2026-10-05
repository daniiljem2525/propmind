// Отладка финального шага «Ваша задача»: что делает «Добавить услугу».
// Запускать БЕЗ работающего воркера (профиль браузера один на всех).
import { chromium } from "playwright";
import { config } from "./config.mjs";

const ctx = await chromium.launchPersistentContext(config.profileDir, {
  headless: true,
  viewport: { width: 1280, height: 900 },
  locale: "ru-RU",
});
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto("https://profi.ru/order/seamless/?seamless=1&tabName=ORDER", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const clickBtn = (t) =>
    page.evaluate((txt) => {
      const b = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === txt);
      if (b.length) { b[b.length - 1].click(); return true; }
      return false;
    }, t);

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
  await page.waitForTimeout(600);
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

  for (let i = 0; i < 16; i++) {
    const snap = await page.evaluate(() => ({
      heads: [...document.querySelectorAll("main h3")].map((h) => h.textContent.trim()),
      btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()),
      hasTa: !!document.querySelector("textarea"),
      hasAddr: !!document.querySelector('input[placeholder="Улица и номер дома"], input[aria-label="Улица и номер дома"]'),
      hasSpin: !!document.querySelector('input[type="number"],input[inputmode="numeric"]'),
    }));
    const heads = snap.heads.join("|");
    console.log(`шаг ${i}: ${heads} | кнопки: ${snap.btns.filter((b) => b).slice(0, 6).join(", ")}`);
    if (snap.heads.some((h) => /пожелания/i.test(h))) {
      await page.locator("textarea").first().fill("Протечка под раковиной, срочный выезд");
      await page.waitForTimeout(500);
      await clickBtn("Продолжить");
      await page.waitForTimeout(2500);
      continue;
    }
    if (snap.hasAddr) {
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
    if (snap.heads.some((h) => /Когда нужна услуга/i.test(h))) {
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
    if (snap.hasSpin) {
      const sp = page.locator('input[type="number"],input[inputmode="numeric"]').first();
      await sp.fill("5000");
      await page.waitForTimeout(400);
      await clickBtn("Продолжить");
      await page.waitForTimeout(2500);
      continue;
    }
    if (snap.btns.includes("Пропустить")) {
      await clickBtn("Пропустить");
      await page.waitForTimeout(2500);
      continue;
    }
    if (snap.btns.includes("Найти профи")) {
      console.log(">>> Сводка, кликаю «Добавить услугу»");
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button, a")].filter((x) =>
          /Добавить услугу/i.test(x.textContent.trim()),
        );
        if (b.length) b[0].click();
      });
      await page.waitForTimeout(3000);
      // мастер переспрашивает шаги — проходим до привязки услуги
      for (let j = 0; j < 12; j++) {
        const st = await page.evaluate(() => ({
          heads: [...document.querySelectorAll("main h3")].map((h) => h.textContent.trim()),
          btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()),
          text: document.body.innerText.slice(0, 400),
          hasSearch: !!document.querySelector('input[placeholder*="йст"], input[aria-label*="йст"]'),
        }));
        console.log(`услуга-шаг ${j}: ${st.heads.join("|")} | ${st.btns.filter(Boolean).slice(0, 6).join(", ")}`);
        if (/Ваша задача/.test(st.heads.join("|")) && !st.btns.includes("Дальше")) {
          console.log(">>> вернулись на сводку; текст:", st.text.replace(/\n/g, " | ").slice(0, 300));
          break;
        }
        if (st.hasSearch) {
          console.log(">>> появился поиск услуги!");
          const sugg = await page.evaluate(() =>
            [...document.querySelectorAll('li, [role="option"]')].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim()).slice(0, 12),
          );
          console.log("подсказки:", JSON.stringify(sugg));
          break;
        }
        // выбираем вариант и идём дальше
        await page.evaluate(() => {
          const el = [...document.querySelectorAll('span[role="radio"], input[type="radio"], span[role="checkbox"], input[type="checkbox"]')].find(
            (x) => x.offsetParent !== null,
          );
          if (el) el.click();
        });
        await page.waitForTimeout(600);
        const done = await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].filter((x) => ["Дальше", "Продолжить"].includes(x.textContent.trim()));
          if (b.length) { b[b.length - 1].click(); return true; }
          return false;
        });
        console.log("выбрал+далее:", done);
        await page.waitForTimeout(2500);
      }
      await page.screenshot({ path: "debug-addservice.png", fullPage: true });
      break;
    }
    // вопрос с вариантами — выбираем первый
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('span[role="radio"], input[type="radio"], span[role="checkbox"], input[type="checkbox"]')].find(
        (x) => x.offsetParent !== null,
      );
      if (el) el.click();
    });
    await page.waitForTimeout(600);
    await clickBtn("Продолжить");
    await page.waitForTimeout(2500);
  }
} catch (err) {
  console.error("ОШИБКА:", err.message);
  await page.screenshot({ path: "debug-addservice.png", fullPage: true }).catch(() => {});
} finally {
  await ctx.close();
}
