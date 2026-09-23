// Бизнес-логика связей между сущностями — та самая «автоматизация» PropMind.

import { Property, Payment, NotificationEntity } from "@/lib/api/entities";
import { readCollection, writeCollection } from "@/lib/api/db";
import { getCurrentUser } from "@/lib/api/auth";
import { uid, todayISO, addMonthsISO } from "@/lib/utils";

// Автосвязывание: арендатор → объект (+ первый платёж)
export async function linkTenantToProperty(tenant, property, { firstPayment = true } = {}) {
  await Property.update(property.id, {
    tenant_id: tenant.id,
    tenant_name: tenant.full_name,
    status: "rented",
  });

  if (firstPayment && Number(property.rent_amount) > 0) {
    const due = todayISO();
    const d = new Date(due);
    await Payment.create({
      property_id: property.id,
      property_name: property.name,
      tenant_id: tenant.id,
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

export async function unlinkTenantFromProperty(property) {
  if (!property || !property.tenant_id) return;
  await Property.update(property.id, {
    tenant_id: null,
    tenant_name: null,
    status: property.status === "maintenance" ? "maintenance" : "vacant",
  });
}

// График платежей на 12 месяцев вперёд, без дублей по периоду
export async function createMonthlySchedule(tenant, property, months = 12) {
  const existing = await Payment.list();
  const items = [];
  let cursor = todayISO();

  for (let i = 0; i < months; i++) {
    cursor = addMonthsISO(cursor, 1);
    const d = new Date(cursor);
    const period_month = d.getMonth() + 1;
    const period_year = d.getFullYear();
    const duplicate = existing.some(
      (p) => p.tenant_id === tenant.id && p.period_month === period_month && p.period_year === period_year
    );
    if (!duplicate) {
      items.push({
        property_id: property.id,
        property_name: property.name,
        tenant_id: tenant.id,
        tenant_name: tenant.full_name,
        amount: Number(property.rent_amount),
        currency: property.currency || "RUB",
        due_date: cursor,
        status: "pending",
        period_month,
        period_year,
      });
    }
  }

  if (items.length) await Payment.bulkCreate(items);
  return items.length;
}

export async function pushNotification({ type, title, message, link, related_id }) {
  const user = getCurrentUser();
  if (!user) return;
  await NotificationEntity.create({ type, title, message, link, related_id, user_id: user.id });
}

// Автопросрочка: pending-платежи с прошедшей датой становятся overdue,
// владельцу создаётся уведомление (ровно одно — при самом переходе статуса).
export function syncOverduePayments() {
  const user = getCurrentUser();
  if (!user) return 0;

  const today = todayISO();
  const lang = (() => {
    try {
      return localStorage.getItem("propmind:lang") || "ru";
    } catch {
      return "ru";
    }
  })();

  const payments = readCollection("payments");
  const notifications = readCollection("notifications");
  let changed = 0;

  payments.forEach((p) => {
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
