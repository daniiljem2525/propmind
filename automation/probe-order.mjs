// Проверка живой страницы заказа Профи: виджет чата, отклики, маркеры отмены.
// Запуск: node probe-order.mjs <orderId>
import { chromium } from "playwright";

const orderId = process.argv[2];
if (!orderId) {
  console.error("usage: node probe-order.mjs <orderId>");
  process.exit(1);
}

const ctx = await chromium.launchPersistentContext("./state/profi-profile", {
  headless: true,
  viewport: { width: 1280, height: 900 },
  locale: "ru-RU",
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(`https://profi.ru/cabinet/order/${orderId}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);

const info = await page.evaluate(() => {
  const widget = document.querySelector('[data-testid="order_chat_widget"]');
  const replies = document.querySelectorAll('a[class*="ReplyContent_replyItem"]').length;
  const body = (document.body.innerText || "").replace(/\s+/g, " ");
  const markers = ["задача не найдена", "задача удалена", "задача отменена", "объявление не найдено", "объявление удалено"]
    .filter((m) => new RegExp(m.replace(/ё/g, "[её]"), "i").test(body));
  // где именно встретилось «отменена» — контекст 80 символов
  let context = "";
  const idx = body.toLowerCase().search(/отменен[аы]|удален[аы]/);
  if (idx >= 0) context = body.slice(Math.max(0, idx - 60), idx + 80);
  return {
    url: location.href.slice(0, 90),
    widget: !!widget,
    replies,
    markers,
    context,
    bodyHead: body.slice(0, 200),
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: "probe-order.png", fullPage: true });
await ctx.close();
