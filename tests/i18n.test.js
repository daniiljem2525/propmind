import { describe, it, expect } from "vitest";
import { ru } from "@/lib/i18n/ru.js";
import { en } from "@/lib/i18n/en.js";

// Паритет локализаций: любая строка, добавленная в ru и забытая в en
// (или наоборот), ломает интерфейс — тест ловит это до выкладки.
describe("локализации RU/EN", () => {
  it("наборы ключей совпадают", () => {
    const ruKeys = Object.keys(ru).sort();
    const enKeys = Object.keys(en).sort();
    const onlyRu = ruKeys.filter((k) => !enKeys.includes(k));
    const onlyEn = enKeys.filter((k) => !ruKeys.includes(k));
    expect(onlyRu).toEqual([]);
    expect(onlyEn).toEqual([]);
  });

  it("значения непустые", () => {
    for (const [dict, name] of [[ru, "ru"], [en, "en"]]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, `${name}: ${key}`).toBe("string");
        expect(value.length, `${name}: ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("название приложения — Arendora в обеих локализациях", () => {
    expect(ru["app.name"]).toBe("Arendora");
    expect(en["app.name"]).toBe("Arendora");
  });
});
