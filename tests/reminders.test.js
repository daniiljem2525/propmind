import { describe, it, expect } from "vitest";
import { todayISO, addDaysISO } from "@/lib/utils";
import {
  reminderState,
  nextOpenPayment,
  lastPaidPayment,
  paymentSummary,
  REMINDER_WINDOW,
} from "@/lib/reminders";

const TODAY = "2026-11-01";
// Реальное «сегодня» для тестов paymentSummary: он берёт дату из системы
const TODAY_REAL = todayISO();

const pay = (over = {}) => ({
  id: "p1",
  status: "pending",
  due_date: "2026-11-04",
  amount: 45000,
  tenant_id: "t1",
  property_id: "pr1",
  ...over,
});

describe("reminderState — бейдж напоминания", () => {
  it("просрочка считается и по статусу overdue, и по прошедшей дате pending", () => {
    expect(reminderState(pay({ status: "overdue", due_date: "2026-10-28" }), TODAY)).toEqual({
      kind: "overdue",
      days: 4,
      dateISO: "2026-10-28",
    });
    // ночной скан ещё не успел поменять статус — бейдж не ждёт его
    expect(reminderState(pay({ due_date: "2026-10-30" }), TODAY)).toMatchObject({
      kind: "overdue",
      days: 2,
    });
  });

  it("день оплаты и окно ближайших дней", () => {
    expect(reminderState(pay({ due_date: TODAY }), TODAY)).toMatchObject({ kind: "today", days: 0 });
    expect(reminderState(pay({ due_date: "2026-11-04" }), TODAY)).toMatchObject({ kind: "soon", days: 3 });
    expect(reminderState(pay({ due_date: "2026-11-08" }), TODAY)).toMatchObject({ kind: "soon", days: 7 });
  });

  it("далёкие даты и закрытые платежи — без бейджа", () => {
    expect(reminderState(pay({ due_date: "2026-12-15" }), TODAY)).toBeNull();
    expect(reminderState(pay({ due_date: "2026-11-04", status: "paid" }), TODAY)).toBeNull();
    expect(reminderState(pay({ due_date: "2026-11-04", status: "cancelled" }), TODAY)).toBeNull();
    expect(reminderState(pay({ due_date: null }), TODAY)).toBeNull();
    expect(reminderState(null, TODAY)).toBeNull();
  });

  it("окно напоминаний — 7 дней", () => {
    expect(reminderState(pay({ due_date: `2026-11-${String(1 + REMINDER_WINDOW).padStart(2, "0")}` }), TODAY)).not.toBeNull();
    expect(reminderState(pay({ due_date: `2026-11-${String(2 + REMINDER_WINDOW).padStart(2, "0")}` }), TODAY)).toBeNull();
  });
});

describe("nextOpenPayment / lastPaidPayment — даты у жильцов и объектов", () => {
  // Даты относительные: тест не должен «протухать» с наступлением календарного дня
  const list = [
    pay({ id: "a", due_date: addDaysISO(TODAY_REAL, 30) }),
    pay({ id: "b", due_date: addDaysISO(TODAY_REAL, 2), tenant_id: "t2" }),
    pay({ id: "c", due_date: addDaysISO(TODAY_REAL, -2), status: "paid", paid_date: addDaysISO(TODAY_REAL, -3) }),
    pay({ id: "d", due_date: addDaysISO(TODAY_REAL, -12), status: "overdue" }),
  ];

  it("следующий незакрытый платёж — с минимальной датой среди открытых", () => {
    expect(nextOpenPayment(list)).toMatchObject({ id: "d" });
    expect(nextOpenPayment(list, { tenantId: "t2" })).toMatchObject({ id: "b" });
    expect(nextOpenPayment(list, { propertyId: "nope" })).toBeNull();
  });

  it("последняя оплата — максимум paid_date", () => {
    expect(lastPaidPayment(list)).toMatchObject({ id: "c", paid_date: addDaysISO(TODAY_REAL, -3) });
    expect(lastPaidPayment(list, { tenantId: "t2" })).toBeNull();
  });

  it("paymentSummary собирает всё вместе", () => {
    const s = paymentSummary(list, { tenantId: "t2" });
    expect(s.next.id).toBe("b");
    expect(s.last).toBeNull();
    expect(s.reminder).toMatchObject({ kind: "soon" });
  });
});
