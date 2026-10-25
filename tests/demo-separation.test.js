import { describe, it, expect, beforeEach } from "vitest";

// Стабы браузерного окружения: тесты гоняются в node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.BroadcastChannel = class {
  postMessage() {}
  onmessage = null;
};

const { setDemoMode } = await import("@/lib/demoMode");
const local = await import("@/lib/data/localEntities");

local.registerCurrentUserFn(() => ({ id: "u1", full_name: "Тест", role: "owner" }));

const { Property, Payment, MaintenanceRequest, RequestEvent } = local;

beforeEach(() => {
  store.clear();
  setDemoMode(false);
});

describe("разделение демо и реальных данных", () => {
  it("по умолчанию записи создаются как реальные", async () => {
    const p = await Property.create({ name: "Моя квартира" });
    expect(p.is_demo).toBe(false);
    expect(await Property.list()).toHaveLength(1);
  });

  it("демо-режим скрывает реальные данные и наоборот", async () => {
    await Property.create({ name: "Реальная" });

    setDemoMode(true);
    await Property.create({ name: "Демо-объект" });

    const demoView = await Property.list();
    expect(demoView.map((p) => p.name)).toEqual(["Демо-объект"]);

    setDemoMode(false);
    const realView = await Property.list();
    expect(realView.map((p) => p.name)).toEqual(["Реальная"]);
  });

  it("записи, созданные в демо-режиме, помечаются is_demo", async () => {
    setDemoMode(true);
    const p = await Property.create({ name: "Демо" });
    const payment = await Payment.create({ amount: 100 });
    expect(p.is_demo).toBe(true);
    expect(payment.is_demo).toBe(true);
  });

  it("listAll отдаёт оба слоя независимо от режима", async () => {
    await Property.create({ name: "Реальная" });
    setDemoMode(true);
    await Property.create({ name: "Демо" });

    setDemoMode(false);
    expect(await Property.listAll()).toHaveLength(2);
    setDemoMode(true);
    expect(await Property.listAll()).toHaveLength(2);
  });

  it("события заявки наследуют демо-флаг заявки", async () => {
    setDemoMode(true);
    const req = await MaintenanceRequest.create({ title: "Течёт труба" });
    setDemoMode(false);

    // в реальном режиме демо-журнал скрыт, но флаг унаследован
    expect(await RequestEvent.list()).toHaveLength(0);
    const events = await RequestEvent.listAll();
    expect(events).toHaveLength(1);
    expect(events[0].request_id).toBe(req.id);
    expect(events[0].is_demo).toBe(true);
  });
});
