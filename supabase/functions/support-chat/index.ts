// Edge Function: чат поддержки (v0).
//
//   POST { name, email, message } — аноним или залогиненный, JWT опционален
//   GET  (JWT обязателен)         — свои сообщения + ответы поддержки
//   PUT  (JWT + админ)            — ответить на сообщение
//
// Сообщения хранятся в public.support_messages.
// Уведомление CEO: запись в notifications для is_platform_admin.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

  // Опциональная аутентификация
  let userId: string | null = null;
  if (token) {
    const { data: userData } = await admin.auth.getUser(token);
    userId = userData?.user?.id || null;
  }

  // ——— POST: новое сообщение ———
  if (req.method === "POST") {
    let body: { name?: string; email?: string; message?: string };
    try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
    const message = (body.message || "").trim();
    if (!message) return json({ error: "EMPTY_MESSAGE" }, 400);
    if (message.length > 2000) return json({ error: "MESSAGE_TOO_LONG" }, 400);
    const name = (body.name || "").trim().slice(0, 100);
    const email = (body.email || "").trim().slice(0, 200);

    const { data: msg, error } = await admin
      .from("support_messages")
      .insert({
        user_id: userId,
        name: name || (userId ? "" : "Аноним"),
        email,
        message,
        status: "new",
      })
      .select("id, created_at")
      .single();
    if (error) return json({ error: error.message }, 500);

    // Уведомление админам
    try {
      const { data: admins } = await admin.from("profiles").select("id").eq("is_platform_admin", true);
      if (admins?.length) {
        await admin.from("notifications").insert(
          admins.map((a: { id: string }) => ({
            user_id: a.id,
            type: "support_new",
            title: "Новое сообщение в чате поддержки",
            message: (name || email || "Аноним") + ": " + message.slice(0, 200),
            link: "/app/admin?tab=support",
          }))
        );
      }
    } catch { /* уведомление не критично */ }

    return json({ ok: true, id: msg?.id, created_at: msg?.created_at });
  }

  // ——— PUT: ответ поддержки (только админ) ———
  if (req.method === "PUT") {
    if (!userId) return json({ error: "NO_TOKEN" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    const isAdmin = (userData?.user?.email || "").includes("@arendora.ru") ||
      userData?.user?.user_metadata?.is_platform_admin === true;
    if (!isAdmin) return json({ error: "FORBIDDEN" }, 403);

    let body: { message_id?: string; response?: string };
    try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
    const response = (body.response || "").trim();
    const msgId = body.message_id || "";
    if (!response || !msgId) return json({ error: "MISSING_FIELDS" }, 400);

    const { error } = await admin
      .from("support_messages")
      .update({ response, status: "answered", responded_at: new Date().toISOString() })
      .eq("id", msgId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ——— GET: сообщения пользователя ———
  if (req.method === "GET") {
    if (!userId) return json({ error: "NO_TOKEN" }, 401);
    const { data: msgs } = await admin
      .from("support_messages")
      .select("id, message, response, status, created_at, responded_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return json({ messages: msgs || [] });
  }

  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
});
