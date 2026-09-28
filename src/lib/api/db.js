// Фасад подписок и сырого чтения: localStorage или Supabase realtime.
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { subscribeSupabase } from "@/lib/supabase/db";
import * as local from "@/lib/data/localDb";

export const subscribe = (name, cb) =>
  isSupabaseConfigured ? subscribeSupabase(name, cb) : local.subscribe(name, cb);

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
