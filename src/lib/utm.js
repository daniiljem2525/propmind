// UTM-атрибуция рекламного трафика (Яндекс Директ и др.).
//
// Задача: по аккаунту видно, из какой кампании пришёл клиент —
// метки сохраняются в localStorage при первом визите, не гибнут на
// внутренних SPA-переходах (CTA лендинга — это <Link to="/register">),
// и прикрепляются к аккаунту при регистрации (raw_user_meta_data →
// читают админка/биллинг). P0 из ревью NT-027 (site-review-2026-11-06 №2).
//
// Хранение по аналогии с arendora:inviteCode — ключ arendora:utm.
// Храним обе метки: first-touch (первый визит) и last-touch (последний
// визит с метками) — биллинг атрибутирует по last-touch, first-touch
// сохраняется для аналитики. Без меток в URL запись не трогаем, поэтому
// переходы внутри SPA и возврат из соц-входа атрибуцию не сбрасывают.
// Запись живёт 30 дней (TTL), после успешной регистрации удаляется.

import { supabase, isSupabaseConfigured } from "@/lib/supabase/config";

const UTM_KEY = "arendora:utm";
const UTM_TTL = 30 * 24 * 60 * 60 * 1000; // 30 дней

// UTM-метки + клик-идентификаторы рекламных систем (Директ: ysclid/gclid)
const UTM_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "yclid",
  "ysclid",
  "fbclid",
];

const MAX_VALUE_LEN = 512; // защита от мусорных сверхдлинных значений

// utm_source → source: ключи храним и отдаём без префикса «utm_»
// (в metadata аккаунта это и есть имена полей атрибуции)
function normalizeKey(field) {
  return field.replace(/^utm_/, "");
}

function readRecord() {
  try {
    const raw = localStorage.getItem(UTM_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== "object" || !rec.last) return null;
    // Просроченная запись (TTL 30 дней) — считаем отсутствующей
    if (rec.updated_at && Date.now() - rec.updated_at > UTM_TTL) {
      localStorage.removeItem(UTM_KEY);
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

// Метки текущего URL: объект { source: ..., campaign: ..., gclid: ... } или null
function pickParams() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  if (!search) return null;
  const sp = new URLSearchParams(search);
  const params = {};
  for (const field of UTM_FIELDS) {
    const value = sp.get(field);
    if (value) params[normalizeKey(field)] = value.slice(0, MAX_VALUE_LEN);
  }
  return Object.keys(params).length ? params : null;
}

// Вызывается один раз при старте приложения (main.jsx). Первая метка
// фиксируется как first-touch; последующие визиты с метками обновляют
// только last-touch. Визиты без меток ничего не меняют.
export function captureUtm() {
  const params = pickParams();
  if (!params) return false;
  const capturedAt = new Date().toISOString();
  const rec = readRecord(); // просроченная удаляется и возвращает null
  const next =
    !rec || !rec.first
      ? // Первое касание: first-touch и last-touch совпадают
        { first: { ...params, captured_at: capturedAt }, last: { ...params, captured_at: capturedAt } }
      : // Повторный визит: last-touch — новые метки поверх прежних
        // (повторный клик Директа может прислать неполный набор, например
        // без utm_medium — терять остальное не нужно)
        { ...rec, last: { ...rec.last, ...params, captured_at: capturedAt } };
  next.updated_at = Date.now();
  try {
    localStorage.setItem(UTM_KEY, JSON.stringify(next));
  } catch {}
  return true;
}

// Актуальная запись (или null, если меток не было / TTL истёк)
export function getStoredUtm() {
  return readRecord();
}

// Плоский объект для user_metadata (читает биллинг): метки + время фиксации
function toMetadata(mark) {
  if (!mark) return undefined;
  const out = { captured_at: mark.captured_at };
  for (const field of UTM_FIELDS) {
    if (mark[normalizeKey(field)]) out[normalizeKey(field)] = mark[normalizeKey(field)];
  }
  return out;
}

// Объект для options.data при signUp: last-touch поверх + first-touch.
// undefined, когда меток нет — в metadata ключ не попадает вовсе.
export function utmSignupPayload() {
  const rec = readRecord();
  if (!rec?.last) return undefined;
  const payload = toMetadata(rec.last);
  if (rec.first) payload.first_touch = toMetadata(rec.first);
  return payload;
}

// Соц-вход (Яндекс/VK/Mail.ru): аккаунт создаёт edge-функция oauth без
// наших меток, поэтому после первой сессии дописываем атрибуцию сами —
// в raw_user_meta_data (updateUser) и в profiles.utm (админка; триггер
// до этого момента не сработал — он ставит utm только при INSERT).
// Атрибуция — про ПРИОБРЕТЕНИЕ: входим в уже существующий аккаунт →
// метки не пишем (учётная запись создана давно, кампания к ней не относится).
// Вызывается один раз после verifyOtp в SocialCallback.
export async function attachUtmToSession() {
  if (!isSupabaseConfigured) return false;
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return false;
  const payload = utmSignupPayload();
  const accountAge = Date.now() - new Date(user.created_at || 0).getTime();
  const isNewAccount = accountAge < 10 * 60 * 1000; // создан последнюю минуту/минуты
  try {
    if (payload && isNewAccount) {
      // 1) metadata аккаунта — источник атрибуции для биллинга
      await supabase.auth.updateUser({ data: { utm: payload } });
      // 2) дубль в profiles для таблицы пользователей в админке.
      //    Право на колонку выдаёт schema.sql (grant update (…, utm));
      //    пока миграция не применена — обновление упадёт, вход это не ломает.
      await supabase.from("profiles").update({ utm: payload }).eq("id", user.id);
    }
  } catch (err) {
    // Атрибуция не должна ломать вход: metadata уже записана, profiles — best effort
    console.warn("utm attach failed:", err);
  }
  // Метки визита использованы (или неактуальны для старого аккаунта) — чистим
  clearUtm();
  return true;
}

// После успешной регистрации атрибуция записана в аккаунт — локальное
// хранение больше не нужно (задача NT-027: очистка после записи в аккаунт)
export function clearUtm() {
  try {
    localStorage.removeItem(UTM_KEY);
  } catch {}
}
