// Бизнес-логика связей между сущностями — та самая «автоматизация» Arendora.

import { Property, Payment, NotificationEntity, notifyPaymentSchedule } from "@/lib/api/entities";
import { readCollection, writeCollection } from "@/lib/api/db";
import { getCurrentUser } from "@/lib/api/auth";
import { isDemoMode } from "@/lib/demoMode";
import { uid, todayISO, addMonthsISO } from "@/lib/utils";
import { buildMonthlySchedule } from "@/lib/schedule";

// Жилец без аккаунта на платформе: в property/payments у него нет uuid-профиля,
// связи пишутся строками (tenant_name) и tenants.property_id
const isVirtual = (tenant) => tenant?.has_account === false;

// Автосвязывание: арендатор → объект (+ первый платёж).
// Бросает TENANT_ALREADY_SETTLED, если жилец уже живёт в другом объекте.
export async function linkTenantToProperty(tenant, property, { firstPayment = true } = {}) {
  // Запрет двойного заселения — в обе стороны:
  // 1) жилец не может жить в двух объектах;
  // 2) объект не может быть занят двумя жильцами (id — жёсткая связь,
  //    имя — страховка для старых записей, где связь была только строкой).
  try {
    const { Tenant } = await import("@/lib/api/entities");
    const props = await Property.list();
    const target = props.find((p) => p.id === property.id) || property;
    const elsewhere = props.find((p) => p.id !== property.id && p.tenant_id === tenant.id);
    const current = isVirtual(tenant) ? (await Tenant.getById(tenant.id))?.property_id : null;
    const occupiedByOther =
      (target.tenant_id && target.tenant_id !== tenant.id) ||
      (!target.tenant_id && target.tenant_name && target.tenant_name !== tenant.full_name);
    if (elsewhere || (current && current !== property.id)) {
      throw Object.assign(new Error("TENANT_ALREADY_SETTLED"), { code: "TENANT_ALREADY_SETTLED" });
    }
    if (occupiedByOther) {
      throw Object.assign(new Error("PROPERTY_OCCUPIED"), { code: "PROPERTY_OCCUPIED" });
    }
  } catch (e) {
    if (e?.code === "TENANT_ALREADY_SETTLED" || e?.code === "PROPERTY_OCCUPIED") throw e;
    // Сбой проверки (сеть и т.п.) не должен ломать связывание — оно идёт дальше
    console.error("settle check failed:", e);
  }

  // Связь пишем всегда: после снятия FK виртуальные жильцы (таблица
  // tenants) тоже хранят uuid в properties.tenant_id.
  await Property.update(property.id, {
    tenant_id: tenant.id || null,
    tenant_name: tenant.full_name,
    status: "rented",
  });
  if (isVirtual(tenant)) {
    // Обратная ссылка записи жильца на объект
    try {
      const { Tenant } = await import("@/lib/api/entities");
      await Tenant.update(tenant.id, { property_id: property.id, property_name: property.name });
    } catch (e) {
      console.error("tenant backlink failed:", e);
    }
  }

  if (firstPayment && Number(property.rent_amount) > 0) {
    const due = todayISO();
    const d = new Date(due);
    await Payment.create({
      property_id: property.id,
      property_name: property.name,
      tenant_id: tenant.id || null,
      tenant_name: tenant.full_name,
      amount: Number(property.rent_amount),
      currency: property.currency || "RUB",
      due_date: due,
      status: "pending",
      period_month: d.getMonth() + 1,
      period_year: d.getFullYear(),
    });
  }
}

export async function unlinkTenantFromProperty(property, tenant = null) {
  if (!property) return;
  if (!property.tenant_id && !property.tenant_name && !isVirtual(tenant)) return;
  await Property.update(property.id, {
    tenant_id: null,
    tenant_name: null,
    status: property.status === "maintenance" ? "maintenance" : "vacant",
  });
  if (isVirtual(tenant)) {
    try {
      const { Tenant } = await import("@/lib/api/entities");
      await Tenant.update(tenant.id, { property_id: null, property_name: null });
    } catch (e) {
      console.error("tenant unlink failed:", e);
    }
  }
}

// График платежей на 12 месяцев вперёд, без дублей по периоду
export async function createMonthlySchedule(tenant, property, months = 12) {
  const existing = await Payment.list();
  // tenant_id пишем и виртуальным жильцам — дедупликация периодов
  // в buildMonthlySchedule сравнивает по нему.
  const items = buildMonthlySchedule({ tenant, property, months, existing });

  if (items.length) {
    await Payment.bulkCreate(items);
    // Жилец (другой аккаунт) узнаёт о графике: уведомление в базе
    // запускает push-рассылку. Сбой уведомления не ломает график.
    if (!isVirtual(tenant)) {
      try {
        await notifyPaymentSchedule(
          property.tenant_id || tenant.id,
          items.length,
          items[items.length - 1].due_date,
          property.name
        );
      } catch (e) {
        console.error("notifyPaymentSchedule failed:", e);
      }
    }
  }
  return items.length;
}

// Уведомление — вспомогательное действие: его сбой (сеть, RLS, offline)
// не должен превращать успешное действие пользователя в «ошибку».
export async function pushNotification(payload) {
  try {
    const user = getCurrentUser();
    if (!user) return;
    await NotificationEntity.create({ ...payload, user_id: user.id });
  } catch (e) {
    console.error("pushNotification failed:", e);
  }
}

// Человекочитаемая ошибка RPC-перехода заявки ({ ok, error }) —
// коды приходят из функций schema.sql (assign/accept/report/…)
export function requestActionError(res, t) {
  const known = ["unauthorized", "not_found", "forbidden", "wrong_status", "contractor_not_found"];
  const code = res && res.ok === false ? res.error : null;
  if (code && known.includes(code)) return t(`req.err.${code}`);
  return t("req.err.generic");
}

// Автопросрочка: pending-платежи с прошедшей датой становятся overdue,
// владельцу создаётся уведомление (ровно одно — при самом переходе статуса).
export function syncOverduePayments() {
  const user = getCurrentUser();
  if (!user) return 0;

  const today = todayISO();
  const lang = (() => {
    try {
      return localStorage.getItem("arendora:lang") || "ru";
    } catch {
      return "ru";
    }
  })();

  const payments = readCollection("payments");
  const notifications = readCollection("notifications");
  let changed = 0;

  // Демо-платежи трогаем только внутри демо-режима: их просрочка —
  // часть сценария демо, реальному режиму она не видна
  const demoOn = isDemoMode();

  payments.forEach((p) => {
    if (!!p.is_demo !== demoOn) return;
    if (p.status === "pending" && p.due_date && p.due_date < today) {
      p.status = "overdue";
      p.updated_date = new Date().toISOString();
      changed++;
      notifications.push({
        id: uid(),
        created_date: new Date().toISOString(),
        user_id: p.owner_id,
        owner_id: p.owner_id,
        type: "payment_overdue",
        title: lang === "ru" ? "Платёж просрочен" : "Payment overdue",
        message:
          (lang === "ru" ? "Просрочен платёж" : "Overdue payment") +
          ` — ${p.tenant_name || p.property_name || ""}, ${p.due_date}`,
        is_read: false,
        is_demo: !!p.is_demo,
        link: "/app/payments",
        related_id: p.id,
      });
    }
  });

  if (changed) {
    writeCollection("payments", payments);
    writeCollection("notifications", notifications);
  }
  return changed;
}

// Продление договора на год от текущей даты окончания + график платежей, если есть арендатор
export async function renewLease(property, tenant) {
  const base = property.lease_end && property.lease_end > todayISO() ? property.lease_end : todayISO();
  const newEnd = addMonthsISO(base, 12);
  await Property.update(property.id, { lease_end: newEnd });

  let scheduled = 0;
  if (tenant && Number(property.rent_amount) > 0) {
    scheduled = await createMonthlySchedule(tenant, { ...property, lease_end: newEnd });
  }
  return { newEnd, scheduled };
}
