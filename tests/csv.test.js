import { describe, it, expect } from "vitest";
import { parseCSV, toCSV } from "@/lib/csv";

describe("parseCSV", () => {
  it("определяет разделитель «;» и читает заголовок", () => {
    const rows = parseCSV("name;address;rent_amount\nКвартира;Ленина 1;50000");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Квартира", address: "Ленина 1" });
    expect(rows[0].rent_amount).toBe(50000);
  });

  it("работает без заголовка — колонки по позиции", () => {
    const rows = parseCSV("Студия;Центр;30000");
    expect(rows[0]).toMatchObject({ name: "Студия", address: "Центр" });
    expect(rows[0].rent_amount).toBe(30000);
  });

  it("русская шапка тоже распознаётся", () => {
    const rows = parseCSV("название;адрес;аренда\nДом;Жуковка;350000");
    expect(rows[0]).toMatchObject({ name: "Дом", address: "Жуковка" });
    expect(rows[0].rent_amount).toBe(350000);
  });

  it("пустой вход — пустой список", () => {
    expect(parseCSV("")).toEqual([]);
  });
});

describe("toCSV", () => {
  const headers = [
    { key: "name", label: "Имя" },
    { key: "note", label: "Заметка" },
  ];

  it("формирует BOM + заголовок + строки через «;»", () => {
    const csv = toCSV([{ name: "Иван", note: "ок" }], headers);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Имя;Заметка");
    expect(csv).toContain("Иван;ок");
  });

  it("нейтрализует CSV-инъекцию: значение с «=» не превращается в формулу", () => {
    const csv = toCSV([{ name: "=HYPERLINK(http://evil)", note: "+cmd" }], headers);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd");
  });

  it("кавычки и запятые экранируются по RFC", () => {
    const csv = toCSV([{ name: 'Иван "Тест", Jr', note: "a,b" }], headers);
    expect(csv).toContain('"Иван ""Тест"", Jr"');
    expect(csv).toContain('"a,b"');
  });
});
