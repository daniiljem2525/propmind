import { describe, it, expect } from "vitest";
import {
  uid,
  formatMoney,
  todayISO,
  addMonthsISO,
  addDaysISO,
  daysUntil,
  initials,
} from "@/lib/utils";

describe("uid", () => {
  it("выдаёт непустые уникальные значения", () => {
    const a = uid();
    const b = uid();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe("todayISO", () => {
  it("возвращает дату в формате YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addMonthsISO", () => {
  it("обычный месяц", () => {
    expect(addMonthsISO("2026-03-15", 1)).toBe("2026-04-15");
  });

  it("короткий месяц: 31 января → 28 февраля (не 31-е число)", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("переход через год", () => {
    expect(addMonthsISO("2026-11-10", 2)).toBe("2027-01-10");
  });
});

describe("addDaysISO", () => {
  it("переход через границу месяца и года", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("daysUntil", () => {
  it("для сегодняшней даты — 0", () => {
    expect(daysUntil(todayISO())).toBe(0);
  });
});

describe("formatMoney", () => {
  it("содержит сумму и символ валюты", () => {
    const s = formatMoney(12345, "RUB", "ru");
    expect(s.replace(/\s|\u00a0/g, "")).toContain("12345");
    expect(s).toContain("₽");
  });
});

describe("initials", () => {
  it("первые буквы двух слов в верхнем регистре", () => {
    expect(initials("иван петров")).toBe("ИП");
  });

  it("без имени — заглушка", () => {
    expect(initials("")).toBe("?");
  });
});
