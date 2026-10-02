import { readCollection, writeCollection, notifyAuth } from "./localDb";
import { registerCurrentUserFn } from "./localEntities";
import { uid } from "@/lib/utils";

const NAME = "users";
const SESSION_KEY = "arendora:session";
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // сессия живёт 7 дней
const DEMO_HASH = "6aafa1776f70b876fd83b155ec8c4466553e963af3500de7f3613db45d44e37e"; // sha256("arendora:secret123")

// Настоящий SHA-256 (Web Crypto). Формат хранения: "sha256:<hex>".
async function hash(password) {
  const data = new TextEncoder().encode(`arendora:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return "sha256:" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Совместимость со старыми записями (btoa-«хеш») + миграция на SHA-256
async function verifyPassword(users, user, password) {
  const newHash = await hash(password);
  if (user.password_hash === newHash) return true;
  if (!String(user.password_hash || "").startsWith("sha256:")) {
    const legacy = btoa(unescape(encodeURIComponent(`pm:${password}`)));
    if (user.password_hash === legacy) {
      user.password_hash = newHash; // миграция при первом же входе
      writeUsers(users);
      return true;
    }
  }
  return false;
}

const readUsers = () => readCollection(NAME);
const writeUsers = (rows) => writeCollection(NAME, rows);

const publicUser = (u) =>
  u && {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    plan: u.plan || "free",
    status: u.status,
    created_date: u.created_date,
  };

export function getCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session?.user_id) return null;
    // TTL сессии: по истечении 7 дней вход требуется заново
    if (session.issued_at && Date.now() - session.issued_at > SESSION_TTL) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return publicUser(readUsers().find((u) => u.id === session.user_id));
  } catch {
    return null;
  }
}

registerCurrentUserFn(getCurrentUser);

function setSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: userId, issued_at: Date.now() }));
  notifyAuth();
}

export async function signup({ full_name, email, password }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) throw new Error("EMAIL_INVALID");
  const users = readUsers();
  const existing = users.find((u) => u.email === normalized);
  if (existing && existing.status !== "invited") throw new Error("EMAIL_EXISTS");

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const password_hash = await hash(password);
  const otp_created = Date.now(); // код живёт 15 минут
  if (existing) {
    Object.assign(existing, { full_name, password_hash, status: "pending", otp, otp_created, otp_fails: 0 });
    writeUsers(users);
  } else {
    users.push({
      id: uid(),
      full_name,
      email: normalized,
      password_hash,
      role: "user",
      status: "pending",
      otp,
      otp_created,
      created_date: new Date().toISOString(),
    });
    writeUsers(users);
  }
  return { email: normalized, otp };
}

export function verifyOtp(email, otp) {
  const normalized = String(email || "").trim().toLowerCase();
  const users = readUsers();
  const user = users.find((u) => u.email === normalized);
  if (!user || user.status !== "pending" || !user.otp) {
    throw new Error("WRONG_OTP");
  }
  // Код живёт 15 минут, перебор ограничен 5 попытками
  if (Date.now() - (user.otp_created || 0) > 15 * 60 * 1000) {
    throw new Error("OTP_EXPIRED");
  }
  if ((user.otp_fails || 0) >= 5) {
    throw new Error("OTP_EXPIRED");
  }
  if (String(user.otp) !== String(otp)) {
    user.otp_fails = (user.otp_fails || 0) + 1;
    writeUsers(users);
    throw new Error("WRONG_OTP");
  }
  user.status = "active";
  user.otp = null;
  user.otp_created = null;
  user.otp_fails = 0;
  writeUsers(users);
  setSession(user.id);
  return publicUser(user);
}

// Гарантирует наличие готового демо-аккаунта администратора.
// Нужно для «Заполнить демо-аккаунт» на свежем браузере, где хранилище пустое.
export function ensureDemoAccount() {
  const email = "owner@arendora.test";
  const users = readUsers();
  if (users.some((u) => u.email === email)) return false;
  users.push({
    id: uid(),
    full_name: "Тестовый Владелец",
    email,
    password_hash: DEMO_HASH,
    role: "admin",
    status: "active",
    otp: null,
    created_date: new Date().toISOString(),
  });
  writeUsers(users);
  return true;
}

// Защита от перебора паролей: 5 неудач подряд → минута блокировки
const LOCK_KEY = "arendora:lockout";

function checkLockout() {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || "null");
    if (lock?.until && Date.now() < lock.until) return Math.ceil((lock.until - Date.now()) / 1000);
    if (lock?.until) localStorage.removeItem(LOCK_KEY);
  } catch {}
  return 0;
}

function registerFail() {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || "{}");
    const fails = (lock.fails || 0) + 1;
    localStorage.setItem(
      LOCK_KEY,
      JSON.stringify(fails >= 5 ? { fails: 0, until: Date.now() + 60000 } : { fails })
    );
  } catch {}
}

export async function login(email, password) {
  const wait = checkLockout();
  if (wait > 0) throw new Error("TOO_MANY_ATTEMPTS");

  const normalized = String(email || "").trim().toLowerCase();
  const users = readUsers();
  const user = users.find((u) => u.email === normalized);
  const ok = user && user.status !== "invited" && (await verifyPassword(users, user, password));
  if (!ok) {
    registerFail();
    throw new Error("WRONG_CREDENTIALS");
  }
  if (user.status === "pending") throw new Error("PENDING_ACCOUNT");
  localStorage.removeItem(LOCK_KEY);
  setSession(user.id);
  return publicUser(user);
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  notifyAuth();
}

export function requestPasswordReset(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const users = readUsers();
  const user = users.find((u) => u.email === normalized);
  if (!user) throw new Error("USER_NOT_FOUND");
  const token = uid().replace(/-/g, "").slice(0, 10);
  user.reset_token = token;
  user.reset_created = Date.now(); // ссылка живёт 30 минут
  writeUsers(users);
  return { token, email: normalized };
}

export async function resetPassword(token, password) {
  const users = readUsers();
  const user = users.find((u) => u.reset_token === String(token || "").trim());
  if (!user) throw new Error("USER_NOT_FOUND");
  // Токен сброса живёт 30 минут
  if (Date.now() - (user.reset_created || 0) > 30 * 60 * 1000) throw new Error("USER_NOT_FOUND");
  user.password_hash = await hash(password);
  user.reset_token = null;
  if (user.status === "pending") user.status = "active";
  writeUsers(users);
  return publicUser(user);
}

export async function changePassword(userId, current, next) {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!(await verifyPassword(users, user, current))) throw new Error("WRONG_PASSWORD");
  user.password_hash = await hash(next);
  writeUsers(users);
  return true;
}

export function updateProfile(userId, { full_name }) {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  user.full_name = full_name;
  writeUsers(users);
  notifyAuth();
  return publicUser(user);
}

export function listUsers() {
  return readUsers()
    .map(publicUser)
    .sort((a, b) => (a.created_date || "").localeCompare(b.created_date || ""));
}

// Назначение тарифа пользователю (локальный демо-режим)
export function updateUserPlan(id, plan) {
  const users = readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error("USER_NOT_FOUND");
  user.plan = plan;
  writeUsers(users);
  notifyAuth();
  return publicUser(user);
}

// Персональный код подключения жильцов (локальный демо-режим)
export function getOrCreateInviteCode() {
  try {
    const existing = localStorage.getItem("arendora:inviteCode");
    if (existing) return existing;
    const code = Math.random().toString(36).slice(2, 10).toUpperCase()
      .replace(/[^A-Z0-9]/g, "X")
      .padEnd(8, "X")
      .slice(0, 8);
    localStorage.setItem("arendora:inviteCode", code);
    return code;
  } catch {
    return "";
  }
}

export function updateUserRole(id, role) {
  const users = readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error("USER_NOT_FOUND");
  user.role = role;
  writeUsers(users);
  notifyAuth();
  return publicUser(user);
}

export function inviteUser(email, role = "user") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) throw new Error("EMAIL_INVALID");
  const users = readUsers();
  if (users.some((u) => u.email === normalized)) throw new Error("EMAIL_EXISTS");
  users.push({
    id: uid(),
    full_name: normalized.split("@")[0],
    email: normalized,
    password_hash: null,
    role,
    status: "invited",
    created_date: new Date().toISOString(),
  });
  writeUsers(users);
  return publicUser(users[users.length - 1]);
}
