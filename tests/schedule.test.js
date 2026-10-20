import { describe, it, expect } from "vitest";
import { buildMonthlySchedule } from "@/lib/schedule";

const tenant = { id: "t1", full_name: "Иван Петров" };
const property = { id: "p1", name: "Квартира на Ленина", rent_amount: 45000, currency: "RUB" };
const existing = [];

const call = (over = {}) =>
  buildMonthlySchedule({ tenant, property, months: 12, existing, startISO: "2026-01-15", ...over });

describe("buildMonthlySchedule", () => {
  it("строит 12 месяцев подряд", () => {
    const items = call();
    expect(items).toHaveLength(12);
    expect(items[0].due_date).toBe("2026-02-15");
    expect(items[11].due_date).toBe("2027-01-15");
  });

  it("проставляет период и переносит через год", () => {
    const items = call();
    expect(items[0]).toMatchObject({ period_month: 2, period_year: 2026 });
    expect(items[10]).toMatchObject({ period_month: 12, period_year: 2026 });
    expect(items[11]).toMatchObject({ period_month: 1, period_year: 2027 });
  });

  it("пропускает периоды, которые уже есть у арендатора", () => {
    const items = call({ existing: [{ tenant_id: "t1", period_month: 2, period_year: 2026 }] });
    expect(items).toHaveLength(11);
    expect(items.some((p) => p.period_month === 2 && p.period_year === 2026)).toBe(false);
  });

  it("не считает дублем тот же период у другого арендатора", () => {
    const items = call({ existing: [{ tenant_id: "t2", period_month: 2, period_year: 2026 }] });
    expect(items).toHaveLength(12);
  });

  it("не теряет день в коротком месяце", () => {
    const items = buildMonthlySchedule({
      tenant,
      property,
      months: 2,
      existing: [],
      startISO: "2026-01-31",
    });
    expect(items[0].due_date).toBe("2026-02-28");
    expect(items[1].due_date).toBe("2026-03-28");
  });

  it("переносит сумму и валюту объекта, статус — pending", () => {
    const [first] = call();
    expect(first).toMatchObject({
      property_id: "p1",
      tenant_id: "t1",
      tenant_name: "Иван Петров",
      amount: 45000,
      currency: "RUB",
      status: "pending",
    });
  });

  it("без суммы аренды всё равно строит график с нулём", () => {
    const [first] = buildMonthlySchedule({
      tenant,
      property: { ...property, rent_amount: undefined },
      months: 1,
      existing: [],
      startISO: "2026-01-15",
    });
    expect(first.amount).toBe(0);
  });

  it("months = 0 даёт пустой список", () => {
    expect(call({ months: 0 })).toEqual([]);
  });
});
