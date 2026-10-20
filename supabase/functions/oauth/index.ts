// Edge Function: вход через Яндекс / VK / Mail.ru.
//
// Supabase Auth не поддерживает эти провайдеры из коробки, поэтому
// полный OAuth-цикл делаем сами:
//   /start?provider=yandex|vk|mailru&redirect_to=<app>/auth/social
//     → 302 на страницу согласия провайдера (state подписан HMAC)
//   /callback?provider=...&code=...&state=...
//     → обмен кода на токен, профиль, создание/поиск пользователя
//       Supabase (сервис-роль), генерация одноразового token_hash
//     → 302 на redirect_to?token_hash=...&type=magiclink
// Фронт на /auth/social обменивает token_hash на обычную сессию
// через supabase.auth.verifyOtp().
//
// Секреты (supabase secrets set):
//   YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET
//   VK_CLIENT_ID / VK_CLIENT_SECRET
//   MAILRU_CLIENT_ID / MAILRU_CLIENT_SECRET
//   OAUTH_ALLOWED_REDIRECTS — через запятую origins приложений,
//     напр. https://user.github.io/arendora,http://localhost:5173
//     (защита от подмены redirect_to; без неё соц-вход выключен)
//   OAUTH_STATE_SECRET — опц., подпись state (иначе SERVICE_ROLE)
//
// Деплой: supabase functions deploy oauth --no-verify-jwt
// (функция вызывается браузером до входа, JWT проверять нельзя).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STATE_SECRET = Deno.env.get("OAUTH_STATE_SECRET") || SERVICE_ROLE;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ——— Провайдеры ———

type Provider = "yandex" | "vk" | "mailru";

const PROVIDERS: Record<Provider, { clientId: string; clientSecret: string; label: string }> = {
  yandex: {
    clientId: Deno.env.get("YANDEX_CLIENT_ID") || "",
    clientSecret: Deno.env.get("YANDEX_CLIENT_SECRET") || "",
    label: "Яндекс",
  },
  vk: {
    clientId: Deno.env.get("VK_CLIENT_ID") || "",
    clientSecret: Deno.env.get("VK_CLIENT_SECRET") || "",
    label: "VK",
  },
  mailru: {
    clientId: Deno.env.get("MAILRU_CLIENT_ID") || "",
    clientSecret: Deno.env.get("MAILRU_CLIENT_SECRET") || "",
    label: "Mail.ru",
  },
};

const CALLBACK_BASE = `${SUPABASE_URL}/functions/v1/oauth/callback`;

function callbackUrl(provider: Provider) {
  // VK и Mail.ru запрещают query-параметры в Redirect URI — для них
  // провайдер берём из подписанного state (см. handleCallback)
  return provider === "vk" || provider === "mailru"
    ? `${SUPABASE_URL}/functions/v1/oauth/callback`
    : `${CALLBACK_BASE}?provider=${provider}`;
}

// ——— base64url + HMAC для подписи state ———

const enc = new TextEncoder();

function b64urlEncode(data: Uint8Array | string): string {
  const bin = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey("raw", enc.encode(STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signState(payload: unknown): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifyState(state: string): Promise<Record<string, unknown> | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const key = await hmacKey();
  const expected = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const given = b64urlDecode(sig);
  // постоянное время сравнения
  if (expected.byteLength !== given.length) return null;
  let diff = 0;
  const exp = new Uint8Array(expected);
  for (let i = 0; i < given.length; i++) diff |= exp[i] ^ given[i];
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof payload.e === "number" && payload.e < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ——— Разрешённые редиректы ———

function isRedirectAllowed(redirectTo: string): boolean {
  const raw = Deno.env.get("OAUTH_ALLOWED_REDIRECTS") || "";
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes("*")) return true;
  try {
    const origin = new URL(redirectTo).origin;
    return allowed.includes(origin);
  } catch {
    return false;
  }
}

// ——— Ошибки: человекочитаемая страница (пользователь идёт по 302-цепочке) ———

function errorPage(message: string, status = 400) {
  return new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arendora — вход</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}
.card{max-width:420px;padding:32px;text-align:center;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.06)}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#64748b;margin:0}</style></head>
<body><div class="card"><h1>Не удалось войти</h1><p>${message}</p></div></body></html>`,
    { status, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } }
  );
}

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { ...cors, Location: url } });
}

// ——— Профиль провайдера → общая форма ———

type Profile = { email: string; full_name: string; syntheticEmail: boolean };

async function fetchYandex(accessToken: string): Promise<Profile> {
  const res = await fetch("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!res.ok) throw new Error(`yandex info ${res.status}`);
  const d = await res.json();
  const login = String(d.login || "");
  const email = d.default_email || (login.includes("@") ? login : `ya${d.id}@yandex.local`);
  const name = d.real_name || d.display_name || (login.includes("@") ? login.split("@")[0] : login) || "Пользователь";
  return { email, full_name: name, syntheticEmail: !d.default_email && !login.includes("@") };
}

async function fetchVk(accessToken: string, clientId: string): Promise<Profile> {
  const res = await fetch("https://id.vk.com/api/v2/userinfo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`vk userinfo ${res.status}`);
  const d = await res.json();
  const u = d.user || {};
  const id = u.user_id || d.user_id;
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Пользователь";
  // email приходит только при одобренном scope email — иначе синтетический
  const email = u.email || `vk${id}@vk.local`;
  return { email, full_name: name, syntheticEmail: !u.email };
}

async function fetchMailru(accessToken: string): Promise<Profile> {
  const res = await fetch(`https://oauth.mail.ru/userinfo?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error(`mailru userinfo ${res.status}`);
  const d = await res.json();
  const name = d.first_name && d.last_name ? `${d.first_name} ${d.last_name}` : d.nickname || d.first_name || "Пользователь";
  return { email: d.email, full_name: name, syntheticEmail: !d.email };
}

// ——— Пользователь Supabase: находим или создаём, выдаём token_hash ———

async function ensureUserAndToken(email: string, fullName: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const randomPassword = crypto.randomUUID() + crypto.randomUUID();

  // Пользователь может уже существовать (email-регистрация или прошлый соц-вход).
  // Не существует → создаём подтверждённым, с метаданными как при обычной
  // регистрации (триггер БД сделает профиль владельца).
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!existing) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "owner" },
    });
    // гонка/дубль — пользователь мог появиться между проверкой и созданием
    if (createErr && !/already|registered|exist/i.test(createErr.message)) throw createErr;
  }

  // Одноразовая ссылка входа: выдаём не письмо, а token_hash фронту.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  const hash = link.properties?.hashed_token;
  if (!hash) throw new Error("no hashed_token");
  return hash;
}

// ——— Обработчики ———

async function handleStart(req: Request, url: URL) {
  const provider = url.searchParams.get("provider") as Provider | null;
  const redirectTo = url.searchParams.get("redirect_to") || "";

  if (!provider || !PROVIDERS[provider]) return errorPage("Неизвестный провайдер входа.");
  if (!isRedirectAllowed(redirectTo)) {
    return errorPage(
      "Соц-вход не настроен: домен приложения не в списке разрешённых. Владельцу — добавьте origin приложения в секрет OAUTH_ALLOWED_REDIRECTS."
    );
  }
  const conf = PROVIDERS[provider];
  if (!conf.clientId || !conf.clientSecret) {
    return errorPage(`Вход через ${conf.label} ещё не настроен: добавьте YANDEX/VK/MAILRU_CLIENT_ID и CLIENT_SECRET в секреты функции.`);
  }

  const payload: Record<string, unknown> = {
    p: provider,
    r: redirectTo,
    d: crypto.randomUUID(), // device_id для VK
    n: crypto.randomUUID(),
    e: Date.now() + 10 * 60 * 1000,
  };

  // PKCE для VK ID (OAuth 2.1 требует): challenge уйдёт в authorize-ссылку,
  // verifier храним в подписанном state и отдаём при обмене кода
  let vkChallenge = "";
  if (provider === "vk") {
    const verifier = b64urlEncode(crypto.getRandomValues(new Uint8Array(48)));
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(verifier));
    vkChallenge = b64urlEncode(new Uint8Array(digest));
    payload.v = verifier;
  }

  // подписываем state ПОСЛЕ всех добавлений (в т.ч. PKCE-verifier для VK)
  const state = await signState(payload);

  let authorizeUrl: string;
  if (provider === "yandex") {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: conf.clientId,
      redirect_uri: callbackUrl(provider),
      state,
    });
    authorizeUrl = `https://oauth.yandex.ru/authorize?${q}`;
  } else if (provider === "vk") {
    // scope email требует одобрения VK: без него вход падает целиком,
    // поэтому по умолчанию только personal_info (переопределяется VK_SCOPE)
    const scope = Deno.env.get("VK_SCOPE") || "vkid.personal_info";
    const q = new URLSearchParams({
      response_type: "code",
      client_id: conf.clientId,
      redirect_uri: callbackUrl(provider),
      state,
      device_id: payload.d as string,
      scope,
      code_challenge: vkChallenge,
      code_challenge_method: "S256",
    });
    authorizeUrl = `https://id.vk.com/authorize?${q}`;
  } else {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: conf.clientId,
      redirect_uri: callbackUrl(provider),
      state,
      scope: "userinfo",
    });
    authorizeUrl = `https://oauth.mail.ru/login?${q}`;
  }
  return redirect(authorizeUrl);
}

async function handleCallback(req: Request, url: URL) {
  const state = url.searchParams.get("state") || "";
  const statePayload = await verifyState(state);
  // Провайдер: из ?provider= (Яндекс, Mail.ru) или из подписанного state
  // (VK — его Redirect URI без query-параметров)
  const provider = (url.searchParams.get("provider") as Provider | null) ||
    ((statePayload?.p as Provider) || null);
  const conf = provider ? PROVIDERS[provider] : null;
  if (!provider || !conf) return errorPage("Неизвестный провайдер входа.");

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return errorPage(`${conf.label} отклонил вход: ${url.searchParams.get("error_description") || oauthError}`);
  }

  const payload = statePayload;
  if (!payload || payload.p !== provider) return errorPage("Проверка безопасности не пройдена (state). Попробуйте войти заново.");
  const redirectTo = String(payload.r || "");
  if (!isRedirectAllowed(redirectTo)) return errorPage("Домен приложения не разрешён (OAUTH_ALLOWED_REDIRECTS).");

  const code = url.searchParams.get("code");
  if (!code) return errorPage(`${conf.label} не вернул код авторизации.`);

  try {
    let accessToken = "";
    if (provider === "yandex") {
      const res = await fetch("https://oauth.yandex.ru/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: conf.clientId,
          client_secret: conf.clientSecret,
        }),
      });
      if (!res.ok) throw new Error(`yandex token ${res.status}: ${(await res.text()).slice(0, 200)}`);
      accessToken = (await res.json()).access_token;
      if (!accessToken) throw new Error("yandex: нет access_token");
    } else if (provider === "vk") {
      const res = await fetch("https://id.vk.com/oauth2/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          client_id: conf.clientId,
          client_secret: conf.clientSecret,
          redirect_uri: callbackUrl(provider),
          device_id: payload.d,
          state,
          code_verifier: payload.v || "",
        }),
      });
      if (!res.ok) throw new Error(`vk token ${res.status}: ${(await res.text()).slice(0, 200)}`);
      accessToken = (await res.json()).access_token;
      if (!accessToken) throw new Error("vk: нет access_token");
    } else {
      const res = await fetch("https://oauth.mail.ru/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: conf.clientId,
          client_secret: conf.clientSecret,
          redirect_uri: callbackUrl(provider),
        }),
      });
      if (!res.ok) throw new Error(`mailru token ${res.status}: ${(await res.text()).slice(0, 200)}`);
      accessToken = (await res.json()).access_token;
      if (!accessToken) throw new Error("mailru: нет access_token");
    }

    const profile =
      provider === "yandex"
        ? await fetchYandex(accessToken)
        : provider === "vk"
          ? await fetchVk(accessToken, conf.clientId)
          : await fetchMailru(accessToken);

    const tokenHash = await ensureUserAndToken(profile.email, profile.full_name);

    const target = new URL(redirectTo);
    target.searchParams.set("token_hash", tokenHash);
    target.searchParams.set("type", "magiclink");
    return redirect(target.toString());
  } catch (e) {
    console.error("oauth callback failed:", e);
    return errorPage(`Ошибка при входе через ${conf.label}. Попробуйте ещё раз. (${String(e?.message || e).slice(0, 140)})`, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (url.pathname.endsWith("/start")) return handleStart(req, url);
  if (url.pathname.endsWith("/callback")) return handleCallback(req, url);
  return json({ error: "not found" }, 404);
});
