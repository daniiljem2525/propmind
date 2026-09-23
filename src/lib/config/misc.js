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
];

// Лимиты тарифов (null — без ограничения)
export const PLAN_LIMITS = {
  free: { properties: 3, tenants: 1 },
  start: { properties: 15, tenants: null },
  pro: { properties: 100, tenants: null },
  business: { properties: null, tenants: null },
};

export function getPlanLimits() {
  let plan = "free";
  try {
    plan = localStorage.getItem("propmind:plan") || "free";
  } catch {}
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}
