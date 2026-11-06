// Фасад подписок и сырого чтения: localStorage или Supabase realtime.
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { subscribeSupabase, subscribeAuth } from "@/lib/supabase/db";
import { subscribeCollection } from "@/lib/data/events";
import * as local from "@/lib/data/localDb";

// Облачный режим: realtime + локальная шина мутаций этой вкладки.
// Realtime может молчать (таблица вне публикации, канал не успел
// подключиться) — свои же изменения должны отражаться всегда, поэтому
// дублируем подписку на шину (двойной load() безвреден: чтение идемпотентно).
export const subscribe = (name, cb) => {
  if (!isSupabaseConfigured) return local.subscribe(name, cb);
  if (name === "auth") return subscribeAuth(cb); // "auth" — не таблица
  const unCloud = subscribeSupabase(name, cb);
  const unLocal = subscribeCollection(name, cb);
  return () => {
    unCloud();
    unLocal();
  };
};

// Синхронное raw-чтение — только для localStorage-режима.
// В облачном режиме используй async-версию readCollectionAsync.
export const readCollection = local.readCollection;
export const writeCollection = local.writeCollection;

export async function readCollectionAsync(name) {
  if (!isSupabaseConfigured) return local.readCollection(name);
  const { supabase } = await import("@/lib/supabase/config");
  const { data, error } = await supabase.from(name).select("*");
  if (error) return [];
  return data || [];
}
