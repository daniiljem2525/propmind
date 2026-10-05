// Драйвер Профи.ру: проходится по мастеру «Создать заказ» и публикует заказ.
// Селекторы сняты с живого сайта (октябрь 2026). Кнопки-радио на сайте —
// кастомные span'ы, обычные Playwright-клики по ним нестабильны, поэтому
// клики выполняются скриптом внутри страницы (evaluate).
import { chromium } from "playwright";
import { config } from "./config.mjs";

export const ORDER_URL = "https://profi.ru/order/seamless/?seamless=1&tabName=ORDER";

export class NeedsLoginError extends Error {
  constructor(message) {
    super(message);
    this.name = "NeedsLoginError";
  }
}

const DEADLINE_LABELS = {
  today: /^Сегодня/,
  week: /^В течение недели/,
  anytime: /^Когда удобно специалисту/,
};

// Клик по видимой кнопке с точным текстом (Продолжить / Пропустить / …).
async function clickButton(page, text) {
  return page.evaluate((t) => {
    const btns = [...document.querySelectorAll("button")].filter(
      (b) => b.textContent.trim() === t,
    );
    if (!btns.length) return false;
    btns[btns.length - 1].click();
    return true;
  }, text);
}

// Клик по текстовому элементу-варианту (радио/чекбокс: «Сегодня, 5 октября» и т.п.)
async function clickOption(page, text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll("span,div,label,p")].filter(
      (e) => e.childElementCount === 0 && e.textContent.trim() === t,
    );
    if (!els.length) return false;
    els[els.length - 1].click();
    return true;
  }, text);
}

// Снимок состояния текущего шага мастера.
async function stepState(page) {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll("main h1, main h2, main h3")]
      .map((h) => h.textContent.trim())
      .filter(Boolean);
    const buttons = [...document.querySelectorAll("button")]
      .map((b) => b.textContent.trim())
      .filter(Boolean);
    const options = [
      ...new Set(
        [
          ...[...document.querySelectorAll('span[role="radio"], span[role="checkbox"]')].map(
            (e) => e.textContent.trim(),
          ),
          // нативные input-чекбоксы/радио с текстом в label или соседнем узле
          ...[...document.querySelectorAll('input[type="radio"], input[type="checkbox"]')]
            .filter((i) => i.offsetParent !== null)
            .map(
              (i) =>
                i.closest("label")?.textContent?.trim() ||
                i.parentElement?.textContent?.trim() ||
                i.getAttribute("aria-label") ||
                "",
            )
            .filter(Boolean),
        ].map((t) => t.replace(/\s+/g, " ").slice(0, 80)),
      ),
    ];
    const textboxes = [...document.querySelectorAll("textarea, input[type=text], input:not([type])")]
      .filter((i) => i.offsetParent !== null)
      .map((i) => ({
        ariaLabel: i.getAttribute("aria-label") || "",
        placeholder: i.getAttribute("placeholder") || "",
      }));
    const spin = [...document.querySelectorAll("input")].some(
      (i) =>
        i.type === "number" ||
        i.getAttribute("role") === "spinbutton" ||
        i.inputMode === "numeric",
    );
    return { headings, buttons, options, textboxes, spin };
  });
}

const textboxByRole = async (page, nameRe) => {
  const loc = page.getByRole("textbox", { name: nameRe });
  return (await loc.count()) === 1 ? loc : null;
};

const isPhoneStep = (st) =>
  /осталось чуть-чуть|чуть‑чуть/i.test(st.headings.join(" ")) ||
  st.textboxes.some((t) => /7 123 456 78-90/.test(t.placeholder)) ||
  st.buttons.includes("Войти с WB ID");

// Один шаг мастера. Возвращает 'continue' | 'done' | 'needs-login' | 'dry-run-stop'.
async function handleStep(page, order, log) {
  const st = await stepState(page);
  const headings = st.headings.join(" | ");
  log.push(`шаг: ${headings || "(нет заголовков)"}`);

  if (isPhoneStep(st)) {
    throw new NeedsLoginError(
      "Мастер дошёл до шага с телефоном — профиль не залогинен. Запустите `npm run login` и войдите один раз.",
    );
  }

  // 1. Первый шаг: услуга
  const serviceInput = await textboxByRole(page, /Услуга или специалист/);
  if (serviceInput) {
    await serviceInput.fill(order.service_query || "мастер на час");
    await page.waitForTimeout(1500);
    // выбираем подсказку из списка — иначе первый клик по «Продолжить»
    // только закрывает список подсказок
    const picked = await page.evaluate((q) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const items = [
        ...document.querySelectorAll(
          'li, [role="option"], [class*="suggestion" i], [class*="Suggest"]',
        ),
      ].filter(
        (e) =>
          e.offsetParent !== null &&
          e.textContent.trim().length < 80 &&
          norm(e.textContent).startsWith(norm(q).slice(0, 6)) &&
          norm(e.textContent) !== norm(q),
      );
      if (items.length) {
        // точное совпадение или самая короткая подсказка (без «довесков»)
        items.sort((a, b) => a.textContent.length - b.textContent.length);
        const exact = items.find((e) => norm(e.textContent) === norm(q));
        const target = exact || items[0];
        target.click();
        return target.textContent.trim().slice(0, 60);
      }
      return null;
    }, order.service_query || "мастер на час");
    if (!picked) {
      await serviceInput.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(500);
    await clickButton(page, "Продолжить");
    await page.waitForTimeout(1200);
    // если список был открыт — первый клик его закрыл, жмём ещё раз
    await clickButton(page, "Продолжить");
    return "continue";
  }

  // 2. Способ подбора: всегда «Выберу самостоятельно»
  if (/Как вам удобнее найти специалиста/.test(headings)) {
    await clickOption(page, "Выберу самостоятельно");
    await page.waitForTimeout(500);
    await clickButton(page, "Продолжить");
    return "continue";
  }

  // 3. Адрес (автокомплит Яндекс.Карт) — узнаём по полю, а не по заголовку
  const addrInput =
    (await textboxByRole(page, /Улица и номер дома/)) ||
    page.getByPlaceholder(/Улица и номер дома/).locator("visible=true").first();
  if ((await addrInput.count()) > 0) {
    const address = order.address || config.defaultAddress;
    if (!address) throw new Error("Не заполнен адрес (и DEFAULT_ADDRESS пуст) — шаг адреса");
    await addrInput.first().fill(address);
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      const sugg = [...document.querySelectorAll('li[class*="Autosuggest_suggestion"]')];
      if (sugg.length) sugg[0].click();
    });
    await page.waitForTimeout(1500);
    await clickButton(page, "Продолжить");
    await page.waitForTimeout(1000);
    await clickButton(page, "Продолжить");
    return "continue";
  }

  // 4. Срок
  if (/Когда нужна услуга/.test(headings)) {
    const re = DEADLINE_LABELS[order.deadline] || DEADLINE_LABELS.week;
    const opt = st.options.find((o) => re.test(o));
    if (opt) {
      await clickOption(page, opt);
      await page.waitForTimeout(500);
    }
    await clickButton(page, "Продолжить");
    return "continue";
  }

  // 5. Бюджет
  if (st.spin) {
    const spinLoc = page.locator(
      'input[type="number"], input[role="spinbutton"]',
    );
    if ((await spinLoc.count()) > 0 && Number(order.budget) > 0) {
      await spinLoc.first().fill(String(Math.round(Number(order.budget))));
      await page.waitForTimeout(500);
    }
    await clickButton(page, "Продолжить");
    return "continue";
  }

  // 6. Описание задачи
  const descInput = await textboxByRole(page, /Важные детали/);
  if (descInput) {
    await descInput.fill(order.details || order.service_query || "");
    await page.waitForTimeout(600);
    await clickButton(page, "Продолжить");
    return "continue";
  }

  // 7. Готовность выбрать специалиста → финальная отправка
  if (/готовы выбрать специалиста|пока думаете/.test(headings)) {
    await clickOption(page, "Я точно хочу выбрать специалиста");
    await page.waitForTimeout(500);
    if (config.dryRun) {
      log.push("DRY_RUN: финальная кнопка не нажата");
      return "dry-run-stop";
    }
    await clickButton(page, "Подобрать специалистов");
    return "done";
  }

  // 7б. Сводка «Ваша задача» — кнопка «Найти профи»
  if (st.buttons.includes("Найти профи")) {
    if (config.dryRun) {
      log.push("DRY_RUN: финальная кнопка «Найти профи» не нажата");
      return "dry-run-stop";
    }
    await clickButton(page, "Найти профи");
    return "done";
  }

  // 8. Уточняющие вопросы с вариантами
  if (st.options.length > 0) {
    const wanted = (order.hint_option || "").trim().toLowerCase();
    const byHint = wanted && st.options.find((o) => o.toLowerCase() === wanted);
    const otherBox = await textboxByRole(page, /Другое/);
    if (byHint) {
      await clickOption(page, byHint);
    } else if (otherBox) {
      // свободный ответ точнее, чем случайный первый вариант;
      // у «Другое» может быть свой чекбокс — отмечаем его
      await page.evaluate(() => {
        const cb = [...document.querySelectorAll('input[type="radio"],input[type="checkbox"]')].find(
          (i) => (i.closest("label")?.textContent || i.parentElement?.textContent || "").trim() === "Другое",
        );
        if (cb && !cb.checked) cb.click();
      });
      await otherBox.fill(
        (order.hint_option || order.service_query || "см. описание").slice(0, 80),
      );
    } else {
      await clickOption(page, st.options[0]);
    }
    await page.waitForTimeout(500);
    if (!(await clickButton(page, "Продолжить"))) await clickButton(page, "Пропустить");
    return "continue";
  }

  // 9. Необязательный шаг без вариантов
  if (st.buttons.includes("Пропустить")) {
    await clickButton(page, "Пропустить");
    return "continue";
  }
  if (st.buttons.includes("Продолжить")) {
    await clickButton(page, "Продолжить");
    return "continue";
  }

  await page.screenshot({ path: "debug-stuck.png", fullPage: true }).catch(() => {});
  throw new Error(`Неизвестный шаг мастера: ${headings || "пустая страница"}`);
}

/**
 * Создаёт заказ на Профи.ру.
 * order: { service_query, details, address, budget, deadline, hint_option }
 * Возвращает { url, log } — адрес страницы заказа.
 */
export async function createProfiOrder(order, { headless = config.headless } = {}) {
  const ctx = await chromium.launchPersistentContext(config.profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
    locale: "ru-RU",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const log = [];
  try {
    await page.goto(ORDER_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);

    let outcome = "continue";
    for (let i = 0; i < 30 && outcome === "continue"; i++) {
      outcome = await handleStep(page, order, log);
      await page.waitForTimeout(2200);
    }
    if (outcome === "continue") {
      await page
        .screenshot({ path: "debug-stuck.png", fullPage: true })
        .catch(() => {});
      const err = new Error("Мастер не дошёл до отправки за 30 шагов — проверьте сайт вручную");
      err.log = log;
      throw err;
    }
    return { url: page.url(), log, published: outcome === "done" };
  } catch (err) {
    if (err.log === undefined) err.log = log;
    throw err;
  } finally {
    await ctx.close();
  }
}

/** Разовый интерактивный вход: открывает видимый браузер, профиль сохраняется. */
export async function interactiveLogin() {
  const ctx = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: "ru-RU",
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://profi.ru/cabinet/login/", { waitUntil: "domcontentloaded" });
  console.log("Войдите в аккаунт в открывшемся окне браузера.");
  console.log("После входа вернитесь в консоль и нажмите Enter — профиль будет сохранён.");
  await new Promise((resolve) => process.stdin.once("data", resolve));
  await ctx.close();
  console.log("Готово: профиль сохранён в", config.profileDir);
}
