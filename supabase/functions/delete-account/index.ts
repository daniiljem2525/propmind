// Edge Function: полное удаление учётной записи пользователем.
//
// Обещано в /privacy (п. 8.3 — отзыв согласия удалением учётной записи
// в настройках Сервиса; п. 12 — уничтожение данных в течение 30 дней)
// и /terms (п. 13 — отказ от договора оформляется удалением учётной записи).
//
// Анонимный ключ удалять пользователей не может — нужна service_role,
// поэтому удаление делаем на сервере:
//   вход:  Authorization: Bearer <JWT пользователя> (POST без body)
//   проверка: JWT верифицируется через auth.getUser(token) — удаляемый
//     пользователь берётся ИЗ ТОКЕНА (auth.uid = удаляемому по построению),
//     никаких идентификаторов из тела запроса не принимаем.
//   удаление: admin.auth.deleteUser(userId) сервис-ролью.
//
// Каскад данных (supabase/schema.sql):
//   auth.users --cascade--> profiles
//   profiles --cascade--> все данные владельца: properties, tenants,
//   payments, bookings, documents (файлы — data-URL в записях), invites
//   (owner_id), maintenance_requests (owner_id), request_comments,
//   push_subscriptions, notifications, automation_orders, profi_offers.
//   FK без каскада (invites.used_by, maintenance_requests.created_by) —
//   обнуляем заранее, иначе deleteUser упадёт с FK-нарушением (23503).
//   Аккаунты других пользователей (жильцы/исполнители) не удаляются —
//   только их ссылки на объекты владельца (on delete set null / null).
//
// Деплой: supabase functions deploy delete-account
// (JWT проверяем сами и не зависим от платформенной верификации;
//  можно деплоить и с --no-verify-jwt — проверка в функции).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "NO_TOKEN" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ——— Идентичность строго из JWT ———
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "INVALID_TOKEN" }, 401);

  // ——— Снимаем FK-ссылки без каскада (иначе deleteUser → 23503) ———
  const { error: invErr } = await admin
    .from("invites")
    .update({ used_by: null })
    .eq("used_by", userId);
  if (invErr) return json({ error: `INVITES: ${invErr.message}` }, 500);

  const { error: mrErr } = await admin
    .from("maintenance_requests")
    .update({ created_by: null })
    .eq("created_by", userId);
  if (mrErr) return json({ error: `MAINTENANCE: ${mrErr.message}` }, 500);

  // ——— Удаление: каскад чистит profiles и все данные владельца ———
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: `DELETE: ${delErr.message}` }, 500);

  return json({ ok: true });
});
