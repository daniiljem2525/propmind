import { supabase } from "./config";

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
      const payload = { ...defaults, ...clean(data) };
      const { data: row, error } = await supabase
        .from(collection)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return row;
    },

    async bulkCreate(items) {
      const now = Date.now();
      const payload = [];
      for (let i = 0; i < items.length; i++) {
        const defaults = await resolveDefaults();
        payload.push({ ...defaults, ...clean(items[i]) });
      }
      const { data, error } = await supabase.from(collection).insert(payload).select();
      if (error) throw error;
      return data || [];
    },

    async update(id, patch) {
      const { data, error } = await supabase
        .from(collection)
        .update(clean(patch))
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
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

// События авторизации: не realtime-таблица, а onAuthStateChange
export function subscribeAuth(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => cb());
  return () => data?.subscription?.unsubscribe();
}
