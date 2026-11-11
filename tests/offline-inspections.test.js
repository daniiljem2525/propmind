import { describe, it, expect, beforeEach, vi } from "vitest";

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
// supabase-js при создании клиента восстанавливает сессию из хранилищ —
// cookie-слой robustStorage читает document.cookie
globalThis.document = { cookie: "" };

// Облачный бэкенд подменяется на in-memory «сервер» — сеть не нужна.
// vi.mock до динамического импорта оффлайн-модуля: его CloudInspection
// и есть этот мок.
vi.mock("@/lib/supabase/entities", () => {
  const rows = new Map();
  const api = {
    collection: "inspections",
    async create(data) {
      const row = { ...data, id: `srv-${rows.size + 1}` };
      rows.set(row.id, row);
      return row;
    },
    async update(id, patch) {
      if (!rows.has(id)) throw new Error("ROW_NOT_FOUND");
      const row = { ...rows.get(id), ...patch };
      rows.set(id, row);
      return row;
    },
    async delete(id) {
      rows.delete(id);
      return true;
    },
    async list() {
      return [...rows.values()];
    },
    async listAll() {
      return [...rows.values()];
    },
    async getById(id) {
      return rows.get(id) || null;
    },
  };
  return { Inspection: api, __server: rows };
});

// Облачный режим: конфиг собирается при импорте — стабим env до импорта
vi.stubEnv("VITE_SUPABASE_URL", "https://api.arendora.ru");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key-0123456789abcdef");

// navigator.onLine под контролем теста: false = «нет сети»
const setOnline = (on) =>
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: on },
    configurable: true,
    writable: true,
  });

const { setDemoMode } = await import("@/lib/demoMode");
const { Inspection, flush, pendingCount, onSynced } = await import(
  "@/lib/offline/inspections"
);
const { __server } = await import("@/lib/supabase/entities");

beforeEach(() => {
  store.clear();
  __server.clear();
  setOnline(false);
  setDemoMode(false);
});

describe("оффлайн-инспекции: зеркало + outbox", () => {
  it("офлайн create: строка сразу видна из зеркала, в облако ещё не ушла", async () => {
    const row = await Inspection.create({
      property_name: "Квартира 1",
      checklist: [{ text: "Двери", status: null, note: "" }],
    });
    expect(row._pending).toBe(true);
    const list = await Inspection.list();
    expect(list).toHaveLength(1);
    expect(list[0].property_name).toBe("Квартира 1");
    expect(pendingCount()).toBe(1);
    expect(__server.size).toBe(0);
  });

  it("офлайн update несинхронизированной строки вливается в её create", async () => {
    const row = await Inspection.create({ property_name: "Кв. 2" });
    await Inspection.update(row.id, {
      checklist: [{ text: "Счётчики", status: "ok", note: "" }],
    });
    // одна операция вместо цепочки create+update
    expect(pendingCount()).toBe(1);
    const list = await Inspection.list();
    expect(list[0].checklist[0].status).toBe("ok");
  });

  it("офлайн update синхронизированной строки — отдельная операция", async () => {
    setOnline(true);
    const row = await Inspection.create({ property_name: "Кв. 3" });
    setOnline(false);
    await Inspection.update(row.id, { notes: "Пахнет краской" });
    expect(pendingCount()).toBe(1);
    const list = await Inspection.list();
    expect(list[0].notes).toBe("Пахнет краской");
    expect(list[0]._pending).toBe(true);
  });

  it("офлайн delete отменяет несинхронизированный create", async () => {
    const row = await Inspection.create({ property_name: "Кв. 4" });
    await Inspection.delete(row.id);
    expect(pendingCount()).toBe(0);
    expect(await Inspection.list()).toHaveLength(0);
  });

  it("flush сбрасывает очередь: строка попадает на сервер, pending снимается", async () => {
    await Inspection.create({ property_name: "Кв. 5" });
    await Inspection.create({ property_name: "Кв. 6" });
    expect(pendingCount()).toBe(2);

    setOnline(true);
    const res = await flush();
    expect(res.synced).toBe(2);
    expect(res.pending).toBe(0);
    expect(pendingCount()).toBe(0);
    expect(__server.size).toBe(2);
    const list = await Inspection.list();
    expect(list).toHaveLength(2);
    expect(list.every((r) => !r._pending)).toBe(true);
  });

  it("офлайн update синхронизированной строки доезжает после flush", async () => {
    setOnline(true);
    const row = await Inspection.create({ property_name: "Кв. 7" });
    setOnline(false);
    await Inspection.update(row.id, { status: "done", completed_date: "2026-11-11" });
    setOnline(true);
    const res = await flush();
    expect(res.synced).toBe(1);
    const srv = __server.get(row.id);
    expect(srv.status).toBe("done");
    expect(srv.completed_date).toBe("2026-11-11");
  });

  it("update удалённой на сервере строки не ломает очередь (ROW_NOT_FOUND)", async () => {
    setOnline(true);
    const row = await Inspection.create({ property_name: "Кв. 8" });
    setOnline(false);
    await Inspection.update(row.id, { notes: "поздно" });
    // другое устройство удалило строку, пока мы были офлайн
    __server.delete(row.id);
    setOnline(true);
    const res = await flush();
    expect(res.synced).toBe(1);
    expect(pendingCount()).toBe(0);
    expect(await Inspection.list()).toHaveLength(0);
  });

  it("flush без сети ничего не делает: очередь сохранена", async () => {
    await Inspection.create({ property_name: "Кв. 9" });
    setOnline(false);
    const res = await flush();
    expect(res.synced).toBe(0);
    expect(pendingCount()).toBe(1);
  });

  it("onSynced срабатывает после полного сброса очереди", async () => {
    const seen = [];
    const off = onSynced((r) => seen.push(r));
    await Inspection.create({ property_name: "Кв. 10" });
    setOnline(true);
    await flush();
    expect(seen).toHaveLength(1);
    expect(seen[0].synced).toBe(1);
    off();
    await Inspection.create({ property_name: "Кв. 11" });
    await flush();
    expect(seen).toHaveLength(1);
  });
});
