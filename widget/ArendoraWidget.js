// ═══════════════════════════════════════════════════════════════
//  Arendora Widget для iPhone (приложение Scriptable)
//  Показывает ближайший неоплаченный платёж и задолженность.
//
//  НАСТРОЙКА: заполните 4 поля в блоке CONFIG ниже.
//  SUPABASE_ANON_KEY — публичный anon-ключ проекта (Settings → API).
//  EMAIL / PASSWORD — ваша учётка Arendora: виджет логинится под
//  вами, база отдаёт только ваши платежи (RLS).
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  SUPABASE_URL: "https://bhxwpkplqjzhfqwckine.supabase.co",
  // publishable-ключ (публичный) — НЕ секретный sb_secret!
  SUPABASE_ANON_KEY: "sb_publishable_H3Vk7JOk4DJWMBod6CvV6Q_IRDhrqww",
  EMAIL: "daniilmelyanov2010@gmail.com",
  PASSWORD: "ВСТАВЬТЕ_ПАРОЛЬ",
};

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const UNPAID = "in.(pending,overdue,partial)";

// ─── утилиты ───────────────────────────────────────────────────

function money(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
}

function shortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.getDate() + " " + MONTHS[d.getMonth()];
}

function daysOverdue(iso) {
  const due = new Date(iso + "T23:59:59");
  return Math.floor((Date.now() - due.getTime()) / 86400000);
}

async function supabase(path, token) {
  // Scriptable: заголовки назначаются свойством после создания запроса —
  // через конструктор они теряются ("No API key found in request")
  const req = new Request(CONFIG.SUPABASE_URL + "/rest/v1/" + path);
  req.headers = {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: "Bearer " + (token || ""),
  };
  const res = await req.loadJSON();
  return res;
}

// токен кэшируется на 50 минут, чтобы не логиниться при каждом обновлении
async function getToken() {
  // понятные подсказки, если конфиг не заполнен
  if (CONFIG.SUPABASE_ANON_KEY.includes("ВСТАВЬТЕ"))
    throw new Error("вставьте anon-ключ в CONFIG (Settings → API → anon public)");
  if (CONFIG.EMAIL.includes("example.com") || CONFIG.PASSWORD.includes("ваш-пароль"))
    throw new Error("впишите EMAIL и PASSWORD в CONFIG");

  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), "arendora-token.json");
  if (fm.fileExists(cachePath)) {
    const cache = JSON.parse(fm.readString(cachePath));
    if (Date.now() - cache.savedAt < 50 * 60 * 1000) return cache.token;
  }
  const req = new Request(CONFIG.SUPABASE_URL + "/auth/v1/token?grant_type=password");
  req.method = "POST";
  req.headers = {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
  req.body = JSON.stringify({ email: CONFIG.EMAIL.trim(), password: CONFIG.PASSWORD });
  const res = await req.loadJSON();
  if (!res.access_token) {
    // показываем НАСТОЯЩУЮ причину от Supabase, а не общую фразу
    const reason =
      res.error_description ||
      res.msg ||
      (res.error && (res.error.description || res.error.message)) ||
      res.message ||
      JSON.stringify(res).slice(0, 140);
    throw new Error(reason);
  }
  fm.writeString(cachePath, JSON.stringify({ token: res.access_token, savedAt: Date.now() }));
  return res.access_token;
}

// ─── данные ────────────────────────────────────────────────────

async function loadData() {
  const token = await getToken();
  const unpaid = await supabase(
    "payments?select=amount,currency,due_date,status,tenant_name,property_name" +
      "&status=in.(pending,overdue,partial)&due_date=not.is.null&order=due_date.asc&limit=50",
    token,
  );
  if (!Array.isArray(unpaid)) throw new Error("нет данных платежей");
  const debt = unpaid.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const overdue = unpaid.filter((p) => p.status === "overdue" || daysOverdue(p.due_date) > 0);
  return { nearest: unpaid[0] || null, rest: unpaid.slice(1), debt, unpaidCount: unpaid.length, overdue };
}

// ─── отрисовка ─────────────────────────────────────────────────

const BG = new Color("#1c1c1e");
const FG = new Color("#ffffff");
const MUTED = new Color("#98989d");
const RED = new Color("#ff453a");
const GREEN = new Color("#30d158");

function buildWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(16, 18, 14, 18);

  const medium = config.widgetFamily === "medium" || config.widgetFamily === "large";

  // шапка
  const head = w.addStack();
  head.layoutHorizontally();
  const brand = head.addText("Arendora");
  brand.font = Font.boldSystemFont(medium ? 13 : 11);
  brand.textColor = MUTED;
  head.addSpacer();
  const cap = head.addText("Аренда");
  cap.font = Font.systemFont(medium ? 13 : 11);
  cap.textColor = MUTED;

  w.addSpacer(6);

  if (!data.nearest) {
    const done = w.addText("Все платежи ✓");
    done.font = Font.boldSystemFont(medium ? 24 : 20);
    done.textColor = GREEN;
    w.addSpacer();
    const sub = w.addText("Поступления получены");
    sub.font = Font.systemFont(medium ? 13 : 11);
    sub.textColor = MUTED;
    w.refreshAfterDate = new Date(Date.now() + 6 * 3600 * 1000);
    return w;
  }

  const p = data.nearest;
  const isOverdue = p.status === "overdue" || daysOverdue(p.due_date) > 0;

  // сумма
  const amount = w.addText(money(p.amount));
  amount.font = Font.boldSystemFont(medium ? 32 : 26);
  amount.textColor = FG;

  // жилец и дата
  const who = (p.tenant_name || p.property_name || "—");
  const when = isOverdue
    ? "ПРОСРОЧЕН · до " + shortDate(p.due_date)
    : "до " + shortDate(p.due_date);
  const line = w.addStack();
  line.layoutHorizontally();
  line.setPadding(0, 0, 0, 0);
  const whoT = line.addText(who);
  whoT.font = Font.systemFont(medium ? 14 : 12);
  whoT.textColor = MUTED;
  whoT.lineLimit = 1;
  line.addSpacer(6);
  const whenT = line.addText(when);
  whenT.font = Font.boldSystemFont(medium ? 14 : 12);
  whenT.textColor = isOverdue ? RED : FG;

  w.addSpacer();

  // низ: задолженность и остаток
  const foot = w.addStack();
  foot.layoutHorizontally();
  const parts = [];
  if (data.overdue.length > 0) parts.push("Долг: " + money(data.debt));
  if (data.rest.length > 0) parts.push("ещё " + data.rest.length + " плат.");
  const footText = foot.addText(parts.join(" · ") || money(p.amount));
  footText.font = Font.systemFont(medium ? 13 : 11);
  footText.textColor = data.overdue.length > 0 ? RED : MUTED;

  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

function errorWidget(message) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(16, 18, 14, 18);
  const t = w.addText("Arendora");
  t.font = Font.boldSystemFont(13);
  t.textColor = MUTED;
  w.addSpacer();
  const e = w.addText("Нет связи\n" + message);
  e.font = Font.systemFont(12);
  e.textColor = RED;
  if (/api key/i.test(message)) {
    const hint = w.addText(
      "В CONFIG должен быть ключ sb_publishable_... (Settings → API → Publishable key), не sb_secret",
    );
    hint.font = Font.systemFont(11);
    hint.textColor = MUTED;
  }
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
  return w;
}

// ─── запуск ────────────────────────────────────────────────────

let widget;
try {
  const data = await loadData();
  widget = buildWidget(data);
} catch (err) {
  console.error(err);
  widget = errorWidget(String(err.message || err));
}
Script.setWidget(widget);
Script.complete();
