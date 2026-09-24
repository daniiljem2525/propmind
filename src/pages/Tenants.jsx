import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Mail, Pencil, Phone, Plus, Search, Trash2, Users, Building2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { useNewParam } from "@/hooks/useNewParam";
import UpsellDialog from "@/components/UpsellDialog";
import { getPlanLimits } from "@/lib/config/misc";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { Tenant, Property } from "@/lib/api/entities";
import { linkTenantToProperty, unlinkTenantFromProperty, createMonthlySchedule } from "@/lib/services";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { TENANT_STATUS_CONFIG, PROPERTY_STATUS_CONFIG } from "@/lib/config/statuses";
import { cn, initials, todayISO } from "@/lib/utils";

const STATUS_OPTIONS = ["active", "inactive", "pending"];

// ——— Форма арендатора: имя + email обязательны, объект — опционально ———
function TenantFormDialog({ open, onClose, editing, properties }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", property_id: "", notes: "", status: "active" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm({
        full_name: editing?.full_name || "",
        email: editing?.email || "",
        phone: editing?.phone || "",
        property_id: editing?.property_id || "",
        notes: editing?.notes || "",
        status: editing?.status || "active",
      });
    }
  }, [open, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) return setError(t("tenants.required"));
    setSaving(true);
    try {
      const property = properties.find((p) => p.id === form.property_id) || null;
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone || null,
        property_id: property?.id || null,
        property_name: property?.name || null,
        notes: form.notes || null,
        status: form.status,
        ...(editing ? {} : { move_in_date: todayISO() }),
      };

      if (editing) {
        await Tenant.update(editing.id, payload);
        const oldProp = properties.find((p) => p.id === editing.property_id);
        if (oldProp && oldProp.tenant_id === editing.id && oldProp.id !== property?.id) {
          await unlinkTenantFromProperty(oldProp);
        }
        if (property && property.tenant_id !== editing.id) {
          await linkTenantToProperty({ ...editing, ...payload }, property, { firstPayment: false });
          toast.success(t("tenants.relinked"));
        } else {
          toast.success(t("tenants.saved"));
        }
      } else {
        const tenant = await Tenant.create(payload);
        if (property) {
          // Автосвязывание: объект → rented, первый платёж создаётся сам
          await linkTenantToProperty(tenant, property);
          toast.success(t("tenants.autoLinked"));
        } else {
          toast.success(t("tenants.saved"));
        }
      }
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
      title={editing ? t("tenants.editTenant") : t("tenants.addTenant")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="tenant-form" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={submit} className="space-y-4">
        <Field label={t("tenants.fullName")} required>
          <Input value={form.full_name} onChange={set("full_name")} placeholder={lang === "ru" ? "Игорь Соколов" : "John Smith"} autoFocus />
        </Field>
        <Field label={t("tenants.email")} required>
          <Input type="email" value={form.email} onChange={set("email")} placeholder="tenant@example.com" />
        </Field>
        <Field label={t("tenants.phone")}>
          <Input value={form.phone} onChange={set("phone")} placeholder="+7 900 000-00-00" />
        </Field>
        <Field label={t("tenants.property")} hint={t("common.optional")}>
          <Select value={form.property_id} onChange={set("property_id")}>
            <option value="">{t("tenants.selectProperty")}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.tenant_name ? ` · ${p.tenant_name}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("common.status")}>
          <Select value={form.status} onChange={set("status")}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {TENANT_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("tenants.notes")}>
          <Textarea value={form.notes} onChange={set("notes")} rows={2} />
        </Field>
        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
        )}
      </form>
    </Dialog>
  );
}

export default function Tenants() {
  const { t, lang } = useLang();
  const toast = useToast();
  const demo = useDemoSeed();
  const { data: tenants, loading } = useCollection(Tenant);
  const { data: properties } = useCollection(Property);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const planLimits = getPlanLimits();

  const tryCreate = () => {
    if (planLimits.tenants !== null && tenants.length >= planLimits.tenants) {
      setUpsellOpen(true);
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  };
  useNewParam(tryCreate);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [scheduleConfirm, setScheduleConfirm] = useState(null);

  const propertyById = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p])), [properties]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return tenants.filter((x) => {
      const matchesQ =
        !query ||
        (x.full_name || "").toLowerCase().includes(query) ||
        (x.email || "").toLowerCase().includes(query) ||
        (x.property_name || "").toLowerCase().includes(query);
      return matchesQ && (status === "all" || x.status === status);
    });
  }, [tenants, q, status]);

  const runSchedule = async (tenant) => {
    const property = propertyById[tenant.property_id];
    if (!property || !property.rent_amount) return;
    setBusyId(tenant.id);
    try {
      const n = await createMonthlySchedule(tenant, property);
      toast.success(t("tenants.scheduleCreated").replace("{n}", n));
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const property = propertyById[deleting.property_id];
    if (property && property.tenant_id === deleting.id) {
      await unlinkTenantFromProperty(property);
    }
    await Tenant.delete(deleting.id);
    toast.success(t("tenants.deleted"));
    setDeleting(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("tenants.title")}
        subtitle={t("tenants.subtitle")}
        actions={
          <Button
            onClick={tryCreate}
          >
            <Plus className="h-4 w-4" />
            {t("tenants.addTenant")}
          </Button>
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
              {TENANT_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Card className="h-64 animate-pulse" />
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("tenants.emptyTitle")}
          description={t("tenants.emptySubtitle")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={tryCreate}
              >
                <Plus className="h-4 w-4" />
                {t("tenants.addTenant")}
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
        <Card>
          <div className="divide-y">
            {filtered.map((x) => {
              const property = propertyById[x.property_id];
              const canSchedule = property && Number(property.rent_amount) > 0;
              return (
                <div key={x.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {initials(x.full_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{x.full_name}</p>
                      <StatusBadge config={TENANT_STATUS_CONFIG} value={x.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {x.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {x.email}
                        </span>
                      )}
                      {x.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {x.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 sm:w-56">
                    {property ? (
                      <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">{property.name}</span>
                      </span>
                    ) : (
                      <span className="rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
                        {t("tenants.noProperty")}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canSchedule}
                      loading={busyId === x.id}
                      onClick={() => setScheduleConfirm(x)}
                      title={canSchedule ? t("tenants.scheduleHint") : t("tenants.noProperty")}
                    >
                      <CalendarPlus className="h-4 w-4" />
                      <span className="hidden md:inline">{t("tenants.createSchedule")}</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(x);
                        setDialogOpen(true);
                      }}
                      title={t("common.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(x)} title={t("common.delete")} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <TenantFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} properties={properties} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        description={deleting?.full_name}
      />

      <UpsellDialog open={upsellOpen} onClose={() => setUpsellOpen(false)} feature={t("upsell.features.tenants")} />

      {/* Подтверждение создания графика */}
      <ConfirmDialog
        open={!!scheduleConfirm}
        onClose={() => setScheduleConfirm(null)}
        onConfirm={() => {
          const x = scheduleConfirm;
          setScheduleConfirm(null);
          runSchedule(x);
        }}
        title={t("tenants.confirmScheduleTitle")}
        description={t("tenants.confirmScheduleDesc").replace("{name}", scheduleConfirm?.full_name || "")}
        confirmLabel={t("tenants.createSchedule")}
      />
    </div>
  );
}
