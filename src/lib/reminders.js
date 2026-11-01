// Напоминания о платежах: чистая арифметика без React и бэкенда,
// чтобы один и тот же бейдж «платёж через N дней / просрочен» показывался
// одинаково в дашборде, объектах, жильцах и платежах (и проверялся тестами).
import { daysUntil, todayISO } from "@/lib/utils";

// Платёж требует внимания, пока он не закрыт: pending/partial/overdue.
// Серверный скан (pg_cron → scan_reminders) ставит статус overdue раз в сутки,
// поэтому здесь статус и дата проверяются вместе: pending со вчерашней датой
// тоже считается просрочкой — бейдж не ждёт ночного скана.
const OPEN_STATUSES = ["pending", "partial", "overdue"];

/**
 * Состояние напоминания для одного платежа.
 *
 * @returns {null | { kind: "overdue"|"today"|"soon", days: number, dateISO: string }}
 *   overdue — срок прошёл (days = на сколько дней), today — срок сегодня,
 *   soon — платёж в ближайшие REMINDER_WINDOW дней (days = через сколько).
 */
export function reminderState(payment, today = todayISO()) {
  if (!payment) return null;
  if (!OPEN_STATUSES.includes(payment.status)) return null;
  const due = payment.due_date;
  if (!due) return null;
  const days = daysUntil(due, today);
  if (days === null || Number.isNaN(days)) return null;
  if (days < 0) return { kind: "overdue", days: -days, dateISO: due };
  if (days === 0) return { kind: "today", days: 0, dateISO: due };
  if (days <= REMINDER_WINDOW) return { kind: "soon", days, dateISO: due };
  return null;
}

// Горизонт бейджа «через N дней»: дальше — даты достаточно, бейдж шумит.
export const REMINDER_WINDOW = 7;

/**
 * Ближайший незакрытый платёж из списка (минимальная due_date).
 * Используется разделами «Объекты» и «Жильцы»: у карточки видна дата
 * следующего платежа без открытия раздела платежей.
 */
export function nextOpenPayment(payments, { propertyId, tenantId } = {}) {
  const open = (payments || []).filter(
    (p) =>
      OPEN_STATUSES.includes(p.status) &&
      p.due_date &&
      (propertyId ? p.property_id === propertyId : true) &&
      (tenantId ? p.tenant_id === tenantId : true)
  );
  if (!open.length) return null;
  return open.reduce((min, p) => ((p.due_date || "") < (min.due_date || "") ? p : min));
}

/**
 * Дата последней оплаты (max paid_date среди оплаченных) — для строк
 * «последняя оплата: …» у жильцов и объектов. null — ещё не платил.
 */
export function lastPaidPayment(payments, { propertyId, tenantId } = {}) {
  const paid = (payments || []).filter(
    (p) =>
      p.status === "paid" &&
      p.paid_date &&
      (propertyId ? p.property_id === propertyId : true) &&
      (tenantId ? p.tenant_id === tenantId : true)
  );
  if (!paid.length) return null;
  return paid.reduce((max, p) => (p.paid_date > (max.paid_date || "") ? p : max));
}

/**
 * Сводка по одному разделу (объект/жилец): следующий платёж, последняя
 * оплата и состояние напоминания по следующему платежу — одним объектом.
 */
export function paymentSummary(payments, key = {}) {
  const next = nextOpenPayment(payments, key);
  const last = lastPaidPayment(payments, key);
  return {
    next,
    last,
    reminder: next ? reminderState(next) : null,
  };
}

/**
 * Человекочитаемый текст напоминания: «просрочен на N дней»,
 * «платёж сегодня», «платёж через N дней» — с русскими склонениями.
 */
export function reminderLabel(state, lang = "ru") {
  const ru = lang !== "en";
  const plural = (n, one, few, many) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  if (state.kind === "overdue") {
    return ru
      ? `просрочен на ${state.days} ${plural(state.days, "день", "дня", "дней")}`
      : state.days === 1
        ? "1 day overdue"
        : `${state.days} days overdue`;
  }
  if (state.kind === "today") return ru ? "платёж сегодня" : "due today";
  return ru
    ? `платёж через ${state.days} ${plural(state.days, "день", "дня", "дней")}`
    : state.days === 1
      ? "due in 1 day"
      : `due in ${state.days} days`;
}
