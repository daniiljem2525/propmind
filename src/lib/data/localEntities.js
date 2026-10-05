import { readCollection, writeCollection } from "./localDb";
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

// Журнал событий заявки в localStorage: строка без owner_id была бы
// невидима для list() (он фильтрует по владельцу)
function pushLocalEvent(requestId, event, details = "") {
  const user = CURRENT_USER_FN();
  const rows = readCollection("request_events");
  rows.push({
    id: uid(),
    request_id: requestId,
    actor_id: user?.id || null,
    actor_name: user?.full_name || "",
    actor_role: user?.role || "system",
    event,
    details,
    owner_id: user?.id || null,
    created_date: new Date().toISOString(),
  });
  writeCollection("request_events", rows);
}

const requestBase = makeEntity("maintenance_requests", {
  urgency: "medium",
  status: "new",
  source: "manual",
  category: "other",
});

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

// Очередь заказов для внешних площадок — читает фоновый воркер automation/.
export const AutomationOrder = makeEntity("automation_orders", {
  platform: "profi",
  status: "pending",
  deadline: "week",
});

// Отклики мастеров с Профи.ру: владелец принимает/отклоняет/меняет время,
// воркер отвечает мастеру в чате.
export const ProfiOffer = makeEntity("profi_offers", { status: "new" });

export const MaintenanceRequest = {
  ...makeEntity("maintenance_requests", {
    urgency: "medium",
    status: "new",
    source: "manual",
    category: "other",
  }),
  // Локальный (демо) бэкенд: те же переходы, что и RPC в облаке,
  // плюс запись в журнал событий — интерфейс одинаковый у страниц.
  async create(data) {
    const row = await requestBase.create(data);
    pushLocalEvent(row.id, "created");
    return row;
  },
  async assign(id, { contractor_id, contractor_name, scheduled_at, estimate_cost } = {}) {
    const row = await this.update(id, {
      status: "assigned",
      contractor_id: contractor_id || null,
      contractor_name: contractor_name || null,
      contractor_status: null,
      assigned_at: new Date().toISOString(),
      scheduled_at: scheduled_at || null,
      estimate_cost: estimate_cost ?? null,
    });
    pushLocalEvent(id, "assigned");
    return { ok: true, row };
  },
  async decline(id) {
    const row = await this.update(id, {
      status: "new",
      contractor_id: null,
      contractor_name: null,
      contractor_status: null,
      assigned_at: null,
    });
    pushLocalEvent(id, "declined");
    return { ok: true, row };
  },
  async accept(id) {
    const row = await this.update(id, {
      status: "in_progress",
      contractor_status: "accepted",
      started_at: new Date().toISOString(),
    });
    pushLocalEvent(id, "accepted");
    return { ok: true, row };
  },
  async report(id, { work_cost = 0, work_photo_url, work_notes } = {}) {
    const row = await this.update(id, {
      status: "done",
      contractor_status: "done",
      work_cost: Number(work_cost) || 0,
      work_photo_url: work_photo_url || null,
      work_notes: work_notes || null,
      completed_at: new Date().toISOString(),
    });
    pushLocalEvent(
      id,
      "reported",
      Number(work_cost) ? `Стоимость: ${Number(work_cost).toLocaleString("ru-RU")} ₽` : ""
    );
    return { ok: true, row };
  },
  async close(id) {
    const row = await this.update(id, { status: "closed", closed_at: new Date().toISOString() });
    pushLocalEvent(id, "closed");
    return { ok: true, row };
  },
  async cancel(id, reason) {
    const row = await this.update(id, {
      status: "cancelled",
      cancel_reason: reason || null,
      closed_at: new Date().toISOString(),
    });
    pushLocalEvent(id, "cancelled", reason ? `Причина: ${reason}` : "");
    return { ok: true, row };
  },
};

export const RequestComment = makeEntity("request_comments", {});
export const RequestEvent = makeEntity("request_events", {});

// Локальный демо-режим: «арендодатель» — текущий аккаунт
export async function getLandlordContact() {
  const user = CURRENT_USER_FN();
  return user ? { full_name: user.full_name, phone: null, email: user.email } : null;
}

// В локальном демо-режиме воркспейс один — подключение по коду недоступно
export async function claimInvite() {
  return { ok: false, error: "not_supported" };
}

export const Document = makeEntity("documents", {
  type: "other",
});

export const NotificationEntity = makeEntity("notifications", {
  type: "general",
  is_read: false,
});

// Демо-режим: жилец «оплачивает» платёж локально
export async function payPayment(paymentId) {
  const all = await Payment.list();
  const p = all.find((x) => x.id === paymentId);
  if (!p) throw new Error("NOT_FOUND");
  await Payment.update(paymentId, {
    status: "paid",
    paid_date: new Date().toISOString().slice(0, 10),
    payment_method: "online",
  });
}

// В демо-режиме второй аккаунт отсутствует — уведомление жильцу не нужно.
export async function notifyPaymentSchedule() {}
