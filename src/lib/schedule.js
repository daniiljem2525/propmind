// Чистая арифметика графика платежей: вынесена из services.js, чтобы
// проверяться тестами без бэкенда (там логика перемешана с Payment.list()).
import { addMonthsISO, todayISO } from "@/lib/utils";

// Один элемент графика по объекту и арендатору.
function periodOf(iso) {
  // Месяц и год берём из самой строки: new Date("2026-11-01") — это полночь
  // по UTC, и в часовых поясах западнее UTC getMonth() вернул бы октябрь.
  const [year, month] = iso.split("-").map(Number);
  return { period_month: month, period_year: year };
}

/**
 * График на `months` месяцев вперёд от `startISO`.
 * Периоды, которые у арендатора уже есть, пропускаются (защита от дублей
 * при повторном нажатии кнопки).
 *
 * @returns {Array<object>} записи платежей, готовые к bulkCreate
 */
export function buildMonthlySchedule({
  tenant,
  property,
  months = 12,
  existing = [],
  startISO = todayISO(),
}) {
  const items = [];
  let cursor = startISO;
  // Number(undefined) — это NaN, а NaN в платёж попадать не должен:
  // вызывающий код отсекает нулевую аренду, а здесь страхуемся от порчи данных
  const rent = Number(property.rent_amount);
  const amount = Number.isFinite(rent) ? rent : 0;

  for (let i = 0; i < months; i++) {
    cursor = addMonthsISO(cursor, 1);
    const { period_month, period_year } = periodOf(cursor);
    const duplicate = existing.some(
      (p) =>
        p.tenant_id === tenant.id &&
        p.property_id === property.id &&
        p.period_month === period_month &&
        p.period_year === period_year
    );
    if (duplicate) continue;

    items.push({
      property_id: property.id,
      property_name: property.name,
      tenant_id: tenant.id,
      tenant_name: tenant.full_name,
      amount,
      currency: property.currency || "RUB",
      due_date: cursor,
      status: "pending",
      period_month,
      period_year,
    });
  }

  return items;
}
