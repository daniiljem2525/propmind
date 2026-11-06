import { describe, it, expect, vi } from "vitest";
import { notifyCollection, subscribeCollection } from "@/lib/data/events";

// Шина мутаций: свои же изменения должны обновлять списки мгновенно,
// не дожидаясь Supabase Realtime (инцидент 06.11 — «объект появлялся только после F5»)
describe("локальная шина событий коллекций", () => {
  it("notify дёргает подписчика нужной коллекции", () => {
    const cb = vi.fn();
    const un = subscribeCollection("properties", cb);
    notifyCollection("properties");
    expect(cb).toHaveBeenCalledTimes(1);
    un();
  });

  it("другие коллекции не задеваются", () => {
    const cb = vi.fn();
    const un = subscribeCollection("tenants", cb);
    notifyCollection("payments");
    expect(cb).not.toHaveBeenCalled();
    un();
  });

  it("после отписки уведомлений нет", () => {
    const cb = vi.fn();
    const un = subscribeCollection("properties", cb);
    un();
    notifyCollection("properties");
    expect(cb).not.toHaveBeenCalled();
  });

  it("несколько подписчиков получают событие, отписка одного не ломает остальных", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unA = subscribeCollection("bookings", a);
    const unB = subscribeCollection("bookings", b);
    unA();
    notifyCollection("bookings");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    unB();
  });
});
