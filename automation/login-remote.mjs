// Логин Профи.ру на headless-сервере с релеем SMS-кода через файл.
// Запуск: node login-remote.mjs <phone>
// Код из СМС кладётся в /tmp/profi-code (echo -n 1234 > /tmp/profi-code),
// результат — в /tmp/profi-login-result.
import fs from "node:fs";
import { chromium } from "playwright";

const phone = process.argv[2] || "";
const CODE_FILE = "/tmp/profi-code";
const RESULT_FILE = "/tmp/profi-login-result";
const log = (m) => {
  console.log(m);
  fs.appendFileSync("/tmp/profi-login.log", `${new Date().toISOString()} ${m}\n`);
};

const ctx = await chromium.launchPersistentContext("./state/profi-profile", {
  headless: true,
  viewport: { width: 1280, height: 800 },
  locale: "ru-RU",
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  fs.writeFileSync(CODE_FILE, "", { flag: "a" });
  await page.goto("https://profi.ru/cabinet/login/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  const tel = page.locator('input[type="tel"][name="phoneNumber"]');
  if ((await tel.count()) === 0) throw new Error("Поле телефона не найдено");
  await tel.click();
  await tel.type(phone, { delay: 60 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.textContent.trim() === "Продолжить",
    );
    if (b) b.click();
  });
  log("телефон введён, «Продолжить» нажата, жду страницу кода");
  await page.waitForTimeout(6000);

  const stage = await page.evaluate(() => ({
    url: location.href.slice(0, 120),
    inputs: [...document.querySelectorAll("input")]
      .filter((i) => i.offsetParent !== null)
      .map((i) => ({ type: i.type, name: i.name || "", placeholder: i.placeholder || "", maxLength: i.maxLength })),
    body: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
  }));
  log(`состояние после телефона: ${JSON.stringify(stage)}`);
  await page.screenshot({ path: "login-stage1.png", fullPage: true });

  // Ждём до 10 минут: либо пользователь подтвердит push в приложении
  // (страница сама перейдёт дальше), либо появляется кнопка «Отправить СМС
  // с кодом» — жмём её, как только откатится таймер, и вводим код из файла.
  let code = "";
  let smsRequested = false;
  for (let i = 0; i < 200 && !code; i++) {
    await page.waitForTimeout(3000);
    try { code = fs.readFileSync(CODE_FILE, "utf8").trim(); } catch {}
    if (!smsRequested) {
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button,a,span")]
          .filter((x) => x.offsetParent !== null)
          .find((x) => /отправить смс с кодом/i.test(x.textContent.trim()) && !/через/.test(x.textContent));
        if (b) { b.click(); return true; }
        return false;
      });
      if (clicked) {
        smsRequested = true;
        log("«Отправить СМС с кодом» нажата — код уходит на телефон");
        await page.waitForTimeout(3000);
        const st2 = await page.evaluate(() => ({
          inputs: [...document.querySelectorAll("input")]
            .filter((i) => i.offsetParent !== null)
            .map((i) => ({ type: i.type, name: i.name || "", maxLength: i.maxLength })),
          body: document.body.innerText.replace(/\s+/g, " ").slice(0, 250),
        }));
        log(`после запроса СМС: ${JSON.stringify(st2)}`);
        await page.screenshot({ path: "login-stage2.png", fullPage: true });
      }
    }
    // push-подтверждение могло сработать без кода — выходим из ожидания
    const maybeLoggedIn = await page.evaluate(() => !/cabinet\/login|Подтвердите вход/i.test(location.href + document.body.innerText.slice(0, 500)));
    if (!code && maybeLoggedIn && i > 3) {
      log("похоже, вход подтверждён push-уведомлением (без кода)");
      break;
    }
  }
  if (!code) {
    const finalCheck = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200));
    log(`выход без кода, состояние: ${finalCheck}`);
  } else {
  log(`получен код (${code.length} цифр), ввожу`);

  // код может быть одним полем или набором ячеек
  const filled = await page.evaluate((c) => {
    const vis = [...document.querySelectorAll("input")].filter(
      (i) => i.offsetParent !== null && ["text", "tel", "number", ""].includes(i.type),
    );
    // исключаем поле телефона — оно могло остаться на странице
    const cells = vis.filter((i) => i.name !== "phoneNumber");
    if (cells.length === 0) return "нет полей";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (cells.length === 1) {
      setter.call(cells[0], c);
      cells[0].dispatchEvent(new Event("input", { bubbles: true }));
      return "одно поле";
    }
    // отдельная ячейка на цифру
    const digits = c.replace(/\D/g, "").slice(0, cells.length);
    digits.split("").forEach((d, idx) => {
      setter.call(cells[idx], d);
      cells[idx].dispatchEvent(new Event("input", { bubbles: true }));
    });
    return `ячеек ${cells.length}, цифр ${digits.length}`;
  }, code);
  log(`код заполнен: ${filled}`);
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => /^(Продолжить|Войти|Подтвердить)$/i.test(x.textContent.trim()),
    );
    if (b) b.click();
  });
  log("кнопка подтверждения нажата");
  await page.waitForTimeout(6000);
  }

  // проверка логина: на главной не должно быть «Вход и регистрация»
  await page.goto("https://profi.ru/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const check = await page.evaluate(() => ({
    url: location.href.slice(0, 100),
    authButtons: [...document.querySelectorAll("a,button")]
      .map((e) => e.textContent.trim())
      .filter((t) => /^(Вход и регистрация|Войти)$/.test(t)).length,
    personal: [...document.querySelectorAll("a,button,span")]
      .map((e) => e.textContent.trim())
      .filter((t) => t && t.length > 0 && /мои (заказы|задания)|сообщения|баланс/i.test(t)).slice(0, 4),
  }));
  log(`проверка логина: ${JSON.stringify(check)}`);
  await page.screenshot({ path: "login-final.png", fullPage: true });
  fs.writeFileSync(RESULT_FILE, JSON.stringify({ ok: check.authButtons === 0, check }));
} catch (err) {
  log(`ОШИБКА: ${err.message}`);
  await page.screenshot({ path: "login-error.png", fullPage: true }).catch(() => {});
  fs.writeFileSync(RESULT_FILE, JSON.stringify({ ok: false, error: err.message }));
} finally {
  await ctx.close();
}
