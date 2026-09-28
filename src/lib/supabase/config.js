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

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
