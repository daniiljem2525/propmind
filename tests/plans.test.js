import { describe, it, expect } from "vitest";
import { PLANS, PLAN_LIMITS, getPlanLimits } from "@/lib/config/misc";

describe("тарифы", () => {
  it("у каждого публичного тарифа есть цена (кроме individual)", () => {
    for (const p of PLANS) {
      if (p.id === "individual") {
        expect(p.monthly).toBeNull();
      } else {
        expect(typeof p.monthly).toBe("number");
        expect(p.monthly).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("лимиты: free — 3 объекта (единый оффер), платные растут, business — 14", () => {
    expect(getPlanLimits("free").properties).toBe(3);
    expect(getPlanLimits("start").properties).toBe(4);
    expect(getPlanLimits("pro").properties).toBe(8);
    expect(getPlanLimits("business").properties).toBe(14);
  });

  it("individual — без ограничений", () => {
    expect(getPlanLimits("individual").properties).toBeNull();
  });

  it("неизвестный тариф не роняет и даёт лимиты free", () => {
    expect(getPlanLimits("hack-plan")).toEqual(PLAN_LIMITS.free);
  });
});
