process.on("uncaughtException", (e) => { console.log("UNCAUGHT:", e && e.message); });
process.on("unhandledRejection", (e) => { console.log("REJECTION:", e && (e.message || String(e))); });
setInterval(() => {}, 1 << 30);
console.log("СТАРТ");
// Глубокая разведка редактора «Добавить услугу» на сводке «Ваша задача».
// Печатает полное состояние после каждого действия. Запускать без воркера!
import { chromium } from "playwright";
import { config } from "./config.mjs";

const ctx = await chromium.launchPersistentContext(config.profileDir, {
  headless: true,
  viewport: { width: 1280, height: 900 },
  locale: "ru-RU",
});
const page = ctx.pages()[0] || (await ctx.newPage());
console.log("БРАУЗЕР ОК");

const dump = async (label) => {
  const st = await page.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    return {
      heads: [...document.querySelectorAll("h1,h2,h3")].map((h) => h.textContent.trim()).slice(0, 6),
      btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
      radios: [...document.querySelectorAll('span[role="radio"]')].map((e) => e.textContent.trim()),
      checks: [...document.querySelectorAll('span[role="checkbox"]')].map((e) => e.textContent.trim()),
      inputs: [...document.querySelectorAll("input,textarea")]
        .filter((i) => i.offsetParent !== null)
        .map((i) => ({ ph: i.placeholder || "", al: i.getAttribute("aria-label") || "", tag: i.tagName })),
      mainText: main.innerText.slice(0, 700),
    };
  });
  console.log(`\n===== ${label} | url=${page.url().slice(0, 90)}`);
  console.log("heads:", JSON.stringify(st.heads));
  console.log("btns:", JSON.stringify(st.btns));
  console.log("radios:", JSON.stringify(st.radios));
  console.log("checks:", JSON.stringify(st.checks));
  console.log("inputs:", JSON.stringify(st.inputs));
  console.log("text:", st.mainText.replace(/\n+/g, " | ").slice(0, 400));
  return st;
};

const clickBtn = (t) =>
  page.evaluate((txt) => {
    const b = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === txt);
    if (b.length) { b[b.length - 1].click(); return b.length; }
    return 0;
  }, t);

try {
  // --- проходим мастер до сводки ---
  await page.goto("https://profi.ru/order/seamless/?seamless=1&tabName=ORDER", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
console.log("ГЛАВНАЯ ОТКРЫТА");
  console.log("ЛОКАТОР");
  const svc = page.getByRole("textbox", { name: /Услуга или специалист/ });
  await svc.fill("сантехник");
  console.log("ЗАПОЛНЕНО");
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

  for (let i = 0; i < 16; i++) {
    const snap = await page.evaluate(() => ({
      heads: [...document.querySelectorAll("main h3")].map((h) => h.textContent.trim()),
      btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()),
      ta: [...document.querySelectorAll("textarea")].filter((t) => t.offsetParent !== null),
      addr: !!document.querySelector('input[placeholder="Улица и номер дома"], input[aria-label="Улица и номер дома"]'),
      spin: !!document.querySelector('input[type="number"],input[inputmode="numeric"]'),
    }));
    if (snap.heads.some((h) => /пожелания/i.test(h))) {
      if (snap.ta.length) await page.locator("textarea").locator("visible=true").first().fill("Протечка под раковиной, срочный выезд");
      await page.waitForTimeout(1200);
      if (!(await clickBtn("Подобрать специалистов"))) await clickBtn("Пропустить");
      await page.waitForTimeout(3000);
      continue;
    }
    if (snap.addr) {
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
    if (snap.spin) {
      const sp = page.locator('input[type="number"],input[inputmode="numeric"]').first();
      await sp.fill("5000");
      await page.waitForTimeout(400);
      await clickBtn("Продолжить");
      await page.waitForTimeout(2500);
      continue;
    }
    if (snap.btns.includes("Пропустить")) {
      await clickBtn("Пропустить");
      await page.waitForTimeout(3000);
      continue;
    }
    if (snap.btns.includes("Добавить услугу")) {
      console.log("\n######## ДОБРАЛИСЬ ДО СВОДКИ ########");
      await dump("сводка, до клика");
      // ШАГ 1: клик «Добавить услугу»
      await clickBtn("Добавить услугу");
      await page.waitForTimeout(2500);
      await dump("после клика «Добавить услугу»");
      await page.screenshot({ path: "debug-svc-1.png", fullPage: true });

      // ШАГ 2..N: идём по вопросам редактора, каждый раз отвечаем ПЕРВЫМ
      // НЕвыбранным вариантом (чтобы ответ менялся) и жмём Дальше
      for (let j = 0; j < 10; j++) {
        const st = await dump(`редактор, такт ${j}`);
        if (st.btns.includes("Найти профи") && !st.btns.includes("Дальше")) {
          console.log(">>> редактор закрылся, вернулись на сводку");
          break;
        }
        if (st.radios.length > 0) {
          await page.evaluate(() => {
            const r = [...document.querySelectorAll('span[role="radio"]')].find((e) => e.offsetParent !== null);
            if (r) r.click();
          });
          await page.waitForTimeout(600);
        } else if (st.checks.length > 0) {
          await page.evaluate(() => {
            const c = [...document.querySelectorAll('span[role="checkbox"]')].find((e) => e.offsetParent !== null);
            if (c) c.click();
          });
          await page.waitForTimeout(600);
        } else if (st.inputs.some((i) => /Улица и номер/.test(i.ph + i.al))) {
          const inp = page.locator('input[placeholder="Улица и номер дома"], input[aria-label="Улица и номер дома"]').first();
          await inp.fill("Одинцовский р-н, пос. Жуковка, Клубный пер., 4");
          await page.waitForTimeout(3000);
          await page.evaluate(() => {
            const s = [...document.querySelectorAll('li[class*="Autosuggest_suggestion"]')];
            if (s.length) s[0].click();
          });
          await page.waitForTimeout(1200);
        } else if (st.inputs.length > 0 && !st.btns.includes("Найти профи")) {
          const first = st.inputs[0];
          const loc = page.locator(`${first.tag.toLowerCase()}`).first();
          await loc.fill("сантехник").catch(() => {});
          await page.waitForTimeout(800);
          // если появились подсказки — выбираем первую
          await page.evaluate(() => {
            const s = [...document.querySelectorAll('li[class*="Autosuggest_suggestion"], li[role="option"]')].filter(
              (e) => e.offsetParent !== null,
            );
            if (s.length) s[0].click();
          });
          await page.waitForTimeout(1200);
        }
        const pressed = await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].filter((x) => ["Дальше", "Продолжить"].includes(x.textContent.trim()));
          if (b.length) { b[b.length - 1].click(); return b[b.length - 1].textContent.trim(); }
          return null;
        });
        console.log(`> ответил и нажал: ${pressed}`);
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `debug-svc-${j + 2}.png`, fullPage: true });
      }
      await dump("итоговое состояние");
      await page.screenshot({ path: "debug-svc-final.png", fullPage: true });
      break;
    }
    const fb = await page.evaluate(() => ({
      heads: [...document.querySelectorAll('main h3')].map((h) => h.textContent.trim()),
      btns: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()),
      radios: [...document.querySelectorAll('span[role="radio"]')].filter((e) => e.offsetParent !== null).length,
      checks: [...document.querySelectorAll('span[role="checkbox"]')].filter((e) => e.offsetParent !== null).length,
    }));
    console.log('FALLBACK:', JSON.stringify(fb));
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('span[role="radio"], input[type="radio"], span[role="checkbox"], input[type="checkbox"]')].find(
        (x) => x.offsetParent !== null,
      );
      if (el) el.click();
    });
    await page.waitForTimeout(500);
    const pressed = await clickBtn('Продолжить');
    console.log('fallback нажал Продолжить:', pressed);
    await page.waitForTimeout(2500);
  }
} catch (err) {
  console.error("ОШИБКА:", err.message);
} finally {
  await ctx.close();
}
