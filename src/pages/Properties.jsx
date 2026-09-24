import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, FileUp, MapPin, Pencil, Plus, Search, Trash2, User } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import ImageUpload from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { useNewParam } from "@/hooks/useNewParam";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { Property } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { PROPERTY_STATUS_CONFIG, PROPERTY_TYPE_CONFIG } from "@/lib/config/statuses";
import { CURRENCIES } from "@/lib/config/misc";
import { parseCSV } from "@/lib/csv";
import UpsellDialog from "@/components/UpsellDialog";
import { getPlanLimits } from "@/lib/config/misc";
import { addMonthsISO, cn, formatMoney, todayISO } from "@/lib/utils";

const TYPE_OPTIONS = Object.keys(PROPERTY_TYPE_CONFIG);
const STATUS_OPTIONS = ["vacant", "rented", "maintenance", "inactive"];

// ——— Сворачиваемая секция формы (прогрессивное раскрытие) ———
function Disclosure({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50"
      >
        {title}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t px-4 py-4">{children}</div>}
    </div>
  );
}

const emptyForm = () => ({
  name: "",
  address: "",
  rent_amount: "",
  currency: "RUB",
  type: "apartment",
  rooms: "",
  floor: "",
  area_sqm: "",
  lease_start: todayISO(),
  lease_end: addMonthsISO(todayISO(), 12),
  status: "vacant",
  photo_url: "",
  description: "",
});

const formFromProperty = (p) => ({
  name: p.name || "",
  address: p.address || "",
  rent_amount: p.rent_amount ?? "",
  currency: p.currency || "RUB",
  type: p.type || "apartment",
  rooms: p.rooms ?? "",
  floor: p.floor ?? "",
  area_sqm: p.area_sqm ?? "",
  lease_start: p.lease_start || todayISO(),
  lease_end: p.lease_end || addMonthsISO(todayISO(), 12),
  status: p.status || "vacant",
  photo_url: p.photo_url || "",
  description: p.description || "",
});

// ——— Форма объекта: один экран с группами ———
function PropertyFormDialog({ open, onClose, property }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm(property ? formFromProperty(property) : emptyForm());
    }
  }, [open, property]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.address.trim() || !form.rent_amount) return setError(t("properties.required"));
    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        address: form.address.trim(),
        rent_amount: Number(form.rent_amount) || 0,
        rooms: form.rooms === "" ? null : Number(form.rooms),
        floor: form.floor === "" ? null : Number(form.floor),
        area_sqm: form.area_sqm === "" ? null : Number(form.area_sqm),
      };
      if (property) {
        await Property.update(property.id, payload);
        toast.success(t("properties.updated"));
      } else {
        await Property.create(payload);
        toast.success(t("properties.created"));
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
      title={property ? t("properties.editProperty") : t("properties.addProperty")}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="property-form" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="property-form" onSubmit={submit} className="space-y-5">
        {/* Основное */}
        <div className="space-y-4">
          <p className="text-sm font-semibold text-primary">{t("properties.groupMain")}</p>
          <Field label={t("properties.name")} required>
            <Input value={form.name} onChange={set("name")} placeholder={lang === "ru" ? "ЖК «Северный парк», кв. 42" : "Oakwood Apt 42"} autoFocus />
          </Field>
          <Field label={t("properties.address")} required>
            <Input value={form.address} onChange={set("address")} placeholder={lang === "ru" ? "Москва, ул. Павла Корчагина, 12" : "12 Main St, Springfield"} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("properties.rentAmount")} required>
              <Input type="number" min="0" step="100" value={form.rent_amount} onChange={set("rent_amount")} />
            </Field>
            <Field label={t("common.currency")}>
              <Select value={form.currency} onChange={set("currency")}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {property && (
            <Field label={t("common.status")}>
              <Select value={form.status} onChange={set("status")}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {PROPERTY_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {/* Детали */}
        <Disclosure title={t("properties.groupDetails")} defaultOpen={!!property}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("properties.type")} className="col-span-2">
              <Select value={form.type} onChange={set("type")}>
                {TYPE_OPTIONS.map((ty) => (
                  <option key={ty} value={ty}>
                    {PROPERTY_TYPE_CONFIG[ty][lang === "ru" ? "label_ru" : "label_en"]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("properties.rooms")}>
              <Input type="number" min="0" value={form.rooms} onChange={set("rooms")} />
            </Field>
            <Field label={t("properties.floor")}>
              <Input type="number" value={form.floor} onChange={set("floor")} />
            </Field>
            <Field label={t("properties.area")} className="col-span-2">
              <Input type="number" min="0" step="0.1" value={form.area_sqm} onChange={set("area_sqm")} />
            </Field>
          </div>
        </Disclosure>

        {/* Договор */}
        <Disclosure title={t("properties.groupLease")} defaultOpen={!!property}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("properties.leaseStart")}>
              <Input type="date" value={form.lease_start} onChange={set("lease_start")} />
            </Field>
            <Field label={t("properties.leaseEnd")}>
              <Input type="date" value={form.lease_end} onChange={set("lease_end")} />
            </Field>
          </div>
        </Disclosure>

        {/* Фото */}
        <Disclosure title={t("properties.groupPhoto")} defaultOpen={!!property?.photo_url}>
          <ImageUpload
            value={form.photo_url}
            onChange={(v) => setForm((f) => ({ ...f, photo_url: v }))}
            label={t("properties.photo")}
            onError={() => toast.error(t("documents.fileTooLarge"))}
          />
        </Disclosure>

        {/* Описание */}
        <Disclosure title={t("properties.groupDescription")} defaultOpen={!!property?.description}>
          <Textarea value={form.description} onChange={set("description")} rows={4} />
        </Disclosure>

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
        )}
      </form>
    </Dialog>
  );
}

// ——— Карточка объекта ———
function PropertyCard({ property, onEdit, onDelete }) {
  const { t, lang } = useLang();
  const type = PROPERTY_TYPE_CONFIG[property.type] || PROPERTY_TYPE_CONFIG.other;
  const TypeIcon = type.icon;
  const meta = [
    property.area_sqm ? `${property.area_sqm} м²` : null,
    property.rooms ? `${property.rooms} ${lang === "ru" ? "комн." : "rooms"}` : null,
    property.floor !== null && property.floor !== undefined && property.floor !== "" ? `${property.floor} ${lang === "ru" ? "эт." : "fl."}` : null,
  ].filter(Boolean);

  return (
    <Card className="group overflow-hidden hover:shadow-card-hover">
      <div className="brand-gradient relative h-44 overflow-hidden">
        <div className="flex h-full items-center justify-center">
          <TypeIcon className="h-12 w-12 text-white/60" />
        </div>
        {property.photo_url && (
          <img
            src={property.photo_url}
            alt={property.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => e.currentTarget.remove()}
          />
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge config={PROPERTY_STATUS_CONFIG} value={property.status} />
        </div>
        <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <button
            onClick={onEdit}
            title={t("common.edit")}
            className="rounded-md bg-white/90 p-1.5 text-slate-700 shadow-sm backdrop-blur transition-colors hover:bg-white"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            title={t("common.delete")}
            className="rounded-md bg-white/90 p-1.5 text-rose-600 shadow-sm backdrop-blur transition-colors hover:bg-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <h3 className="truncate font-semibold leading-snug">{property.name}</h3>
        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-1">{property.address}</span>
        </p>

        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="text-lg font-bold text-primary">
            {formatMoney(property.rent_amount, property.currency, lang)}
            <span className="text-xs font-normal text-muted-foreground">{t("plans.perMonth")}</span>
          </p>
          <Badge className="bg-muted text-muted-foreground">
            <TypeIcon className="h-3 w-3" />
            {lang === "ru" ? type.label_ru : type.label_en}
          </Badge>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{property.tenant_name || t("properties.noTenant")}</span>
          </span>
          {meta.length > 0 && <span className="shrink-0">{meta.join(" · ")}</span>}
        </div>
      </div>
    </Card>
  );
}

// ——— Страница ———
export default function Properties() {
  const { t, lang } = useLang();
  const toast = useToast();
  const demo = useDemoSeed();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const { data: properties, loading } = useCollection(Property);
  const planLimits = getPlanLimits();

  const tryCreate = () => {
    if (planLimits.properties !== null && properties.length >= planLimits.properties) {
      setUpsellOpen(true);
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  };
  useNewParam(tryCreate);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Счётчик лимита для карточки тарифа
  const limitBadge =
    planLimits.properties !== null
      ? `${properties.length} / ${planLimits.properties}`
      : `${properties.length}`;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return properties.filter((p) => {
      const matchesQ =
        !query ||
        (p.name || "").toLowerCase().includes(query) ||
        (p.address || "").toLowerCase().includes(query);
      const matchesStatus = status === "all" || p.status === status;
      const matchesType = type === "all" || p.type === type;
      return matchesQ && matchesStatus && matchesType;
    });
  }, [properties, q, status, type]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await Property.delete(deleting.id);
      toast.success(t("properties.deleted"));
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const hasFilters = q || status !== "all" || type !== "all";

  // ——— Импорт объектов из CSV ———
  const importInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error(t("properties.importFailed"));
        return;
      }
      setPendingImport(rows); // сначала показываем подтверждение с количеством
    } catch (err) {
      toast.error(t("errors.generic"));
    } finally {
      setImporting(false);
    }
  };

  const runImport = async () => {
    const rows = pendingImport || [];
    setPendingImport(null);
    setImporting(true);
    try {
      for (const row of rows) {
        await Property.create({
          name: row.name,
          address: row.address,
          rent_amount: row.rent_amount,
          ...(row.type && PROPERTY_TYPE_CONFIG[row.type] ? { type: row.type } : {}),
          ...(row.rooms ? { rooms: row.rooms } : {}),
          ...(row.area_sqm ? { area_sqm: row.area_sqm } : {}),
        });
      }
      toast.success(t("properties.imported").replace("{n}", rows.length));
    } catch (err) {
      toast.error(err.message === "QUOTA_EXCEEDED" ? t("errors.quota") : t("errors.generic"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("properties.title")}
        subtitle={t("properties.subtitle")}
        actions={
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button variant="outline" onClick={() => importInputRef.current?.click()} loading={importing} title={t("properties.importHint")}>
              <FileUp className="h-4 w-4" />
              {t("properties.importCsv")}
            </Button>
            <Button
              onClick={tryCreate}
            >
              <Plus className="h-4 w-4" />
              {t("properties.addProperty")}
            </Button>
          </>
        }
      />

      {/* Фильтры */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("properties.searchPlaceholder")} className="pl-9" />
        </div>
        <div className="flex gap-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
            <option value="all">{t("common.status")}: {t("common.all")}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {PROPERTY_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-44">
            <option value="all">{t("common.type")}: {t("common.all")}</option>
            {TYPE_OPTIONS.map((ty) => (
              <option key={ty} value={ty}>
                {PROPERTY_TYPE_CONFIG[ty][lang === "ru" ? "label_ru" : "label_en"]}
              </option>
            ))}
          </Select>
        </div>
        <span className="hidden shrink-0 text-sm text-muted-foreground lg:block">{filtered.length}</span>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-80 animate-pulse" />
          ))}
        </div>
      ) : properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("properties.emptyTitle")}
          description={t("properties.emptySubtitle")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={tryCreate}
              >
                <Plus className="h-4 w-4" />
                {t("properties.addProperty")}
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
            hasFilters && (
              <Button
                variant="outline"
                onClick={() => {
                  setQ("");
                  setStatus("all");
                  setType("all");
                }}
              >
                {t("common.clearFilters")}
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onEdit={() => {
                setEditing(p);
                setDialogOpen(true);
              }}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <PropertyFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} property={editing} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        description={deleting?.name}
      />

      <UpsellDialog open={upsellOpen} onClose={() => setUpsellOpen(false)} feature={t("upsell.features.properties")} />

      {/* Подтверждение импорта с количеством найденных объектов */}
      <ConfirmDialog
        open={!!pendingImport}
        onClose={() => setPendingImport(null)}
        onConfirm={runImport}
        loading={importing}
        title={t("properties.confirmImportTitle")}
        description={t("properties.confirmImportDesc").replace("{n}", pendingImport?.length || 0)}
        confirmLabel={t("properties.importCsv")}
      />
    </div>
  );
}
