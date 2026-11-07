import { describe, it, expect, beforeEach } from "vitest";

// Стабы браузерного окружения: тесты гоняются в node.
// window.location.search подменяется между сценариями визитов.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const location = { search: "" };
globalThis.window = { location, addEventListener() {}, removeEventListener() {} };
// supabase-клиент в utm.js читает cookie/idb при инициализации — в node их нет
globalThis.document = { cookie: "" };
globalThis.BroadcastChannel = class {
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
  onmessage = null;
};

const { captureUtm, utmSignupPayload, getStoredUtm, clearUtm } = await import("@/lib/utm");

beforeEach(() => {
  store.clear();
  location.search = "";
});

describe("UTM-атрибуция", () => {
  it("первый визит с метками записывает first-touch и last-touch", () => {
    location.search = "?utm_source=yandex&utm_medium=cpc&utm_campaign=search-bofu-product";
    expect(captureUtm()).toBe(true);
    const rec = getStoredUtm();
    expect(rec.first.campaign).toBe("search-bofu-product");
    expect(rec.last.campaign).toBe("search-bofu-product");
    expect(rec.first.source).toBe("yandex");
    expect(rec.first.captured_at).toBeTruthy();
  });

  it("второй визит с другой меткой обновляет last-touch, first-touch не трогает", () => {
    location.search = "?utm_source=yandex&utm_campaign=search-bofu-product";
    captureUtm();
    location.search = "?utm_source=yandex&utm_campaign=retarget-visitors";
    captureUtm();
    const rec = getStoredUtm();
    expect(rec.first.campaign).toBe("search-bofu-product");
    expect(rec.last.campaign).toBe("retarget-visitors");
  });

  it("внутренний переход без меток не сбрасывает атрибуцию", () => {
    location.search = "?utm_source=yandex&utm_campaign=search-bofu-product";
    captureUtm();
    location.search = ""; // SPA-переход: query потерялся
    expect(captureUtm()).toBe(false);
    expect(getStoredUtm().last.campaign).toBe("search-bofu-product");
  });

  it("клик-идентификаторы Директа сохраняются вместе с utm", () => {
    location.search = "?utm_source=yandex&ysclid=abc123";
    captureUtm();
    expect(getStoredUtm().last.ysclid).toBe("abc123");
    const payload = utmSignupPayload();
    expect(payload.ysclid).toBe("abc123");
  });

  it("utmSignupPayload: last-touch поверх, first-touch внутри, ключи без префикса", () => {
    location.search = "?utm_source=yandex&utm_medium=cpc&utm_campaign=search&utm_content=ad1";
    captureUtm();
    location.search = "?utm_source=yandex&utm_campaign=retarget";
    captureUtm();
    const payload = utmSignupPayload();
    expect(payload.campaign).toBe("retarget");
    expect(payload.source).toBe("yandex");
    expect(payload.medium).toBe("cpc");
    expect(payload.first_touch.campaign).toBe("search");
    expect(payload.first_touch.content).toBe("ad1");
    expect(payload.utm_source).toBeUndefined();
    expect(payload.first_touch.utm_campaign).toBeUndefined();
  });

  it("без меток payload пустой — ключ utm в metadata не попадёт", () => {
    location.search = "?ref=AB12CD34";
    captureUtm();
    expect(utmSignupPayload()).toBeUndefined();
  });

  it("TTL 30 дней: просроченная запись игнорируется и чистится", () => {
    location.search = "?utm_source=yandex&utm_campaign=old";
    captureUtm();
    // Состариваем запись на 31 день
    const rec = JSON.parse(store.get("arendora:utm"));
    rec.updated_at = Date.now() - 31 * 24 * 60 * 60 * 1000;
    store.set("arendora:utm", JSON.stringify(rec));
    expect(getStoredUtm()).toBeNull();
    // Новый визит с метками начинает атрибуцию заново
    location.search = "?utm_source=yandex&utm_campaign=new";
    captureUtm();
    expect(getStoredUtm().first.campaign).toBe("new");
  });

  it("clearUtm после успешной регистрации удаляет запись", () => {
    location.search = "?utm_source=yandex&utm_campaign=search-bofu-product";
    captureUtm();
    clearUtm();
    expect(getStoredUtm()).toBeNull();
    expect(utmSignupPayload()).toBeUndefined();
  });
});

describe("UTM в локальной регистрации", () => {
  it("signup переносит метки в запись аккаунта и чистит localStorage", async () => {
    const local = await import("@/lib/data/localAuth");
    location.search = "?utm_source=yandex&utm_medium=cpc&utm_campaign=search-bofu-product";
    captureUtm();
    const result = await local.signup({
      full_name: "Тест",
      email: "utm-test@example.test",
      password: "password123",
    });
    expect(result.otp).toBeTruthy();
    const users = store.get("arendora:users");
    expect(users).toBeTruthy();
    const user = JSON.parse(users).find((u) => u.email === "utm-test@example.test");
    expect(user.utm.campaign).toBe("search-bofu-product");
    expect(user.utm.source).toBe("yandex");
    // Атрибуция записана в аккаунт — локальное хранение чистится
    expect(getStoredUtm()).toBeNull();
  });
});
