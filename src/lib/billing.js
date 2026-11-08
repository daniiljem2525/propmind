// Клиент биллинга (edge-функция /functions/v1/billing, провайдер ЮKassa).
// Паттерн запросов — как deleteAccount в supabase/auth.js: сессия из
// getSession() (без сетевого getUser), JWT в Authorization, ошибки —
// с кодом из функции (BILLING_NOT_CONFIGURED / BAD_PLAN / YK_ERROR…).
import { supabase, SUPABASE_URL } from "./supabase/config";

async function authedFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const err = new Error("SESSION_EXPIRED");
    err.code = "SESSION_EXPIRED";
    throw err;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/billing${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.code = data?.error || "BILLING_ERROR";
    err.detail = data;
    throw err;
  }
  return data;
}

// Создать платёж тарифа; возвращает { confirmation_url, payment_id }.
// После этого браузер уводится на confirmation_url (экран ЮKassa).
export async function createBillingPayment({ plan, period = "month" }) {
  // клиентская проверка тарифа — неопознанное не уходит в сеть
  if (!BILLING_PRICES[plan]) {
    const err = new Error("BAD_PLAN");
    err.code = "BAD_PLAN";
    throw err;
  }
  return authedFetch("", {
    method: "POST",
    body: JSON.stringify({
      action: "create",
      plan,
      period,
      // возврат на тот же origin — иначе после оплаты на staging/yandex-landing
      // пользователь попадает в другой localStorage и его выкидывает на логин
      return_url: `${typeof window !== "undefined" ? window.location.origin : "https://arendora.ru"}/app?billing=return`,
    }),
  });
}

// Текущий тариф и последние платежи: { plan, plan_until, payments[] }.
export async function getBillingStatus() {
  return authedFetch("", { method: "GET" });
}

// Цены тарифов — ЕДИНЫЙ источник с edge-функцией (supabase/functions/billing),
// офертой (/terms) и /tariffs: менять синхронно.
export const BILLING_PRICES = {
  start: { month: 990, year: 9900, title: "Start" },
  pro: { month: 2990, year: 29900, title: "Pro" },
  business: { month: 7990, year: 79900, title: "Business" },
};
