// Диагностика логина Профи.ру в headless на сервере: какие способы входа
// предлагает сайт и что происходит при вводе телефона.
// Аргумент: номер телефона (например +79261234567). Без аргумента — только осмотр.
import { chromium } from "playwright";

const phone = process.argv[2] || "";

const ctx = await chromium.launchPersistentContext("./state/profi-profile", {
  headless: true,
  viewport: { width: 1280, height: 800 },
  locale: "ru-RU",
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://profi.ru/cabinet/login/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);

const overview = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button,a")].map((b) => b.textContent.trim()).filter(Boolean);
  const inputs = [...document.querySelectorAll("input")]
    .filter((i) => i.offsetParent !== null)
    .map((i) => ({ type: i.type, name: i.name || "", placeholder: i.placeholder || "", aria: i.getAttribute("aria-label") || "" }));
  return { url: location.href.slice(0, 120), btns: btns.slice(0, 20), inputs };
});
console.log("LOGIN-PAGE:", JSON.stringify(overview, null, 1));
await page.screenshot({ path: "probe-login.png", fullPage: true });

if (phone) {
  // пробуем ввести телефон в первое видимое текстовое поле
  const filled = await page.evaluate((p) => {
    const inp = [...document.querySelectorAll("input")]
      .filter((i) => i.offsetParent !== null && ["text", "tel", ""].includes(i.type))
      .find((i) => /телефон|phone/i.test(`${i.placeholder} ${i.getAttribute("aria-label") || ""} ${i.name}`));
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(inp, p);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, phone);
  console.log("PHONE-FILLED:", filled);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "probe-login-filled.png", fullPage: true });
  const after = await page.evaluate(() => ({
    url: location.href.slice(0, 120),
    btns: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 15),
    body: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
  }));
  console.log("AFTER-FILL:", JSON.stringify(after, null, 1));
}
await ctx.close();
