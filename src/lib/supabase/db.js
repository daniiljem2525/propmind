import { supabase } from "./config";
import { isDemoMode } from "@/lib/demoMode";
import { notifyCollection } from "@/lib/data/events";

// Supabase-реализация сущностей: тот же интерфейс, что у localStorage-версии.
// owner_id проставляется на стороне БД (default auth.uid()), RLS — граница доступа.

const clean = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));

export function makeEntity(collection, defaults = {}) {
  const resolveDefaults = async () =>
    typeof defaults === "function" ? { ...defaults() } : { ...defaults };

  return {
    collection,

    async list() {
      // Строгое разделение: демо-режим показывает только демо-записи,
      // обычный — только реальные.
      const q = isDemoMode()
        ? supabase.from(collection).select("*").eq("is_demo", true)
        : supabase.from(collection).select("*").eq("is_demo", false);
      const { data, error } = await q.order("created_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async listAll() {
      const { data, error } = await supabase
        .from(collection)
        .select("*")
        .order("created_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async getById(id) {
      const { data, error } = await supabase
        .from(collection)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async create(data) {
      const defaults = await resolveDefaults();
      // Новая запись наследует текущий режим: созданное в демо — демо.
      // Явный флаг в data (сид) переопределяет.
      const payload = { is_demo: isDemoMode(), ...defaults, ...clean(data) };
      // .select() массивом, без .single(): запись могла не вернуться из-за
      // гонки realtime — нельзя показывать «ошибку», когда вставка прошла.
      const { data: rows, error } = await supabase.from(collection).insert(payload).select();
      if (error) throw error;
      notifyCollection(collection); // свой список обновляем сразу, без ожидания realtime
      return rows?.[0] ?? { ...payload };
    },

    async bulkCreate(items) {
      const payload = [];
      for (let i = 0; i < items.length; i++) {
        const defaults = await resolveDefaults();
        payload.push({ is_demo: isDemoMode(), ...defaults, ...clean(items[i]) });
      }
      const { data: rows, error } = await supabase.from(collection).insert(payload).select();
      if (error) throw error;
      notifyCollection(collection);
      return rows || payload;
    },

    async update(id, patch) {
      // Массив вместо .single(): при 0 строк (RLS/удалена) ошибка понятнее,
      // при гонке realtime не падает PGRST116 на успешном обновлении.
      const { data: rows, error } = await supabase
        .from(collection)
        .update(clean(patch))
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!rows || rows.length === 0) throw new Error("ROW_NOT_FOUND");
      notifyCollection(collection);
      return rows[0];
    },

    async delete(id) {
      const { error } = await supabase.from(collection).delete().eq("id", id);
      if (error) throw error;
      notifyCollection(collection);
      return true;
    },
  };
}

// Realtime: много подписчиков на одну таблицу — один канал, набор колбэков.
// Имена каналов уникальны (счётчик), чтобы дубли не конфликтовали.
const channels = new Map();
let channelSeq = 0;
// Ограниченный контекст (iOS Safari в приватном режиме / запрет cookie): первая
// же попытка подписки бросает SecurityError — после неё realtime не пытаемся
// больше нигде на этой странице (до перезагрузки), иначе внутренние
// retry-таймеры транспорта стреляют тем же SecurityError уже асинхронно.
let realtimeBlocked = false;

export function subscribeSupabase(collection, cb) {
  if (!supabase || realtimeBlocked) return () => {};
  if (!channels.has(collection)) {
    const cbs = new Set();
    channelSeq += 1;
    let channel = null;
    try {
      channel = supabase
        .channel(`rt-${collection}-${channelSeq}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: collection },
          () => cbs.forEach((f) => f())
        )
        .subscribe((status) => {
          // Ошибка канала после подключения (сеть, рестарт сервера) — тоже
          // не бросаем: live-обновления необязательны, данные придут при
          // следующем fetch/мутации.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`realtime: канал «${collection}» — ${status}, live-обновления недоступны`);
          }
        });
    } catch (error) {
      // iOS Safari (приватный режим / запрет cookie) бросает SecurityError
      // «The operation is insecure» синхронно из .subscribe() → connect()
      // («WebSocket not available: …»). Раньше эта ошибка уходила в error
      // boundary и роняла весь интерфейс красным экраном. Деградация:
      // работаем без live-обновлений — мутации этой вкладки шлют
      // notifyCollection, данные перечитываются при следующем fetch.
      console.warn(
        `realtime: подписка «${collection}» не удалась (${error?.message || error}) — live-обновления отключены`
      );
      // Разбираем неудавшуюся попытку до конца: канал уже зарегистрирован в
      // клиенте, а транспортный адаптер успел навесить таймеры/обработчики до
      // броска — без этой зачистки они выстреливают SecurityError асинхронно
      // (уходит в window.onerror → ERR-плашка поверх работающего интерфейса).
      realtimeBlocked = true;
      try {
        channel?.unsubscribe?.();
      } catch {}
      try {
        supabase.realtime.remove(channel);
      } catch {}
      try {
        supabase.realtime.disconnect()?.catch?.(() => {});
      } catch {}
      channel = null;
    }
    channels.set(collection, { channel, cbs }); // channel=null — режим деградации
  }
  const entry = channels.get(collection);
  entry.cbs.add(cb);
  return () => {
    entry.cbs.delete(cb);
    if (entry.cbs.size === 0) {
      if (entry.channel) {
        try {
          supabase.removeChannel(entry.channel);
        } catch {}
      }
      channels.delete(collection); // при следующей подписке канал будет создан заново
    }
  };
}

// События авторизации: не realtime-таблица, а onAuthStateChange.
// Колбэк ОБЯЗАН уходить из синхронного контекста события (setTimeout):
// onAuthStateChange вызывается под внутренним локом auth, и любой
// await-вызов (getUser и т.п.) внутри колбэка дедлочит сессию навсегда.
export function subscribeAuth(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => setTimeout(cb, 0));
  return () => data?.subscription?.unsubscribe();
}
