import { readCollection, writeCollection } from "./db";
import { uid, todayISO, addMonthsISO } from "@/lib/utils";

const clean = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));

// Каждая запись видна только своему владельцу (owner_id) — имитация RLS.
function makeEntity(collection, defaults = {}) {
  const resolveDefaults = () => (typeof defaults === "function" ? defaults() : { ...defaults });
  const ownedRows = () => {
    const user = CURRENT_USER_FN();
    if (!user) return [];
    return readCollection(collection).filter((r) => r.owner_id === user.id);
  };
  const sortDesc = (rows) =>
    [...rows].sort((a, b) => (b.created_date || "").localeCompare(a.created_date || ""));

  return {
    collection,

    async list() {
      return sortDesc(ownedRows());
    },

    async getById(id) {
      return ownedRows().find((r) => r.id === id) || null;
    },

    async create(data) {
      const user = CURRENT_USER_FN();
      if (!user) throw new Error("UNAUTHORIZED");
      const row = {
        ...resolveDefaults(),
        ...clean(data),
        id: uid(),
        created_date: new Date().toISOString(),
        owner_id: user.id,
        ...(collection === "notifications" ? { user_id: user.id } : {}),
      };
      const rows = readCollection(collection);
      rows.push(row);
      writeCollection(collection, rows);
      return row;
    },

    async bulkCreate(items) {
      const user = CURRENT_USER_FN();
      if (!user) throw new Error("UNAUTHORIZED");
      const now = new Date().toISOString();
      const created = items.map((item, i) => ({
        ...resolveDefaults(),
        ...clean(item),
        id: uid(),
        created_date: new Date(Date.now() + i).toISOString(),
        owner_id: user.id,
        ...(collection === "notifications" ? { user_id: user.id } : {}),
      }));
      const rows = readCollection(collection);
      rows.push(...created);
      writeCollection(collection, rows);
      return created;
    },

    async update(id, patch) {
      const rows = readCollection(collection);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      rows[idx] = { ...rows[idx], ...clean(patch), id, updated_date: new Date().toISOString() };
      writeCollection(collection, rows);
      return rows[idx];
    },

    async delete(id) {
      const user = CURRENT_USER_FN();
      const rows = readCollection(collection).filter(
        (r) => r.id !== id && (r.owner_id === user?.id || collection === "notifications")
      );
      writeCollection(collection, rows);
      return true;
    },
  };
}

// Отложенная инициализация: auth.js подключается к db.js, поэтому текущего
// пользователя получаем через регистрируемую функцию без циклического импорта.
let CURRENT_USER_FN = () => null;
export function registerCurrentUserFn(fn) {
  CURRENT_USER_FN = fn;
}

export const Property = makeEntity("properties", {
  type: "apartment",
  currency: "RUB",
  lease_start: todayISO(),
  lease_end: addMonthsISO(todayISO(), 12),
  status: "vacant",
});

export const Tenant = makeEntity("tenants", {
  status: "active",
});

export const Payment = makeEntity("payments", {
  currency: "RUB",
  status: "pending",
});

export const MaintenanceRequest = makeEntity("maintenance_requests", {
  urgency: "medium",
  status: "new",
  source: "manual",
});

export const Document = makeEntity("documents", {
  type: "other",
});

export const NotificationEntity = makeEntity("notifications", {
  type: "general",
  is_read: false,
});
