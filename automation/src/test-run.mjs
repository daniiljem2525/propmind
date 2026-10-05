// Тестовый прогон драйвера без Supabase: проходит мастер на Профи.ру
// до финальной кнопки и не отправляет заказ (DRY_RUN включён принудительно).
import { createProfiOrder } from "./profi.mjs";
import { config } from "./config.mjs";

config.dryRun = true;

const order = {
  service_query: "сантехник",
  details:
    "Протечка канализационной трубы под раковиной на кухне. Квартира. Срочно, в течение дня. Бюджет 5000 руб.",
  address: config.defaultAddress || "Москва, Тверская улица, 1",
  budget: 5000,
  deadline: "today",
  hint_option: "Устранение течи",
};

try {
  const res = await createProfiOrder(order, { headless: true });
  console.log("ИТОГ:", res.published ? "опубликован" : "dry-run остановлен перед отправкой");
  console.log("URL:", res.url);
} catch (err) {
  console.error("ОШИБКА:", err.name, "-", err.message);
  if (err.log) console.error("Журнал шагов:\n" + err.log.join("\n"));
  process.exit(1);
}
