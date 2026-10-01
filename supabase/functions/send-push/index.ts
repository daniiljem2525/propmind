// Edge Function: рассылка web-push по подпискам пользователя.
// Вызывается вебхуком из таблицы notifications (INSERT) — см. инструкции.
// Секреты: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (см. Setup → Edge Functions → Secrets).
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-push-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    if (secret && req.headers.get("x-push-secret") !== secret) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: cors,
      });
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidPublic || !vapidPrivate) {
      return new Response(
        JSON.stringify({ ok: false, error: "vapid_not_configured" }),
        { status: 500, headers: cors }
      );
    }

    // Вебхук может прислать два формата: { notification: {...} }
    // или стандартный pg-payload с полями в record — принимаем оба
    const body = await req.json();
    const notification = body.notification || body.record;
    if (!notification?.user_id) {
      return new Response(JSON.stringify({ ok: false, error: "no_user" }), {
        status: 400,
        headers: cors,
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", notification.user_id);

    webpush.setVapidDetails("mailto:sales@propmind.app", vapidPublic, vapidPrivate);

    let sent = 0;
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: notification.title || "PropMind",
            body: notification.message || "",
            url: notification.link || "/app",
          })
        );
        sent++;
      } catch (err) {
        // протухшая подписка — удаляем, чтобы не слать в пустоту
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: cors,
    });
  }
});
