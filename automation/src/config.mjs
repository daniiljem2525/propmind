// Загрузка .env и маппинг категорий Arendora на услуги Профи.ру.
import "dotenv/config";

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v) => v === "1" || v === "true";

export const config = {
  supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/+$/, ""),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || "",
  pollIntervalSec: num(process.env.POLL_INTERVAL_SEC, 20),
  headless: bool(process.env.HEADLESS ?? "1"),
  defaultAddress: process.env.DEFAULT_ADDRESS || "",
  autoEnqueue: bool(process.env.AUTO_ENQUEUE_NEW_REQUESTS ?? "0"),
  dryRun: bool(process.env.DRY_RUN ?? "0"),
  profileDir: process.env.PROFILE_DIR || "./state/profi-profile",
};

export function assertConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseKey) missing.push("SUPABASE_SERVICE_KEY");
  if (missing.length) {
    throw new Error(
      `Не заполнен .env: ${missing.join(", ")}. Скопируйте .env.example в .env и заполните.`,
    );
  }
}

// category заявки → что вводить в «Услуга или специалист» на Профи.ру
export const CATEGORY_TO_SERVICE = {
  plumbing: "сантехник",
  electrical: "электрик",
  appliances: "ремонт бытовой техники",
  furniture: "сборка мебели",
  other: "",
};

// urgency заявки → срок на шаге «Когда нужна услуга?»
export const URGENCY_TO_DEADLINE = {
  emergency: "today",
  high: "today",
  medium: "week",
  low: "anytime",
};
