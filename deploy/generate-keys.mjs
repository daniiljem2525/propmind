// Генератор секретов для self-hosted Supabase.
// Запуск: node deploy/generate-keys.mjs
// Создаёт: JWT_SECRET + подписанные ANON_KEY и SERVICE_ROLE_KEY
// (HS256 JWT с role-claim, как ожидает стек Supabase).
// Вывод — готовый фрагмент .env. Храните вывод в секрете!
import crypto from "node:crypto";

const JWT_SECRET = crypto.randomBytes(48).toString("base64");

function sign(role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role,
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600, // 10 лет
    })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const POSTGRES_PASSWORD = crypto.randomBytes(24).toString("base64url");
const DASHBOARD_PASSWORD = crypto.randomBytes(16).toString("base64url");
const SECRET_KEY_BASE =
  crypto.randomBytes(48).toString("base64"); // для realtime (Elixir)
const PUSH_WEBHOOK_SECRET = crypto.randomBytes(24).toString("base64url");
const EMAIL_WEBHOOK_SECRET = crypto.randomBytes(24).toString("base64url");

// VAPID для web-push: P-256, публичный — несжатая точка (65 байт).
// Новые ключи = старым устройствам нужно один раз переподписаться на пуши.
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const jwkPub = publicKey.export({ format: "jwk" });
const jwkPriv = privateKey.export({ format: "jwk" });
const b64u = (s) => Buffer.from(s, "base64url");
const VAPID_PUBLIC_KEY = Buffer.concat([
  Buffer.from([4]),
  b64u(jwkPub.x),
  b64u(jwkPub.y),
]).toString("base64url");
const VAPID_PRIVATE_KEY = b64u(jwkPriv.d).toString("base64url");

console.log(`# --- вставить в /opt/arendora/stack/.env ---
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${sign("anon")}
SERVICE_ROLE_KEY=${sign("service_role")}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
JWT_EXPIRY=3600
PUSH_WEBHOOK_SECRET=${PUSH_WEBHOOK_SECRET}
EMAIL_WEBHOOK_SECRET=${EMAIL_WEBHOOK_SECRET}
DASHBOARD_USERNAME=arendora
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
SITE_URL=https://arendora.ru
API_EXTERNAL_URL=https://api.arendora.ru
# --- web-push ---
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
# --- SMTP своего почтового хостинга (заполнить вручную) ---
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
# --- соцвход (когда появятся приложения у Яндекс/VK/Mail.ru) ---
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
VK_CLIENT_ID=
VK_CLIENT_SECRET=
MAILRU_CLIENT_ID=
MAILRU_CLIENT_SECRET=
# --- конец фрагмента ---`);
