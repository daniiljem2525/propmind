import { useEffect, useState } from "react";
import { Droplets, Hammer, Sparkles, Truck, X, Zap } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { AutomationOrder, MaintenanceRequest, Property } from "@/lib/api/entities";

// Бытовые службы в один клик: заявка + заказ на Профи.ру,
// дальше бот договаривается сам (и приводит проверенного мастера).
const SERVICES = [
  { id: "клининг", icon: Sparkles, ru: "Клининг", en: "Cleaning", ruDesc: "Уборка после выезда гостей", enDesc: "Cleaning after check-out" },
  { id: "мастер на час", icon: Hammer, ru: "Мастер на час", en: "Handyman", ruDesc: "Мелкий ремонт и бытовые задачи", enDesc: "Small fixes and chores" },
  { id: "электрик", icon: Zap, ru: "Электрик", en: "Electrician", ruDesc: "Розетки, свет, проводка", enDesc: "Outlets, lights, wiring" },
  { id: "сантехник", icon: Droplets, ru: "Сантехник", en: "Plumber", ruDesc: "Протечки, засоры, смесители", enDesc: "Leaks, clogs, faucets" },
  { id: "грузоперевозки", icon: Truck, ru: "Грузоперевозки", en: "Movers", ruDesc: "Доставка мебели и вещей", enDesc: "Furniture and goods delivery" },
];

const WHEN = [
  { v: "today", ru: "Сегодня", en: "Today" },
  { v: "tomorrow", ru: "Завтра", en: "Tomorrow" },
  { v: "week", ru: "На этой неделе", en: "This week" },
];

const ORDER_STATUS_LABEL = {
  pending: { label_ru: "В очереди", label_en: "Queued" },
  running: { label_ru: "Создаётся", label_en: "In progress" },
  sent: { label_ru: "Отправлен", label_en: "Sent" },
  failed: { label_ru: "Ошибка", label_en: "Failed" },
  cancelled: { label_ru: "Отменён", label_en: "Cancelled" },
};

const byDate = (a, b) => (b.created_date || "").localeCompare(a.created_date || "");

export default function Services() {
  const { lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const [properties, setProperties] = useState([]);
  const [orders, setOrders] = useState([]);
  const [service, setService] = useState(null);
  const [propertyId, setPropertyId] = useState("");
  const [when, setWhen] = useState("today");
  const [time, setTime] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([Property.list(), AutomationOrder.list()])
      .then(([props, ords]) => {
        if (!alive) return;
        setProperties(props);
        if (props[0]?.id) setPropertyId((cur) => cur || props[0].id);
        // заказы бытовых служб: maintenance-категории услуг Профи
        const families = new Set(SERVICES.map((s) => s.id));
        setOrders(ords.filter((o) => families.has((o.service_query || "").toLowerCase())).sort(byDate));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const svc = SERVICES.find((s) => s.id === service);
    const property = properties.find((p) => p.id === propertyId);
    if (!svc || !property) return;
    setBusy(true);
    try {
      const details = [
        `${lang === "ru" ? svc.ru : svc.en} — ${property.name}.`,
        time.trim()
          ? (lang === "ru" ? "Желательное время: " : "Preferred time: ") + time.trim()
          : "",
        comment.trim(),
      ]
        .filter(Boolean)
        .join(" ");
      const req = await MaintenanceRequest.create({
        title: `${lang === "ru" ? svc.ru : svc.en}: ${property.name}`,
        description: details,
        category: "other",
        urgency: when === "today" ? "high" : "medium",
        property_id: property.id,
        property_name: property.name,
      });
      await AutomationOrder.create({
        request_id: req.id,
        platform: "profi",
        service_query: svc.id,
        details: details.slice(0, 900),
        address: property.address || null,
        deadline: when,
        owner_id: user?.id,
      });
      const ords = await AutomationOrder.list();
      const families = new Set(SERVICES.map((x) => x.id));
      setOrders(ords.filter((o) => families.has((o.service_query || "").toLowerCase())).sort(byDate));
      toast.success(
        lang === "ru"
          ? "Заказан: бот договорится и согласует время"
          : "Ordered: the bot will arrange and confirm the time",
      );
      setService(null);
      setTime("");
      setComment("");
    } catch {
      toast.error(lang === "ru" ? "Не удалось создать заказ" : "Failed to create order");
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (o) => {
    try {
      await AutomationOrder.update(o.id, { status: "cancelled" });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: "cancelled" } : x)));
    } catch {
      toast.error(lang === "ru" ? "Не удалось отменить" : "Failed to cancel");
    }
  };

  const svcCfg = SERVICES.find((s) => s.id === service);

  return (
    <>
      <PageHeader
        title={lang === "ru" ? "Службы" : "Services"}
        subtitle={
          lang === "ru"
            ? "Бытовые услуги в один клик: бот найдёт исполнителя на Профи.ру и согласует время. Понравившийся мастер приедет снова."
            : "Everyday services in one click: the bot finds a contractor on Profi.ru and agrees on the time."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          return (
            <Card
              key={s.id}
              onClick={() => setService(s.id)}
              className="cursor-pointer p-5 transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-start gap-3">
                <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="h-5 w-5 text-white" />
                </span>
                <div>
                  <p className="font-semibold">{lang === "ru" ? s.ru : s.en}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {lang === "ru" ? s.ruDesc : s.enDesc}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {orders.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-semibold">
            {lang === "ru" ? "Мои заказы служб" : "My service orders"}
          </h3>
          <div className="space-y-2">
            {orders.map((o) => {
              const cfg = ORDER_STATUS_LABEL[o.status] || ORDER_STATUS_LABEL.pending;
              const cancellable = ["pending", "running", "sent"].includes(o.status);
              const SvcIcon = (SERVICES.find((s) => s.id === (o.service_query || "").toLowerCase()) || SERVICES[0]).icon;
              return (
                <Card key={o.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <SvcIcon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{o.service_query}</span>
                  <StatusBadge config={ORDER_STATUS_LABEL} value={o.status} />
                  {o.status === "sent" && o.result_url && (
                    <a href={o.result_url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline dark:text-sky-400">
                      {lang === "ru" ? "открыть на Профи" : "open on Profi"}
                    </a>
                  )}
                  {o.status === "failed" && o.error && (
                    <span className="min-w-0 flex-1 truncate text-xs text-rose-500" title={o.error}>
                      {o.error}
                    </span>
                  )}
                  {cancellable && (
                    <Button size="sm" variant="ghost" className="ml-auto text-rose-600" onClick={() => cancelOrder(o)}>
                      <X className="h-4 w-4" />
                      {lang === "ru" ? "Отменить" : "Cancel"}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={!!service}
        onClose={() => setService(null)}
        title={svcCfg ? (lang === "ru" ? svcCfg.ru : svcCfg.en) : ""}
        size="md"
      >
        <form onSubmit={submit} className="space-y-4">
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lang === "ru"
                ? "Сначала добавьте объект на странице «Объекты»."
                : "Add a property first on the Properties page."}
            </p>
          ) : (
            <>
              <Field label={lang === "ru" ? "Объект" : "Property"}>
                <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={lang === "ru" ? "Когда приехать" : "When"}>
                <Select value={when} onChange={(e) => setWhen(e.target.value)}>
                  {WHEN.map((w) => (
                    <option key={w.v} value={w.v}>
                      {lang === "ru" ? w.ru : w.en}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={lang === "ru" ? "Во сколько (необязательно)" : "Time (optional)"}>
                <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder={lang === "ru" ? "после 15:00" : "after 15:00"} />
              </Field>
              <Field label={lang === "ru" ? "Комментарий (необязательно)" : "Comment (optional)"}>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setService(null)}>
                  {lang === "ru" ? "Отмена" : "Cancel"}
                </Button>
                <Button type="submit" loading={busy}>
                  {lang === "ru" ? "Заказать" : "Order"}
                </Button>
              </div>
            </>
          )}
        </form>
      </Dialog>
    </>
  );
}
