import { createClient } from "@supabase/supabase-js";

// ============================================================
// Конфигурация Supabase.
// Вставь сюда Project URL и anon public key из Supabase
// (Settings → API) — после этого приложение перейдёт в
// облачный режим: жильцы и исполнители заходят со своих
// устройств, данные синхронизируются между всеми.
//
// Ключ anon — публичный по дизайну: граница безопасности —
// RLS-политики в supabase/schema.sql, а не секретность ключа.
// ============================================================

export const SUPABASE_URL = "https://bhxwpkplqjzhfqwckine.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_H3Vk7JOk4DJWMBod6CvV6Q_IRDhrqww";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("ТВОЙ") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("ТВОЙ");

// ——— Надёжное хранение сессии ———
// iOS у домашних PWA при выгрузке приложения (свайп из недавних)
// может вычищать localStorage — и каждый запуск требовал заново
// входить. Сессия дублируется в cookie и IndexedDB; при чтении
// берём первый непустой источник, так что сессия переживает чистку.

function cookieGet(name) {
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)")
  );
  return m ? decodeURIComponent(m[1]) : null;
}

// Cookie ограничена ~4 КБ: слишком длинное значение браузер молча
// отбросит, поэтому не пишем его вовсе — остаётся IndexedDB.
function cookieSet(name, value) {
  if (value.length > 3500) return;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
}

function cookieDel(name) {
  document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
}

function withIdb(mode, fn) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const open = indexedDB.open("arendora-auth", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => {
        resolve(req && "result" in req ? req.result : null);
        db.close();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

export const robustStorage = {
  async getItem(key) {
    let v = null;
    try {
      v = localStorage.getItem(key);
    } catch {}
    if (v != null) return v;
    v = cookieGet(key);
    if (v != null) return v;
    try {
      return (await withIdb("readonly", (s) => s.get(key))) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
    try {
      cookieSet(key, value);
    } catch {}
    try {
      await withIdb("readwrite", (s) => s.put(value, key));
    } catch {}
  },
  async removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
    try {
      cookieDel(key);
    } catch {}
    try {
      await withIdb("readwrite", (s) => s.delete(key));
    } catch {}
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: robustStorage, persistSession: true, autoRefreshToken: true },
    })
  : null;

// Диагностика: сколько байт сессии лежит в каждом из хранилищ и жив ли
// сервис-воркер. Показывается на экране логина — так видно, чистит ли
// iOS хранилище PWA при выгрузке приложения (свайп из недавних).
export async function probeSessionStores() {
  const key = "sb-bhxwpkplqjzhfqwckine-auth-token";
  let ls = 0;
  try {
    ls = (localStorage.getItem(key) || "").length;
  } catch {}
  let ck = 0;
  try {
    ck = (cookieGet(key) || "").length;
  } catch {}
  let idb = 0;
  try {
    const v = await withIdb("readonly", (s) => s.get(key));
    idb = (v || "").length;
  } catch {}
  let sw = false;
  try {
    sw = !!(
      navigator.serviceWorker &&
      (await navigator.serviceWorker.getRegistration())
    );
  } catch {}
  return { ls, ck, idb, sw };
}
