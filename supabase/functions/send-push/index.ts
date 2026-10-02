// Edge Function: рассылка web-push по подпискам пользователя.
// Два способа вызова:
//  1) Вебхук из триггера notifications (INSERT) — заголовок x-push-secret.
//  2) Тест из приложения: Bearer JWT — пуш только самому себе, отчёт { ok, sent, subs, errors }.
// Секреты: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WEBHOOK_SECRET (опционально).
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-push-secret",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidPublic || !vapidPrivate) {
      return json({ ok: false, error: "vapid_not_configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    const authHeader = req.headers.get("authorization") || "";
    const secretOk =
      !webhookSecret || req.headers.get("x-push-secret") === webhookSecret;

    let userId: string | null = null;
    let title: string | null = null;
    let message: string | null = null;
    let link: string | null = null;

    if (secretOk) {
      // Вебхук может прислать два формата: { notification: {...} }
      // или стандартный pg-payload с полями в record — принимаем оба
      const payload = body.notification || body.record;
      userId = payload?.user_id ?? null;
      title = payload?.title ?? null;
      message = payload?.message ?? null;
      link = payload?.link ?? null;
    } else if (authHeader.startsWith("Bearer ")) {
      // Тест из приложения: подписи пользователя видны только ему,
      // сервисный ключ нужен на отправку, поэтому JWT проверяем через admin-клиент
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data, error } = await admin.auth.getUser(authHeader.slice(7));
      if (error || !data?.user) return json({ ok: false, error: "unauthorized" }, 401);
      userId = data.user.id;
      title = body.title ?? null;
      message = body.message ?? null;
      link = body.link ?? null;
    } else {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    if (!userId) return json({ ok: false, error: "no_user" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);

    webpush.setVapidDetails("mailto:sales@arendora.app", vapidPublic, vapidPrivate);

    let sent = 0;
    const errors: { status: number | null; message: string }[] = [];
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: title || "Arendora",
            body: message || "",
            url: link || "/app",
          })
        );
        sent++;
      } catch (err) {
        // протухшая подписка — удаляем, чтобы не слать в пустоту;
        // остальные ошибки собираем в отчёт для диагностики
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          errors.push({
            status: err?.statusCode ?? null,
            message: String(err?.message || err).slice(0, 300),
          });
        }
      }
    }
    return json({ ok: true, sent, subs: (subs || []).length, errors });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
