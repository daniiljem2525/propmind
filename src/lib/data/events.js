// Локальная шина событий «коллекция изменилась».
// Мутации текущей вкладки уведомляют подписчиков мгновенно, не дожидаясь
// Supabase Realtime: канал может не подключиться или таблица может быть
// вне публикации — свой список должен обновляться всегда (инцидент 06.11:
// новый объект появлялся в «Объектах» только после F5).
const listeners = new Map();

export function notifyCollection(name) {
  (listeners.get(name) || []).forEach((f) => f());
}

export function subscribeCollection(name, cb) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(cb);
  return () => listeners.get(name)?.delete(cb);
}
