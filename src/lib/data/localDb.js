// Локальное хранилище с pub/sub и realtime-синхронизацией между вкладками.
// Все мутации проходят через writeCollection — подписчики обновляются мгновенно.

const PREFIX = "propmind:";

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("propmind-sync") : null;
const listeners = new Map();

function notify(name) {
  const set = listeners.get(name);
  if (set) [...set].forEach((cb) => cb());
}

if (channel) {
  channel.onmessage = ({ data }) => notify(data);
}

export function subscribe(name, cb) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(cb);
  return () => listeners.get(name).delete(cb);
}

export function readCollection(name) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + name) || "[]");
  } catch {
    return [];
  }
}

export function writeCollection(name, rows) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  } catch {
    throw new Error("QUOTA_EXCEEDED");
  }
  notify(name);
  if (channel) channel.postMessage(name);
}

// Сессия/пользователь меняются реже данных — отдельный канал событий
export function notifyAuth() {
  notify("auth");
  if (channel) channel.postMessage("auth");
}
