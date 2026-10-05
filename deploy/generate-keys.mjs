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

console.log(`# --- вставить в /opt/supabase/docker/.env ---
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${sign("anon")}
SERVICE_ROLE_KEY=${sign("service_role")}
DASHBOARD_USERNAME=arendora
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
SITE_URL=https://daniiljem2525.github.io/propmind/
API_EXTERNAL_URL=https://supabase.arendora.ru
# --- конец фрагмента ---`);
