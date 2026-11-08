// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Клиентский флоу биллинга ЮKassa: edge-функция /functions/v1/billing
// вызывается с JWT из сессии; ошибки функции пробрасываются с кодом
// (BILLING_NOT_CONFIGURED и др.). Сама функция (supabase/functions/billing)
// проверяется на стенде edge-runtime при деплое — здесь моки.

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/config", () => ({
  supabase: { auth: { getSession } },
  SUPABASE_URL: "https://api.arendora.ru",
  SUPABASE_ANON_KEY: "test-anon-key",
  isSupabaseConfigured: true,
  robustStorage: {},
  probeSessionStores: vi.fn(async () => ({ ls: 0, ck: 0, idb: 0, sw: false })),
}));

// fetch — глобальный (используется внутри billing.js)
vi.stubGlobal("fetch", fetchMock);

import { createBillingPayment, getBillingStatus, BILLING_PRICES } from "@/lib/billing";

beforeEach(() => {
  fetchMock.mockReset();
  getSession.mockResolvedValue({
    data: { session: { access_token: "jwt-123" } },
  });
});

describe("billing client", () => {
  it("createBillingPayment: JWT + тело action=create, возвращает confirmation_url", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ confirmation_url: "https://yoomoney.ru/checkout/payments/v2/contract?orderId=x", payment_id: "pay-1" }),
    });
    const res = await createBillingPayment({ plan: "start", period: "month" });
    expect(res.confirmation_url).toContain("yoomoney.ru");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.arendora.ru/functions/v1/billing");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer jwt-123");
    const body = JSON.parse(init.body);
    expect(body.action).toBe("create");
    expect(body.plan).toBe("start");
    expect(body.period).toBe("month");
    expect(body.return_url).toMatch(/^https?:\/\/[^"]+\/app\?billing=return$/)
  });

  it("без сессии — SESSION_EXPIRED без похода в сеть", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(createBillingPayment({ plan: "start" })).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BILLING_NOT_CONFIGURED (ключи не вставлены) пробрасывается с кодом", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "BILLING_NOT_CONFIGURED" }) });
    await expect(createBillingPayment({ plan: "start" })).rejects.toMatchObject({ code: "BILLING_NOT_CONFIGURED" });
  });

  it("неизвестный тариф отвергается на клиенте до запроса", async () => {
    await expect(createBillingPayment({ plan: "vip" })).rejects.toMatchObject({ code: "BAD_PLAN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("getBillingStatus: GET возвращает план и платежи", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plan: "start", plan_until: "2027-01-01T00:00:00Z", payments: [{ id: "p1", status: "succeeded" }] }),
    });
    const res = await getBillingStatus();
    expect(res.plan).toBe("start");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("цены тарифов = оферта (Start 990/9900, Pro 2990/29900, Business 7990/79900)", () => {
    expect(BILLING_PRICES.start).toEqual({ month: 990, year: 9900, title: "Start" });
    expect(BILLING_PRICES.pro).toEqual({ month: 2990, year: 29900, title: "Pro" });
    expect(BILLING_PRICES.business).toEqual({ month: 7990, year: 79900, title: "Business" });
    expect(BILLING_PRICES.free).toBeUndefined();
  });
});
