// Edge Function: умный чат-помощник (v0).
//
//   POST { action:"ask", message }              — вопрос → умный ответ из базы знаний
//   POST { action:"contact", name, email, message } — сообщение в поддержку (в БД)
//   GET  ?session=<id> (без JWT)               — вся переписка по session_id
//   PUT  (JWT + админ) { message_id, response } — ответ поддержки
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ——— База знаний: ключевые слова → ответ ———
const KB: { keywords: string[]; answer: string }[] = [
  {
    keywords: ["тариф", "цена", "стоимость", "сколько", "платить", "бесплатно", "free", "start", "pro", "business", "оплата тарифа"],
    answer: "Тарифы Arendora:\n\n• **Free** — 0 ₽ навсегда: 1 объект, 1 арендатор, без карты\n• **Start** — 990 ₽/мес (9 900 ₽/год): до 4 объектов, арендаторы без лимита\n• **Pro** — 2 990 ₽/мес (29 900 ₽/год): до 8 объектов, аналитика\n• **Business** — 7 990 ₽/мес (79 900 ₽/год): до 14 объектов, команда\n\nОплата через ЮKassa. Годовая оплата выгоднее на ~17%.",
  },
  {
    keywords: ["напоминание", "просрочк", "должен", "забыл", "уведомлен", "напомнить", "автопросрочк"],
    answer: "Arendora автоматически отслеживает платежи:\n\n• Платёж с прошедшей датой сам переходит в «просрочен»\n• Вам приходит уведомление в день сбоя\n• Жильцу уходит напоминание за 5 дней до платежа\n• График платежей строится на 12 месяцев одной кнопкой",
  },
  {
    keywords: ["безопасн", "данные", "хран", "152", "рф", "защит", "пароль", "персональн"],
    answer: "Ваши данные хранятся на серверах в России с учётом требований 152-ФЗ. Каждый пользователь видит только свои записи, пароли хешированы. Удаление учётной записи — в Настройках.",
  },
  {
    keywords: ["объект", "квартир", "добавить объект", "создать"],
    answer: "Добавить объект: «Добавить объект» → название, адрес, цена аренды. График платежей и связи создаются автоматически. Импорт из CSV — для портфелей.",
  },
  {
    keywords: ["арендатор", "жилец", "съехал", "высели", "провери", "регистрац жильца"],
    answer: "Арендаторы: добавление, привязка к объекту, портал жильца, история платежей. Проверка перед сдачей — паспорт МВД, ФССП, банкротство, суды за 20 минут.",
  },
  {
    keywords: ["заявк", "ремонт", "обслуживан", "проблема", "сломал", "труб", "домофон"],
    answer: "Заявки на обслуживание: жилец сообщает о проблеме с фото → вы назначаете исполнителя и срочность → отслеживаете до закрытия. Ни одна проблема не теряется.",
  },
  {
    keywords: ["документ", "договор", "акт", "счет"],
    answer: "Документы привязаны к конкретной квартире: договоры, акты, счета. Не нужно искать файл в телефоне или почте — всё в одном месте.",
  },
  {
    keywords: ["excel", "таблиц", "перенести", "импорт", "csv", "перенос", "демо"],
    answer: "Перенос из Excel: объекты импортируются из CSV. Или начните с демо-данных (8 объектов, полгода платежей) одним кликом — посмотрите систему в действии.",
  },
  {
    keywords: ["аналитик", "доход", "прибыл", "заработ", "отчет", "сколько приносит"],
    answer: "Аналитика: доходы по объектам и месяцам, платёжная дисциплина, заполняемость. Всё автоматически — без ручных отчётов.",
  },
  {
    keywords: ["как начать", "регистрац", "начать", "старт", "15 минут", "быстро"],
    answer: "Старт за 15 минут: регистрация → загрузка демо-данных одним кликом (8 объектов, полгода платежей) → добавьте свои объекты. Без карты, без внедрения, без обучения.",
  },
  {
    keywords: ["удалить", "аккаунт", "уйти", "экспорт", "вывести", "отзыв"],
    answer: "Удаление учётной записи — в Настройках (Опасная зона). Данные удаляются безвозвратно в течение 30 дней. Экспорт данных доступен в любой момент.",
  },
  {
    keywords: ["не платит", "долг", "взыскан", "выхел", "расторж"],
    answer: "Если квартирант не платит: 1) разговор → 2) письменное уведомление → 3) судебный приказ. Статья «Квартирант не платит: что делать» в блоге — план от разговора до суда.",
  },
  {
    keywords: ["поддержк", "связаться", "контакт", "помощь", "позвонить"],
    answer: "Связаться с поддержкой:\n\n• Telegram: @arendora_support\n• Email: support@arendora.ru\n• Ответ в течение 5 минут\n\nИли нажмите «Написать в поддержку» — ответим прямо в этом чате.",
  },
];

function smartAnswer(message: string): string {
  const msg = message.toLowerCase();
  let bestScore = 0;
  let bestAnswer = "";

  for (const entry of KB) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (msg.includes(kw.toLowerCase())) score += kw.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = entry.answer;
    }
  }

  if (bestScore > 0) return bestAnswer;

  return "Я ответил на основные вопросы в базе знаний выше. Если ваш вопрос сложнее — нажмите «Написать в поддержку», ответим в течение 5 минут прямо в этом чате.\n\nТакже на связи:\n• Telegram: @arendora_support\n• Email: support@arendora.ru";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  const url = new URL(req.url);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

  let userId: string | null = null;
  let isAdmin = false;
  if (token) {
    const { data: userData } = await admin.auth.getUser(token);
    userId = userData?.user?.id || null;
    if (userId) {
      // Платформенный админ — по флагу профиля (email-хак оставлен как fallback)
      const { data: prof } = await admin
        .from("profiles")
        .select("is_platform_admin")
        .eq("id", userId)
        .maybeSingle();
      isAdmin = !!prof?.is_platform_admin || (userData?.user?.email || "").includes("@arendora.ru");
    }
  }

  // ——— POST: вопрос боту / сообщение в поддержку ———
  if (req.method === "POST") {
    let body: Record<string, string>;
    try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }

    const action = body.action || "ask";
    const sessionId = body.session_id || crypto.randomUUID();
    const text = (body.message || "").trim();
    if (!text) return json({ error: "EMPTY_MESSAGE" }, 400);

    if (action === "ask") {
      // Умный ответ — сообщение НЕ сохраняем (это не тикет в поддержку)
      const answer = smartAnswer(text);
      return json({ ok: true, answer, session_id: sessionId });
    }

    if (action === "contact") {
      // Сообщение в поддержку — сохраняем в БД, CEO отвечает в чате из админки
      const name = (body.name || "").trim().slice(0, 100);
      const email = (body.email || "").trim().slice(0, 200);
      const { data: msgRow, error } = await admin
        .from("support_messages")
        .insert({ user_id: userId, name, email, message: text, status: "new", session_id: sessionId, sender: "user" })
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
              message: (name || email || "Аноним") + ": " + text.slice(0, 200),
              link: "/app/admin?tab=support",
            }))
          );
        }
      } catch { /* не критично */ }

      return json({
        ok: true,
        id: msgRow?.id,
        created_at: msgRow?.created_at,
        session_id: sessionId,
      });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  }

  // ——— GET: переписка по session_id; ?all=1 (JWT + админ) — все сообщения для админки ———
  if (req.method === "GET") {
    if (url.searchParams.get("all") === "1") {
      if (!userId || !isAdmin) return json({ error: "FORBIDDEN" }, 403);
      const { data: msgs } = await admin
        .from("support_messages")
        .select("id, user_id, name, email, message, response, sender, status, session_id, created_at, responded_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return json({ messages: msgs || [] });
    }
    const sessionId = url.searchParams.get("session");
    if (!sessionId) return json({ error: "NO_SESSION" }, 400);
    const { data: msgs } = await admin
      .from("support_messages")
      .select("id, message, response, sender, status, created_at, responded_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    return json({ messages: msgs || [] });
  }

  // ——— PUT: ответ поддержки в тред (только админ) ———
  // Режим чата: { session_id, response } — ответ добавляется отдельной строкой
  // треда, непросмотренные сообщения пользователя помечаются answered.
  // Legacy: { message_id, response } — ответ в колонку response старой строки.
  if (req.method === "PUT") {
    if (!userId || !isAdmin) return json({ error: "FORBIDDEN" }, 403);
    let body: { session_id?: string; message_id?: string; response?: string };
    try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
    const response = (body.response || "").trim();
    if (!response) return json({ error: "MISSING_FIELDS" }, 400);

    if (body.session_id) {
      const sessionId = body.session_id.trim();
      if (!sessionId) return json({ error: "NO_SESSION" }, 400);
      const { data: msgRow, error } = await admin
        .from("support_messages")
        .insert({
          session_id: sessionId,
          sender: "support",
          message: response,
          name: "",
          email: "",
          status: "answered",
        })
        .select("id, created_at")
        .single();
      if (error) return json({ error: error.message }, 500);

      // Сообщения пользователя в треде считаем отвеченными
      await admin
        .from("support_messages")
        .update({ status: "answered", responded_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("sender", "user")
        .eq("status", "new");

      return json({ ok: true, id: msgRow?.id, created_at: msgRow?.created_at });
    }

    const msgId = body.message_id || "";
    if (!msgId) return json({ error: "MISSING_FIELDS" }, 400);
    const { error } = await admin
      .from("support_messages")
      .update({ response, status: "answered", responded_at: new Date().toISOString() })
      .eq("id", msgId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
});
