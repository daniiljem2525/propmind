import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarDays,
  Check,
  CreditCard,
  Download,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { useNewParam } from "@/hooks/useNewParam";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { Payment, Tenant, Property } from "@/lib/api/entities";
import { pushNotification } from "@/lib/services";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_STATUS_CONFIG } from "@/lib/config/statuses";
import { PAYMENT_METHOD_CONFIG } from "@/lib/config/misc";
import { downloadFile, toCSV } from "@/lib/csv";
import { cn, formatMoney, monthShort, todayISO, uid } from "@/lib/utils";

const STATUS_OPTIONS = ["pending", "paid", "overdue", "partial", "cancelled"];
const METHOD_OPTIONS = ["", "cash", "bank", "card", "stripe"];

// ——— Форма платежа: выбор арендатора автозаполняет объект и сумму ———
function PaymentFormDialog({ open, onClose, editing, tenants, properties }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm({
        tenant_id: editing?.tenant_id || "",
        property_id: editing?.property_id || "",
        amount: editing?.amount ?? "",
        currency: editing?.currency || "RUB",
        due_date: editing?.due_date || todayISO(),
        status: editing?.status || "pending",
        payment_method: editing?.payment_method || "",
        notes: editing?.notes || "",
      });
    }
  }, [open, editing]);

  const onTenantChange = (value) => {
    const tenant = tenants.find((x) => x.id === value);
    const property = properties.find((p) => p.id === tenant?.property_id);
    setForm((f) => ({
      ...f,
      tenant_id: value,
      ...(property
        ? { property_id: property.id, amount: property.rent_amount, currency: property.currency || "RUB" }
        : {}),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.property_id || !form.amount) return setError(t("payments.required"));
    setSaving(true);
    try {
      const property = properties.find((p) => p.id === form.property_id);
      const tenant = tenants.find((x) => x.id === form.tenant_id);
      const d = new Date(form.due_date);
      const payload = {
        tenant_id: tenant?.id || null,
        tenant_name: tenant?.full_name || null,
        property_id: property.id,
        property_name: property.name,
        amount: Number(form.amount) || 0,
        currency: form.currency || property.currency || "RUB",
        due_date: form.due_date,
        status: form.status,
        payment_method: form.payment_method || null,
        paid_date: form.status === "paid" ? editing?.paid_date || todayISO() : null,
        notes: form.notes || null,
        period_month: d.getMonth() + 1,
        period_year: d.getFullYear(),
      };
      if (editing) {
        await Payment.update(editing.id, payload);
      } else {
        await Payment.create(payload);
      }
      toast.success(t("payments.saved"));
      onClose();
    } catch (err) {
      toast.error(err.message === "QUOTA_EXCEEDED" ? t("errors.quota") : t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("payments.editPayment") : t("payments.addPayment")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="payment-form" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <Field label={t("payments.tenant")} hint={t("payments.autofillHint")}>
          <Select value={form.tenant_id} onChange={(e) => onTenantChange(e.target.value)}>
            <option value="">{t("payments.selectTenant")}</option>
            {tenants.map((x) => (
              <option key={x.id} value={x.id}>
                {x.full_name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("payments.property")} required>
          <Select value={form.property_id} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}>
            <option value="">—</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("payments.amount")} required>
            <Input type="number" min="0" step="100" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label={t("payments.dueDate")} required>
            <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          </Field>
          <Field label={t("common.status")}>
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("payments.method")}>
            <Select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}>
              {METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m ? PAYMENT_METHOD_CONFIG[m][lang === "ru" ? "label_ru" : "label_en"] : t("common.none")}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t("payments.notes")}>
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </Field>

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
        )}
      </form>
    </Dialog>
  );
}

export default function Payments() {
  const { t, lang } = useLang();
  const toast = useToast();
  const demo = useDemoSeed();
  const { data: payments, loading } = useCollection(Payment);
  const { data: tenants } = useCollection(Tenant);
  const { data: properties } = useCollection(Property);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  useNewParam(() => setDialogOpen(true));
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return payments.filter((p) => {
      const matchesQ =
        !query ||
        (p.tenant_name || "").toLowerCase().includes(query) ||
        (p.property_name || "").toLowerCase().includes(query);
      return matchesQ && (status === "all" || p.status === status);
    });
  }, [payments, q, status]);

  const periodLabel = (p) =>
    p.period_month ? `${monthShort(p.period_month - 1, lang)} ${p.period_year}` : "—";

  const markPaid = async (p, { online = false } = {}) => {
    await Payment.update(p.id, {
      status: "paid",
      paid_date: todayISO(),
      payment_method: online ? "stripe" : p.payment_method || "bank",
      stripe_payment_id: online ? `pi_demo_${uid().slice(0, 8)}` : p.stripe_payment_id || null,
    });
    if (online) {
      toast.info(t("payments.onlineMock"));
    } else {
      toast.success(t("payments.paid"));
    }
    pushNotification({
      type: "payment_received",
      title: online ? "Онлайн-оплата получена" : "Платёж получен",
      message: `${p.tenant_name || p.property_name} — ${formatMoney(p.amount, p.currency, lang)}`,
      link: "/app/payments",
      related_id: p.id,
    });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await Payment.delete(deleting.id);
    toast.success(t("payments.deleted"));
    setDeleting(null);
  };

  // ——— Массовые действия и экспорт ———
  const canPay = (p) => ["pending", "overdue", "partial"].includes(p.status);
  const payable = filtered.filter((p) => canPay(p));

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllPayable = () => {
    setSelected((prev) => {
      const allSelected = payable.length > 0 && payable.every((p) => prev.has(p.id));
      return allSelected ? new Set() : new Set(payable.map((p) => p.id));
    });
  };

  const markSelectedPaid = async () => {
    setBulkBusy(true);
    try {
      for (const p of payable.filter((x) => selected.has(x.id))) {
        await Payment.update(p.id, {
          status: "paid",
          paid_date: todayISO(),
          payment_method: p.payment_method || "bank",
        });
      }
      toast.success(t("payments.selectedPaid").replace("{n}", selected.size));
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    const csv = toCSV(
      filtered.map((p) => ({
        tenant: p.tenant_name || "",
        property: p.property_name || "",
        amount: p.amount,
        currency: p.currency || "RUB",
        due_date: p.due_date,
        paid_date: p.paid_date || "",
        status: p.status,
        period: p.period_month ? `${p.period_month}/${p.period_year}` : "",
      })),
      [
        { key: "tenant", label: lang === "ru" ? "Арендатор" : "Tenant" },
        { key: "property", label: lang === "ru" ? "Объект" : "Property" },
        { key: "amount", label: lang === "ru" ? "Сумма" : "Amount" },
        { key: "currency", label: lang === "ru" ? "Валюта" : "Currency" },
        { key: "due_date", label: lang === "ru" ? "Дата оплаты" : "Due date" },
        { key: "paid_date", label: lang === "ru" ? "Оплачен" : "Paid on" },
        { key: "status", label: lang === "ru" ? "Статус" : "Status" },
        { key: "period", label: lang === "ru" ? "Период" : "Period" },
      ]
    );
    downloadFile(csv, `propmind-payments-${todayISO()}.csv`);
  };

  const remind = (p) => {
    const tenant = tenants.find((x) => x.id === p.tenant_id);
    const subject = lang === "ru" ? "Напоминание об оплате" : "Payment reminder";
    const body =
      (lang === "ru"
        ? `Здравствуйте!\n\nНапоминаем, что платёж ${formatMoney(p.amount, p.currency, lang)} за объект «${p.property_name}» был ожидан ${p.due_date}.\nПросим произвести оплату.\n\nС уважением,\nPropMind`
        : `Hello!\n\nThis is a reminder that the payment of ${formatMoney(p.amount, p.currency, lang)} for "${p.property_name}" was due on ${p.due_date}.\nPlease complete the payment.\n\nBest regards,\nPropMind`);
    window.location.href = `mailto:${tenant?.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    toast.info(t("payments.remindSent"));
  };

  const actionButtons = (p) => (
    <div className="flex shrink-0 items-center gap-1">
      {canPay(p) && p.tenant_id && (
        <Button size="icon" variant="ghost" title={t("payments.remind")} onClick={() => remind(p)} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10">
          <Mail className="h-4 w-4" />
        </Button>
      )}
      {canPay(p) && (
        <>
          <Button size="icon" variant="ghost" title={t("payments.markPaid")} onClick={() => markPaid(p)} className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title={t("payments.payOnline")} onClick={() => markPaid(p, { online: true })} className="text-primary hover:bg-muted">
            <CreditCard className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button
        size="icon"
        variant="ghost"
        title={t("common.edit")}
        onClick={() => {
          setEditing(p);
          setDialogOpen(true);
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" title={t("common.delete")} onClick={() => setDeleting(p)} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("payments.title")}
        subtitle={t("payments.subtitle")}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" />
              {t("payments.exportCsv")}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t("payments.addPayment")}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.searchPlaceholder")} className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-52">
          <option value="all">{t("common.status")}: {t("common.all")}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
            </option>
          ))}
        </Select>
      </div>

      {/* Панель массовых действий */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium">{t("payments.bulkSelected").replace("{n}", selected.size)}</span>
          <Button size="sm" onClick={markSelectedPaid} loading={bulkBusy}>
            <Check className="h-4 w-4" />
            {t("payments.markSelectedPaid")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("common.cancel")}
          </Button>
        </div>
      )}

      {loading ? (
        <Card className="h-64 animate-pulse" />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title={t("payments.emptyTitle")}
          description={t("payments.emptySubtitle")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("payments.addPayment")}
              </Button>
              <Button variant="outline" onClick={demo.run} loading={demo.loading}>
                {t("common.demoData")}
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("common.noResults")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setStatus("all");
              }}
            >
              {t("common.clearFilters")}
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          {/* Таблица — десктоп */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    checked={payable.length > 0 && payable.every((p) => selected.has(p.id))}
                    onChange={toggleAllPayable}
                    disabled={payable.length === 0}
                  />
                </th>
                <th className="px-4 py-3 font-medium">{t("payments.tenant")}</th>
                <th className="px-4 py-3 font-medium">{t("payments.property")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("payments.amount")}</th>
                <th className="px-4 py-3 font-medium">{t("payments.dueDate")}</th>
                <th className="px-4 py-3 font-medium">{t("payments.period")}</th>
                <th className="px-4 py-3 font-medium">{t("common.status")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className={cn("transition-colors hover:bg-muted/30", selected.has(p.id) && "bg-primary/5")}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      disabled={!canPay(p)}
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                    />
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 font-medium">{p.tenant_name || "—"}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">{p.property_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMoney(p.amount, p.currency, lang)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {p.due_date}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{periodLabel(p)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge config={PAYMENT_STATUS_CONFIG} value={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">{actionButtons(p)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Список — мобильные */}
          <div className="divide-y md:hidden">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{p.tenant_name || p.property_name}</p>
                    <StatusBadge config={PAYMENT_STATUS_CONFIG} value={p.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.property_name} · {p.due_date} · {periodLabel(p)}
                  </p>
                  <p className="mt-1 font-semibold">{formatMoney(p.amount, p.currency, lang)}</p>
                </div>
                {actionButtons(p)}
              </div>
            ))}
          </div>
        </Card>
      )}

      <PaymentFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} tenants={tenants} properties={properties} />

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} description={deleting ? `${deleting.tenant_name || deleting.property_name} — ${formatMoney(deleting.amount, deleting.currency, lang)}` : ""} />
    </div>
  );
}
