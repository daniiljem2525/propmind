// Оффлайн-инспекции: зеркало + outbox поверх облачного бэкенда.
//
// Осмотр делается на объекте, где сети часто нет (подвал, цоколь, роуминг) —
// поэтому инспекции продолжают работать офлайн:
//   • облачный режим, онлайн — passthrough в Supabase, зеркало обновляется;
//   • облачный режим, офлайн — чтение из зеркала (localStorage), мутации
//     складываются в outbox-очередь; по событию "online" очередь сбрасывается
//     в облако, зеркало сверяется с сервером;
//   • локальный режим — passthrough: localStorage и есть оффлайн-хранилище.
// Зеркало и очередь живут в отдельных ключах localDb (arendora:inspections-*),
// чтобы не пересекаться с коллекцией локального бэкенда (arendora:inspections).
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { readCollection, writeCollection } from "@/lib/data/localDb";
import { isDemoMode } from "@/lib/demoMode";
import { uid } from "@/lib/utils";
import { Inspection as CloudInspection } from "@/lib/supabase/entities";
import { Inspection as LocalInspection } from "@/lib/data/localEntities";

const MIRROR = "inspections-mirror"; // полная копия осмотров сервера + pending
const OUTBOX = "inspections-outbox"; // очередь мутаций, ждущих сети

const isOnline = () =>
  typeof navigator === "undefined" || navigator.onLine !== false;

const readOutbox = () => {
  try {
    return JSON.parse(localStorage.getItem("arendora:" + OUTBOX) || "[]");
  } catch {
    return [];
  }
};
const writeOutbox = (ops) => writeCollection(OUTBOX, ops);

const readMirror = () => readCollection(MIRROR);
const writeMirror = (rows) => writeCollection(MIRROR, rows);

// Сортировка как у makeEntity: новые записи первыми
const sortDesc = (rows) =>
  [...rows].sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));

// Демо-разделение: как в makeEntity — демо-записи видны только в демо-режиме
const visible = (rows) => {
  const demoOn = isDemoMode();
  return rows.filter((r) => demoOn === !!r.is_demo);
};

// Сверка зеркала с сервером: серверные строки заменяют свои, pending
// (ещё не сброшенные в облако) сохраняются, исчезнувшие на сервере удаляются
function mergeMirror(serverRows) {
  const pendingIds = new Set(readOutbox().map((op) => op.id));
  const pending = readMirror().filter((r) => r._pending && pendingIds.has(r.id));
  const byId = new Map(serverRows.map((r) => [r.id, r]));
  const merged = [
    ...serverRows,
    ...pending.filter((p) => !byId.has(p.id)),
  ];
  writeMirror(merged);
  return merged;
}

const clean = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));

// ——— Синхронизация ———
const syncListeners = new Set();
const notifySynced = (result) => syncListeners.forEach((cb) => cb(result));

// Сброс outbox в облако: по порядку, до первой ошибки (сеть пропала —
// очередь остаётся). create: id локальный не вставляем — сервер генерирует
// uuid сам; pending-строка в зеркале заменяется серверной.
export async function flush() {
  if (!isSupabaseConfigured || !isOnline()) return { synced: 0 };
  let ops = readOutbox();
  let synced = 0;
  while (ops.length > 0) {
    const op = ops[0];
    try {
      if (op.op === "create") {
        const { id, _pending, ...payload } = op.payload;
        const row = await CloudInspection.create(payload);
        writeMirror(readMirror().filter((r) => r.id !== op.id).concat(row));
      } else if (op.op === "update") {
        try {
          const row = await CloudInspection.update(op.id, op.payload);
          writeMirror(readMirror().map((r) => (r.id === op.id ? row : r)));
        } catch (err) {
          if (err?.message === "ROW_NOT_FOUND") {
            // удалена на другом устройстве, пока мы были офлайн
            writeMirror(readMirror().filter((r) => r.id !== op.id));
          } else {
            throw err;
          }
        }
      } else if (op.op === "delete") {
        await CloudInspection.delete(op.id);
        writeMirror(readMirror().filter((r) => r.id !== op.id));
      }
      ops = ops.slice(1);
      writeOutbox(ops);
      synced += 1;
    } catch (err) {
      console.warn("inspections sync: операция не применена, очередь сохранена", op.op, err);
      break;
    }
  }
  const result = { synced, pending: ops.length };
  if (ops.length === 0 && synced > 0) notifySynced(result);
  return result;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flush();
  });
}

// Подписка на завершение полной синхронизации: страница перезагружает
// список после сброса очереди (realtime сам не придёт, если таблица
// изменилась, пока вкладка была офлайн)
export function onSynced(cb) {
  syncListeners.add(cb);
  return () => syncListeners.delete(cb);
}

// Число несинхронизированных мутаций — для бейджа «офлайн» в интерфейсе
export const pendingCount = () => readOutbox().length;

// ——— Сущность с оффлайн-поведением ———
// Тот же интерфейс, что у makeEntity: страницы не знают, какой режим активен.
export const Inspection = {
  collection: "inspections",

  async list() {
    if (!isSupabaseConfigured) return LocalInspection.list();
    if (isOnline()) {
      const rows = await CloudInspection.list();
      return sortDesc(visible(mergeMirror(rows)));
    }
    return sortDesc(visible(readMirror()));
  },

  async listAll() {
    if (!isSupabaseConfigured) return LocalInspection.listAll();
    if (isOnline()) return mergeMirror(await CloudInspection.listAll());
    return readMirror();
  },

  async getById(id) {
    if (!isSupabaseConfigured) return LocalInspection.getById(id);
    if (isOnline()) return CloudInspection.getById(id);
    return readMirror().find((r) => r.id === id) || null;
  },

  async create(data) {
    if (!isSupabaseConfigured) return LocalInspection.create(data);
    if (isOnline()) {
      const row = await CloudInspection.create(data);
      mergeMirror([row]);
      return row;
    }
    // Офлайн: строка сразу в зеркале (видна в списке) + операция в очереди
    const row = {
      type: "routine",
      status: "planned",
      checklist: [],
      ...clean(data),
      id: uid(),
      created_date: new Date().toISOString(),
      is_demo: isDemoMode(),
      _pending: true,
    };
    writeMirror(readMirror().concat(row));
    writeOutbox([
      ...readOutbox(),
      { op: "create", id: row.id, payload: row, queued_at: new Date().toISOString() },
    ]);
    return row;
  },

  async bulkCreate(items) {
    const created = [];
    for (const item of items) created.push(await this.create(item));
    return created;
  },

  async update(id, patch) {
    if (!isSupabaseConfigured) return LocalInspection.update(id, patch);
    if (isOnline()) {
      const row = await CloudInspection.update(id, patch);
      writeMirror(readMirror().map((r) => (r.id === id ? row : r)));
      return row;
    }
    const ops = readOutbox();
    const existing = ops.find((op) => op.id === id);
    if (existing) {
      // Правки несинхронизированной строки вливаются в её операцию —
      // в облако уйдёт одно накопленное значение, а не цепочка
      existing.payload = { ...existing.payload, ...clean(patch) };
      writeOutbox(ops);
    } else {
      writeOutbox([
        ...ops,
        { op: "update", id, payload: clean(patch), queued_at: new Date().toISOString() },
      ]);
    }
    const merged = readMirror().map((r) =>
      r.id === id ? { ...r, ...clean(patch), _pending: true } : r
    );
    writeMirror(merged);
    return merged.find((r) => r.id === id) || null;
  },

  async delete(id) {
    if (!isSupabaseConfigured) return LocalInspection.delete(id);
    if (isOnline()) {
      await CloudInspection.delete(id);
      writeMirror(readMirror().filter((r) => r.id !== id));
      return true;
    }
    // Офлайн: строка исчезает из зеркала сразу; если удаление пришло до
    // того, как create добрался до облака — create просто отменяется
    writeMirror(readMirror().filter((r) => r.id !== id));
    const ops = readOutbox();
    if (ops.some((op) => op.id === id && op.op === "create")) {
      writeOutbox(ops.filter((op) => !(op.id === id && op.op === "create")));
    } else {
      writeOutbox([...ops, { op: "delete", id, queued_at: new Date().toISOString() }]);
    }
    return true;
  },
};
