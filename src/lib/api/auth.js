import { readCollection, writeCollection, notifyAuth } from "./db";
import { registerCurrentUserFn } from "./entities";
import { uid } from "@/lib/utils";

const NAME = "users";
const SESSION_KEY = "propmind:session";

const hash = (pw) => {
  try {
    return btoa(unescape(encodeURIComponent(`pm:${pw}`)));
  } catch {
    return `pm:${pw}`;
  }
};

const readUsers = () => readCollection(NAME);
const writeUsers = (rows) => writeCollection(NAME, rows);

const publicUser = (u) =>
  u && {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    status: u.status,
    created_date: u.created_date,
  };

export function getCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session?.user_id) return null;
    return publicUser(readUsers().find((u) => u.id === session.user_id));
  } catch {
    return null;
  }
}

registerCurrentUserFn(getCurrentUser);

function setSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: userId }));
  notifyAuth();
}

export function signup({ full_name, email, password }) {
  const normalized = String(email || "").trim().toLowerCase();
  const users = readUsers();
  const existing = users.find((u) => u.email === normalized);
  if (existing && existing.status !== "invited") throw new Error("EMAIL_EXISTS");

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  if (existing) {
    Object.assign(existing, { full_name, password_hash: hash(password), status: "pending", otp });
    writeUsers(users);
  } else {
    users.push({
      id: uid(),
      full_name,
      email: normalized,
      password_hash: hash(password),
      role: "user",
      status: "pending",
      otp,
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
  if (!user || user.status !== "pending" || String(user.otp) !== String(otp)) {
    throw new Error("WRONG_OTP");
  }
  user.status = "active";
  user.otp = null;
  writeUsers(users);
  setSession(user.id);
  return publicUser(user);
}

export function login(email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  const user = readUsers().find((u) => u.email === normalized);
  if (!user || user.status === "invited" || user.password_hash !== hash(password)) {
    throw new Error("WRONG_CREDENTIALS");
  }
  if (user.status === "pending") throw new Error("PENDING_ACCOUNT");
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
  writeUsers(users);
  return { token, email: normalized };
}

export function resetPassword(token, password) {
  const users = readUsers();
  const user = users.find((u) => u.reset_token === String(token || "").trim());
  if (!user) throw new Error("USER_NOT_FOUND");
  user.password_hash = hash(password);
  user.reset_token = null;
  if (user.status === "pending") user.status = "active";
  writeUsers(users);
  return publicUser(user);
}

export function changePassword(userId, current, next) {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.password_hash !== hash(current)) throw new Error("WRONG_PASSWORD");
  user.password_hash = hash(next);
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
