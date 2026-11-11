import { describe, it, expect } from "vitest";
import { ROLES, ROLE_ACCESS, hasAccess } from "@/lib/config/statuses";
import { planAllowsTeam } from "@/lib/config/misc";

const ALL_PAGES = [
  "dashboard", "properties", "tenants", "payments", "maintenance",
  "inspections", "documents", "analytics", "plan", "settings",
];

describe("матрица ролей ROLE_ACCESS", () => {
  it("у управляющего и бухгалтера есть подписи ru/en", () => {
    expect(ROLES.manager.label_ru).toBe("Управляющий");
    expect(ROLES.manager.label_en).toBe("Manager");
    expect(ROLES.accountant.label_ru).toBe("Бухгалтер");
    expect(ROLES.accountant.label_en).toBe("Accountant");
  });

  it("владелец и админ видят все страницы", () => {
    for (const page of ALL_PAGES) {
      expect(hasAccess({ role: "owner" }, page)).toBe(true);
      expect(hasAccess({ role: "admin" }, page)).toBe(true);
    }
  });

  it("управляющий — операционка: подмножество владельца, включая инспекции", () => {
    for (const page of ROLE_ACCESS.manager) {
      expect(ROLE_ACCESS.owner.includes(page)).toBe(true);
    }
    expect(hasAccess({ role: "manager" }, "inspections")).toBe(true);
    expect(hasAccess({ role: "manager" }, "properties")).toBe(true);
    expect(hasAccess({ role: "manager" }, "maintenance")).toBe(true);
  });

  it("бухгалтер — только финансы: платежи, документы, аналитика", () => {
    expect(hasAccess({ role: "accountant" }, "payments")).toBe(true);
    expect(hasAccess({ role: "accountant" }, "documents")).toBe(true);
    expect(hasAccess({ role: "accountant" }, "analytics")).toBe(true);
    expect(hasAccess({ role: "accountant" }, "dashboard")).toBe(true);
    expect(hasAccess({ role: "accountant" }, "properties")).toBe(false);
    expect(hasAccess({ role: "accountant" }, "tenants")).toBe(false);
    expect(hasAccess({ role: "accountant" }, "maintenance")).toBe(false);
    expect(hasAccess({ role: "accountant" }, "inspections")).toBe(false);
    expect(hasAccess({ role: "accountant" }, "plan")).toBe(false);
  });

  it("жилец и исполнитель не видят командные разделы", () => {
    expect(hasAccess({ role: "tenant" }, "properties")).toBe(false);
    expect(hasAccess({ role: "tenant" }, "analytics")).toBe(false);
    expect(hasAccess({ role: "contractor" }, "payments")).toBe(false);
    expect(hasAccess({ role: "contractor" }, "maintenance")).toBe(true);
  });

  it("legacy-роли ('user', null) — полный доступ: прежнее поведение сайдбара", () => {
    for (const page of ALL_PAGES) {
      expect(hasAccess({ role: "user" }, page)).toBe(true);
      expect(hasAccess(null, page)).toBe(true);
      expect(hasAccess(undefined, page)).toBe(true);
    }
  });

  it("каждая роль имеет доступ к настройкам", () => {
    for (const pages of Object.values(ROLE_ACCESS)) {
      expect(pages.includes("settings")).toBe(true);
    }
  });
});

describe("гейтинг команды по тарифу (условие покупки Бизнес)", () => {
  it("роли команды доступны только на business и individual", () => {
    expect(planAllowsTeam("business")).toBe(true);
    expect(planAllowsTeam("individual")).toBe(true);
  });

  it("на free/start/pro приглашать управляющего и бухгалтера нельзя", () => {
    expect(planAllowsTeam("free")).toBe(false);
    expect(planAllowsTeam("start")).toBe(false);
    expect(planAllowsTeam("pro")).toBe(false);
  });

  it("без тарифа — команда недоступна (лимиты free)", () => {
    expect(planAllowsTeam(undefined)).toBe(false);
    expect(planAllowsTeam("hack-plan")).toBe(false);
  });
});
