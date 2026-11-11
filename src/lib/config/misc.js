import { isDemoMode } from "@/lib/demoMode";

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

// Лимиты тарифов (null — лимит не применяется). team — роли команды
// (управляющий/бухгалтер): условие покупки тарифа Бизнес.
export const PLAN_LIMITS = {
  // Канон Free с 07.11, правка 2 (решение CEO): 1 объект И 1 арендатор.
  // Лимит блокирует только СОЗДАНИЕ нового; существующие данные не трогаем —
  // у тестовых пользователей может быть больше лимита, они работают дальше.
  free: { properties: 1, tenants: 1, team: false },
  start: { properties: 4, tenants: null, team: false }, // 1 бесплатно + 3 доп.
  pro: { properties: 8, tenants: null, team: false },
  business: { properties: 14, tenants: null, team: true },
  individual: { properties: null, tenants: null, team: true },
};

// Роли команды (manager/accountant) доступны только тарифам с team: true
export function planAllowsTeam(plan) {
  return !!getPlanLimits(plan).team;
}

export function getPlanLimits(plan) {
  // Демо-режим — максимальный тариф: ничто не блокируется лимитами.
  // План реального аккаунта при этом не меняется.
  if (isDemoMode()) return PLAN_LIMITS.individual;
  let key = plan;
  if (!key) {
    try {
      key = localStorage.getItem("arendora:plan");
    } catch {}
  }
  return PLAN_LIMITS[key] || PLAN_LIMITS.free;
}
