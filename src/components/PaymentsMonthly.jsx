// Помесячный график платежей: заголовок месяца, внутри — платежи по датам
// со статусами (оплачен / ожидается / просрочен) и навигация по месяцам.
// Ответ на «период месяцев в платежах чётко шёл»: месяцы видны целиком,
// по ним можно листать вперёд и назад, у каждого месяца — сводка сумм.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, CircleCheck, CircleAlert, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import PaymentReminderBadge from "@/components/PaymentReminderBadge";
import { useLang } from "@/lib/i18n/LangContext";
import { PAYMENT_STATUS_CONFIG } from "@/lib/config/statuses";
import { cn, formatDate, formatMoney, monthLong, todayISO } from "@/lib/utils";

const monthKey = (iso) => (iso || "").slice(0, 7); // "YYYY-MM"
const keyOf = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

export default function PaymentsMonthly({ payments }) {
  const { t, lang } = useLang();
  const today = todayISO();
  const nowKey = monthKey(today);

  // Диапазон навигации: от первого до последнего месяца с платежами,
  // текущий месяц всегда внутри диапазона — график «чётко шёл» по месяцам.
  const [minKey, maxKey] = useMemo(() => {
    const keys = payments.map((p) => monthKey(p.due_date)).filter(Boolean).sort();
    return [
      keys.length ? [keys[0], nowKey].sort()[0] : nowKey,
      keys.length ? [keys[keys.length - 1], nowKey].sort()[1] : nowKey,
    ];
  }, [payments, nowKey]);

  const [cursor, setCursor] = useState(nowKey);
  const [year, month] = cursor.split("-").map(Number);

  const step = (delta) => {
    const next = new Date(year, month - 1 + delta, 1);
    const key = keyOf(next.getFullYear(), next.getMonth() + 1);
    if (key >= minKey && key <= maxKey) setCursor(key);
  };

  const monthPayments = useMemo(
    () =>
      payments
        .filter((p) => monthKey(p.due_date) === cursor)
        .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")),
    [payments, cursor]
  );

  // Сводка месяца: ожидается (незакрытые), оплачено, просрочено — суммы
  const summary = useMemo(() => {
    let expected = 0, paid = 0, overdue = 0, overdueCount = 0;
    for (const p of monthPayments) {
      const sum = Number(p.amount) || 0;
      if (p.status === "paid") paid += sum;
      else if (p.status === "cancelled") continue;
      else {
        expected += sum;
        if (p.status === "overdue" || (p.due_date && p.due_date < today)) {
          overdue += sum;
          overdueCount++;
        }
      }
    }
    return { expected, paid, overdue, overdueCount };
  }, [monthPayments, today]);

  // Платежи сгруппированы по датам оплаты внутри месяца
  const byDate = useMemo(() => {
    const map = new Map();
    for (const p of monthPayments) {
      const list = map.get(p.due_date) || [];
      list.push(p);
      map.set(p.due_date, list);
    }
    return [...map.entries()];
  }, [monthPayments]);

  const atStart = cursor <= minKey;
  const atEnd = cursor >= maxKey;
  const weekday = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { weekday: "long" });

  return (
    <Card className="overflow-hidden">
      {/* Навигация по месяцам */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <Button size="icon" variant="outline" onClick={() => step(-1)} disabled={atStart} title={t("payments.prevMonth")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-base font-bold capitalize">
            {monthLong(month - 1, lang)} {year}
          </span>
          <span className="text-xs text-muted-foreground">
            {monthPayments.length
              ? t("payments.monthCount").replace("{n}", monthPayments.length)
              : t("payments.monthEmpty")}
          </span>
        </div>
        <Button size="icon" variant="outline" onClick={() => step(1)} disabled={atEnd} title={t("payments.nextMonth")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Сводка месяца */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-b px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-sky-500" />
          {t("payments.monthExpected")}: <b className="text-foreground">{formatMoney(summary.expected, "RUB", lang)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
          {t("payments.monthPaidSum")}: <b className="text-foreground">{formatMoney(summary.paid, "RUB", lang)}</b>
        </span>
        <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", summary.overdueCount > 0 && "text-rose-600 dark:text-rose-400")}>
          <CircleAlert className="h-3.5 w-3.5" />
          {t("payments.monthOverdueSum")}: <b className="text-foreground">{formatMoney(summary.overdue, "RUB", lang)}</b>
          {summary.overdueCount > 0 && ` · ${t("payments.monthOverdueCount").replace("{n}", summary.overdueCount)}`}
        </span>
      </div>

      {/* Платежи месяца, сгруппированные по датам */}
      {monthPayments.length === 0 ? (
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("payments.monthEmptyLong")}
        </CardContent>
      ) : (
        <div className="divide-y">
          {byDate.map(([date, list]) => {
            const isOverdueDay = date < today;
            const isToday = date === today;
            return (
              <div key={date} className="px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarDays className={cn("h-4 w-4", isToday ? "text-amber-500" : isOverdueDay ? "text-rose-500" : "text-muted-foreground")} />
                    {formatDate(date, lang, { day: "numeric", month: "long" })}
                  </span>
                  <span className="text-xs capitalize text-muted-foreground">{weekday(date)}</span>
                  {isToday && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                      {t("payments.today")}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {list.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.tenant_name || "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.property_name}</p>
                      </div>
                      <span className="text-sm font-semibold">{formatMoney(p.amount, p.currency || "RUB", lang)}</span>
                      {p.status === "paid" && p.paid_date && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CircleCheck className="h-3.5 w-3.5" />
                          {t("payments.paidOn").replace("{date}", formatDate(p.paid_date, lang))}
                        </span>
                      )}
                      <PaymentReminderBadge payment={p} today={today} lang={lang} />
                      <StatusBadge config={PAYMENT_STATUS_CONFIG} value={p.status} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
