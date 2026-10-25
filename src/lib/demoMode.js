// Разделение демо и реальных данных: каждая демо-запись помечена is_demo,
// а видимость регулируется переключателем демо-режима.
// Включён — интерфейс показывает только демо-портфель («песочницу»),
// выключен (по умолчанию) — только реальные данные. Смешения нет.

const KEY = "arendora:demoMode";

const listeners = new Set();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("arendora-sync") : null;

export function isDemoMode() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoMode(on) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  notifyDemoMode();
  if (channel) channel.postMessage("demoMode");
}

export function toggleDemoMode() {
  setDemoMode(!isDemoMode());
}

// Подписка на смену демо-режима: useCollection перечитывает данные,
// когда режим переключается в этой или соседней вкладке.
export function subscribeDemoMode(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function notifyDemoMode() {
  listeners.forEach((cb) => cb());
}

if (channel) {
  channel.onmessage = ({ data }) => {
    if (data === "demoMode") notifyDemoMode();
  };
}
