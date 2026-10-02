// Edge Function: письма Arendora через Resend.
// Два режима вызова:
//  1) Дайджест по расписанию (pg_cron → net.http_post): заголовок
//     x-email-secret = EMAIL_WEBHOOK_SECRET, body { kind: "digest" }.
//     Письмо получает каждый владелец, у которого есть события.
//  2) Из приложения (Bearer JWT): приглашение жильцу —
//     body { template: "invite", to, invite_link, owner_name }.
// Секреты: RESEND_API_KEY (обязателен), EMAIL_FROM (опц.),
// EMAIL_WEBHOOK_SECRET (для режима 1).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-email-secret",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors });

const FROM = Deno.env.get("EMAIL_FROM") || "Arendora <onboarding@resend.dev>";

async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`resend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

const wrap = (title: string, bodyHtml: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <div style="background:#0f766e;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">
      Arendora
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:20px">
      <h2 style="margin:0 0 12px;font-size:16px">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:12px">
      Это письмо отправлено приложением Arendora.
    </p>
  </div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ ok: false, error: "email_not_configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ——— Режим 1: еженедельный дайджест (по секрету из pg_cron) ———
    const emailSecret = Deno.env.get("EMAIL_WEBHOOK_SECRET");
    if (
      emailSecret &&
      req.headers.get("x-email-secret") === emailSecret &&
      body.kind === "digest"
    ) {
      const { data: owners } = await admin
        .from("profiles")
        .select("id, email, full_name")
        .eq("role", "owner");
      let sent = 0;
      for (const o of owners || []) {
        if (!o.email) continue;
        const { data: overdue } = await admin
          .from("payments")
          .select("id, amount, currency, due_date")
          .eq("owner_id", o.id)
          .eq("status", "pending")
          .lt("due_date", new Date().toISOString().slice(0, 10));
        const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
        const { data: soon } = await admin
          .from("payments")
          .select("id, amount, currency, due_date")
          .eq("owner_id", o.id)
          .eq("status", "pending")
          .gte("due_date", new Date().toISOString().slice(0, 10))
          .lte("due_date", week);
        const { data: leases } = await admin
          .from("properties")
          .select("id, name, lease_end")
          .eq("owner_id", o.id)
          .not("lease_end", "is", null)
          .lte(
            "lease_end",
            new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
          );
        if (!(overdue?.length || soon?.length || leases?.length)) continue;
        const row = (p: { amount: number; currency: string; due_date: string }) =>
          `<li>${new Date(p.due_date).toLocaleDateString("ru-RU")} — ${p.amount} ${p.currency || "RUB"}</li>`;
        const html = wrap(
          `Дайджест, ${o.full_name || ""}`.trim(),
          `<p style="margin:0 0 8px">Сводка по вашему портфелю за неделю:</p>
           ${overdue?.length ? `<p style="margin:8px 0 4px"><b>Просрочено: ${overdue.length}</b></p><ul style="margin:0;padding-left:18px">${overdue.map(row).join("")}</ul>` : ""}
           ${soon?.length ? `<p style="margin:12px 0 4px"><b>Ожидаются в течение 7 дней: ${soon.length}</b></p><ul style="margin:0;padding-left:18px">${soon.map(row).join("")}</ul>` : ""}
           ${leases?.length ? `<p style="margin:12px 0 4px"><b>Договоры истекают в течение 30 дней: ${leases.length}</b></p><ul style="margin:0;padding-left:18px">${leases.map((l: { name: string; lease_end: string }) => `<li>${l.name} — до ${new Date(l.lease_end).toLocaleDateString("ru-RU")}</li>`).join("")}</ul>` : ""}`
        );
        try {
          await sendEmail(apiKey, o.email, "Arendora: дайджест недели", html);
          sent++;
        } catch (e) {
          console.error("digest send failed", o.email, String(e));
        }
      }
      return json({ ok: true, sent });
    }

    // ——— Режим 2: письма из приложения (только по своему JWT) ———
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.slice(7)
    );
    if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const me = userData.user;

    if (body.template === "invite") {
      const to = String(body.to || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
        return json({ ok: false, error: "bad_email" }, 400);
      const ownerName = String(body.owner_name || "").slice(0, 80);
      const link = String(body.invite_link || "").slice(0, 300);
      const html = wrap(
        `Приглашение в Arendora`,
        `<p style="margin:0 0 8px">${ownerName ? ownerName + " приглашает вас" : "Вас приглашают"} вести аренду в приложении Arendora.</p>
         <p style="margin:0 0 16px">Зарегистрируйтесь по ссылке — объект и роль подключатся автоматически:</p>
         <p style="margin:0 0 16px"><a href="${link}" style="background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Создать аккаунт</a></p>
         <p style="margin:0;color:#64748b;font-size:13px">Если кнопка не работает, откройте: ${link}</p>`
      );
      await sendEmail(apiKey, to, "Приглашение в Arendora", html);
      return json({ ok: true, sent: 1 });
    }

    return json({ ok: false, error: "unknown_template" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
