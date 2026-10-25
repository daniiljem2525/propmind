import { supabase } from "./config";
import { isDemoMode } from "@/lib/demoMode";

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
      return rows[0];
    },

    async delete(id) {
      const { error } = await supabase.from(collection).delete().eq("id", id);
      if (error) throw error;
      return true;
    },
  };
}

// Realtime: много подписчиков на одну таблицу — один канал, набор колбэков.
// Имена каналов уникальны (счётчик), чтобы дубли не конфликтовали.
const channels = new Map();
let channelSeq = 0;

export function subscribeSupabase(collection, cb) {
  if (!supabase) return () => {};
  if (!channels.has(collection)) {
    const cbs = new Set();
    channelSeq += 1;
    const channel = supabase
      .channel(`rt-${collection}-${channelSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: collection },
        () => cbs.forEach((f) => f())
      )
      .subscribe();
    channels.set(collection, { channel, cbs });
  }
  const entry = channels.get(collection);
  entry.cbs.add(cb);
  return () => {
    entry.cbs.delete(cb);
    if (entry.cbs.size === 0) {
      supabase.removeChannel(entry.channel);
      channels.delete(collection);
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
