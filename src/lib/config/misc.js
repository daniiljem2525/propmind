export const CURRENCIES = [
  { code: "RUB", label: "₽ RUB" },
  { code: "USD", label: "$ USD" },
  { code: "EUR", label: "€ EUR" },
  { code: "KZT", label: "₸ KZT" },
];

export const PAYMENT_METHOD_CONFIG = {
  cash: { label_ru: "Наличные", label_en: "Cash" },
  bank: { label_ru: "Банковский перевод", label_en: "Bank transfer" },
  card: { label_ru: "Карта", label_en: "Card" },
  stripe: { label_ru: "Онлайн (Stripe)", label_en: "Online (Stripe)" },
};

export const MAINTENANCE_SOURCE_CONFIG = {
  manual: { label_ru: "Вручную", label_en: "Manual" },
  ai_bot: { label_ru: "AI-бот", label_en: "AI bot" },
  tenant_portal: { label_ru: "Портал арендатора", label_en: "Tenant portal" },
};

export const PLANS = [
  { id: "free", monthly: 0, yearly: 0, highlight: false },
  { id: "start", monthly: 990, yearly: 9900, highlight: false },
  { id: "pro", monthly: 2990, yearly: 29900, highlight: true },
  { id: "business", monthly: 7990, yearly: 79900, highlight: false },
  // Индивидуальный: цена и лимиты согласуются лично, выдаёт администратор
  { id: "individual", monthly: null, yearly: null, highlight: false },
];

// Лимиты тарифов (null — без ограничения)
export const PLAN_LIMITS = {
  free: { properties: 3, tenants: 3 }, // единый оффер: «до 3 объектов»
  start: { properties: 4, tenants: null }, // 1 бесплатно + 3 доп.
  pro: { properties: 8, tenants: null },
  business: { properties: 14, tenants: null },
  individual: { properties: null, tenants: null },
};

export function getPlanLimits(plan) {
  let key = plan;
  if (!key) {
    try {
      key = localStorage.getItem("arendora:plan");
    } catch {}
  }
  return PLAN_LIMITS[key] || PLAN_LIMITS.free;
}
