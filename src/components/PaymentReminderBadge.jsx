// Бейдж напоминания о платеже: «просрочен на N дней», «платёж сегодня»,
// «через N дней». Показывается во всех разделах (дашборд, объекты, жильцы,
// платежи) по данным графика — считалка в src/lib/reminders.js.
// Без состояния и без запросов: что дали о платеже, то и рисуем.
import { BellRing, AlarmClock, AlertTriangle } from "lucide-react";
import { reminderState, reminderLabel } from "@/lib/reminders";
import { cn } from "@/lib/utils";

const KIND_CONFIG = {
  overdue: {
    icon: AlertTriangle,
    className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  },
  today: {
    icon: BellRing,
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  soon: {
    icon: AlarmClock,
    className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  },
};

export default function PaymentReminderBadge({ payment, today, lang = "ru", className }) {
  const state = reminderState(payment, today);
  if (!state) return null;
  const { icon: Icon, className: kindClass } = KIND_CONFIG[state.kind];
  const label = reminderLabel(state, lang);
  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
        kindClass,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
