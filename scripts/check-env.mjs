// Guard прод-сборки: без валидного VITE_SUPABASE_ANON_KEY vite соберёт
// приложение в localStorage-режиме (isSupabaseConfigured = false) — на проде
// это выглядит как падение интерфейса (FX(...).then is not a function,
// инцидент 2026-11-06). Ломаем сборку раньше, чем она попадёт на сервер.
import { readFileSync, existsSync } from "node:fs";

const key =
  process.env.VITE_SUPABASE_ANON_KEY || readEnvProduction("VITE_SUPABASE_ANON_KEY");

if (!key || key.length <= 20 || key.includes("ТВОЙ")) {
  console.error(
    "\n[check-env] Сборка отменена: нет валидного VITE_SUPABASE_ANON_KEY.\n" +
      "Приложение соберётся в localStorage-режиме без облачного бэкенда.\n" +
      "Создайте .env.production (см. .env.example) или задайте переменную окружения.\n"
  );
  process.exit(1);
}

console.log("[check-env] VITE_SUPABASE_ANON_KEY найден — собираем облачную версию.");

function readEnvProduction(name) {
  if (!existsSync(".env.production")) return "";
  const line = readFileSync(".env.production", "utf-8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
}
