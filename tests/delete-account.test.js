import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Клиентский флоу удаления учётной записи: edge-функция delete-account
// вызывается с JWT из сессии, при ошибке сессия НЕ гасится, при успехе
// выполняется signOut. Сама функция (supabase/functions/delete-account)
// проверяется на стенде edge-runtime при деплое — здесь моки.

const { getSession, signOut } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(async () => ({})),
}));

vi.mock("@/lib/supabase/config", () => ({
  supabase: { auth: { getSession, signOut } },
  SUPABASE_URL: "https://api.arendora.ru",
  SUPABASE_ANON_KEY: "test-anon-key",
  isSupabaseConfigured: true,
  robustStorage: {},
  probeSessionStores: vi.fn(async () => ({ ls: 0, ck: 0, idb: 0, sw: false })),
}));

import { deleteAccount } from "@/lib/supabase/auth";
import * as facade from "@/lib/api/auth";

const mockFetch = (impl) => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("удаление учётной записи (клиент)", () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "jwt-test" } } });
    signOut.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("успех: Bearer JWT → edge-функция, затем signOut", async () => {
    const fetchMock = mockFetch(async (url, opts) => ({
      ok: true,
      json: async () => ({ ok: true }),
      url,
      method: opts?.method,
      headers: opts?.headers,
    }));
    await expect(deleteAccount()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.arendora.ru/functions/v1/delete-account");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer jwt-test");
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("ошибка edge-функции: reject с текстом, сессия не гасится", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "DELETE: fk violation" }),
    }));
    await expect(deleteAccount()).rejects.toThrow("DELETE: fk violation");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("нет сессии: SESSION_EXPIRED без похода в сеть", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = mockFetch(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    await expect(deleteAccount()).rejects.toThrow("SESSION_EXPIRED");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("фасад api/auth в облаке проксирует deleteAccount", () => {
    expect(facade.deleteAccount).toBe(deleteAccount);
  });
});
