import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const localeOf = (lang) => (lang === "ru" ? "ru-RU" : "en-US");

export function formatMoney(amount, currency = "RUB", lang = "ru") {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(localeOf(lang), {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString(localeOf(lang))} ${currency}`;
  }
}

export function formatNumber(value, lang = "ru") {
  return new Intl.NumberFormat(localeOf(lang)).format(Number(value) || 0);
}

export function formatDate(iso, lang = "ru", opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(localeOf(lang), opts);
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysUntil(iso) {
  if (!iso) return null;
  const now = new Date(todayISO());
  const then = new Date(iso);
  return Math.round((then - now) / 86400000);
}

export function monthShort(monthIndex, lang = "ru") {
  return new Date(2024, monthIndex, 1).toLocaleDateString(localeOf(lang), { month: "short" });
}

export function monthLong(monthIndex, lang = "ru") {
  return new Date(2024, monthIndex, 1).toLocaleDateString(localeOf(lang), { month: "long" });
}

export function formatFileSize(bytes, lang = "ru") {
  if (!bytes && bytes !== 0) return "—";
  const units = lang === "ru" ? ["Б", "КБ", "МБ"] : ["B", "KB", "MB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
}
