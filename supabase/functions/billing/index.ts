// Edge Function: биллинг ЮKassa (v0 — тестовая среда).
//
//   POST /functions/v1/billing  {action:"create", plan, period}
//     — пользовательский JWT (строго свой аккаунт); создаёт платёж ЮKassa
//       (redirect-подтверждение), пишет pending-запись в billing_payments,
//       возвращает confirmation_url для перехода на оплату.
//   POST /functions/v1/billing/webhook
//     — уведомление ЮKassa (без JWT). ЮKassa не подписывает вебхуки, поэтому
//       телу не доверяем: платёж запрашивается СЕРВЕРНЫМ GET-запросом в API
//       ЮKassa по object.id, и только его статус/метаданные применяются.
//       succeeded → billing_payments paid + profiles.plan/plan_until
//       (сервисная роль, в обход RLS — пользователь план себе не выставит).
//   GET  /functions/v1/billing
//     — свой JWT: текущий план, plan_until и последние платежи.
//
// Ключи: YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY / YOOKASSA_RETURN_URL —
// stack/.env (см. docker-compose, сервис functions). Без ключей функция
// отвечает BILLING_NOT_CONFIGURED — среда деградирует предсказуемо.
//
// Цены — единый источник с офертой (/terms раздел 5) и /tariffs: менять
// синхронно в трёх местах (функция, /tariffs, llms.txt) при изменении.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOP_ID = Deno.env.get("YOOKASSA_SHOP_ID") || "";
const SECRET = Deno.env.get("YOOKASSA_SECRET_KEY") || "";
const RETURN_URL =
  Deno.env.get("YOOKASSA_RETURN_URL") || "https://arendora.ru/app?billing=return";

// Возврат после оплаты — на тот же origin, откуда платёж начался
// (иначе сессии нет: staging → прод = другой localStorage). origin
// валидируем по белому списку, произвольные редиректы не пропускаем.
const ALLOWED_RETURN_HOSTS = new Set(["arendora.ru", "www.arendora.ru", "staging.arendora.ru"]);
function safeReturnUrl(raw: string | undefined): string {
  if (!raw) return RETURN_URL;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && ALLOWED_RETURN_HOSTS.has(u.hostname) && u.pathname === "/app") {
      return `${u.origin}/app?billing=return`;
    }
  } catch {}
  return RETURN_URL;
}

// v0: автосписания (рекурренты) и возвраты НЕ реализованы — возвраты вручную
// по правилам /payments; автопродление — по решению CEO (v1).
const PRICES: Record<string, { month: string; year: string; title: string }> = {
  start: { month: "990.00", year: "9900.00", title: "Start" },
  pro: { month: "2990.00", year: "29900.00", title: "Pro" },
  business: { month: "7990.00", year: "79900.00", title: "Business" },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

function ykHeaders(idempotenceKey?: string): Record<string, string> {
  const auth = btoa(`${SHOP_ID}:${SECRET}`);
  const h: Record<string, string> = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
  if (idempotenceKey) h["Idempotence-Key"] = idempotenceKey;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const isWebhook = url.pathname.endsWith("/webhook");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ——— Вебхук ЮKassa ———
  if (isWebhook) {
    if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (!SHOP_ID || !SECRET) return json({ error: "BILLING_NOT_CONFIGURED" }, 503);
    let body: { event?: string; object?: { id?: string } };
    try {
      body = await req.json();
    } catch {
      return json({ error: "BAD_JSON" }, 400);
    }
    const paymentId = body.object?.id;
    if (!body.event || !paymentId) return json({ error: "BAD_PAYLOAD" }, 400);

    // Верификация: платеж запрашиваем из API ЮKassa, телу вебхука не доверяем
    const res = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
      headers: ykHeaders(),
    });
    if (!res.ok) return json({ error: "VERIFY_FAILED", status: res.status }, 502);
    const payment = await res.json();

    const meta = (payment.metadata || {}) as Record<string, string>;
    const paid = payment.status === "succeeded";
    await admin
      .from("billing_payments")
      .update({
        status: payment.status,
        raw: payment,
        paid_at: paid ? payment.captured_at || new Date().toISOString() : null,
      })
      .eq("provider_payment_id", paymentId);

    if (paid && meta.user_id && meta.plan && meta.period) {
      // план_until наращиваем от текущего plan_until, если он ещё активен
      // (продление не теряет дни), иначе — от сейчас
      const { data: prof } = await admin
        .from("profiles")
        .select("plan, plan_until")
        .eq("id", meta.user_id)
        .maybeSingle();
      const base =
        prof?.plan === meta.plan && prof?.plan_until && new Date(prof.plan_until) > new Date()
          ? new Date(prof.plan_until)
          : new Date();
      if (meta.period === "year") base.setFullYear(base.getFullYear() + 1);
      else base.setMonth(base.getMonth() + 1);
      await admin
        .from("profiles")
        .update({ plan: meta.plan, plan_until: base.toISOString() })
        .eq("id", meta.user_id);
    }
    // 200 на известные события — иначе ЮKassa будет ретраить
    return json({ ok: true });
  }

  // ——— Пользовательские действия: строго свой JWT ———
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "NO_TOKEN" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "INVALID_TOKEN" }, 401);

  if (req.method === "GET") {
    const { data: pays } = await admin
      .from("billing_payments")
      .select("id, plan, period, amount, currency, status, created_at, paid_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: prof } = await admin
      .from("profiles")
      .select("plan, plan_until")
      .eq("id", userId)
      .maybeSingle();
    return json({ plan: prof?.plan || "free", plan_until: prof?.plan_until || null, payments: pays || [] });
  }

  if (!SHOP_ID || !SECRET) return json({ error: "BILLING_NOT_CONFIGURED" }, 503);
  let body: { action?: string; plan?: string; period?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  if (body.action !== "create") return json({ error: "UNKNOWN_ACTION" }, 400);
  const plan = body.plan || "";
  const period = body.period === "year" ? "year" : "month";
  const price = PRICES[plan];
  if (!price) return json({ error: "BAD_PLAN", allowed: Object.keys(PRICES) }, 400);
  const returnUrl = safeReturnUrl((body as Record<string, string>).return_url);

  const description = `Arendora ${price.title} — ${period === "year" ? "год" : "месяц"}`;
  const res = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: ykHeaders(crypto.randomUUID()),
    body: JSON.stringify({
      amount: { value: price[period], currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: returnUrl },
      description,
      metadata: { user_id: userId, plan, period },
    }),
  });
  const payment = await res.json().catch(() => null);
  if (!res.ok || !payment?.id) {
    return json({ error: "YK_ERROR", status: res.status, detail: payment }, 502);
  }
  await admin.from("billing_payments").insert({
    user_id: userId,
    provider_payment_id: payment.id,
    plan,
    period,
    amount: Number(price[period]),
    status: payment.status || "pending",
  });
  return json({ confirmation_url: payment.confirmation?.confirmation_url, payment_id: payment.id });
});
