import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Play, CheckCircle2, Search, Trash2, User, Wrench, Building2 } from "lucide-react";
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
import { MaintenanceRequest, Property } from "@/lib/api/entities";
import { pushNotification } from "@/lib/services";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { MAINTENANCE_STATUS_CONFIG, URGENCY_CONFIG } from "@/lib/config/statuses";
import { MAINTENANCE_SOURCE_CONFIG } from "@/lib/config/misc";
import { todayISO } from "@/lib/utils";

const STATUS_OPTIONS = ["new", "in_progress", "completed", "cancelled"];
const URGENCY_OPTIONS = ["low", "medium", "high", "emergency"];
const SOURCE_OPTIONS = ["manual", "ai_bot", "tenant_portal"];

// ——— Форма заявки: выбор объекта автозаполняет арендатора ———
function RequestFormDialog({ open, onClose, editing, properties }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm({
        property_id: editing?.property_id || "",
        tenant_id: editing?.tenant_id || "",
        tenant_name: editing?.tenant_name || "",
        title: editing?.title || "",
        description: editing?.description || "",
        urgency: editing?.urgency || "medium",
        status: editing?.status || "new",
        source: editing?.source || "manual",
        photo_url: editing?.photo_url || "",
        assigned_to: editing?.assigned_to || "",
        resolution_notes: editing?.resolution_notes || "",
        completed_date: editing?.completed_date || "",
      });
    }
  }, [open, editing]);

  const onPropertyChange = (value) => {
    const property = properties.find((p) => p.id === value);
    setForm((f) => ({
      ...f,
      property_id: value,
      tenant_id: property?.tenant_id || "",
      tenant_name: property?.tenant_name || "",
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.property_id || !form.description.trim()) return setError(t("maintenance.required"));
    setSaving(true);
    try {
      const property = properties.find((p) => p.id === form.property_id);
      const payload = {
        property_id: property.id,
        property_name: property.name,
        tenant_id: form.tenant_id || null,
        tenant_name: form.tenant_name || null,
        title: form.title.trim() || null,
        description: form.description.trim(),
        urgency: form.urgency,
        status: form.status,
        source: form.source,
        photo_url: form.photo_url || "",
        assigned_to: form.assigned_to || null,
        resolution_notes: form.resolution_notes || null,
        completed_date: form.status === "completed" ? form.completed_date || todayISO() : null,
      };
      if (editing) {
        await MaintenanceRequest.update(editing.id, payload);
      } else {
        await MaintenanceRequest.create(payload);
        pushNotification({
          type: "maintenance_new",
          title: "Новая заявка",
          message: `${payload.title || payload.description.slice(0, 50)} — ${property.name}`,
          link: "/app/maintenance",
        });
      }
      toast.success(t("maintenance.saved"));
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
      title={editing ? t("maintenance.editRequest") : t("maintenance.addRequest")}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="request-form" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="request-form" onSubmit={submit} className="space-y-4">
        <Field label={t("payments.property")} hint={t("maintenance.autofillHint")} required>
          <Select value={form.property_id} onChange={(e) => onPropertyChange(e.target.value)}>
            <option value="">—</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        {form.tenant_name && (
          <p className="flex items-center gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {t("payments.tenant")}: <span className="font-medium text-foreground">{form.tenant_name}</span>
          </p>
        )}

        <Field label={t("maintenance.titleField")}>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={lang === "ru" ? "Течёт труба под раковиной" : "Leaking pipe under the sink"} />
        </Field>

        <Field label={t("maintenance.description")} required>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} autoFocus={!form.property_id} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("maintenance.urgency")}>
            <Select value={form.urgency} onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}>
              {URGENCY_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {URGENCY_CONFIG[u][lang === "ru" ? "label_ru" : "label_en"]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.status")}>
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {MAINTENANCE_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t("maintenance.assignedTo")}>
          <Input value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} placeholder={lang === "ru" ? "Сантехник Пётр Смирнов" : "Plumber John Doe"} />
        </Field>

        <Field label={t("maintenance.photo")}>
          <ImageUpload
            value={form.photo_url}
            onChange={(v) => setForm((f) => ({ ...f, photo_url: v }))}
            label={t("maintenance.photo")}
            onError={() => toast.error(t("documents.fileTooLarge"))}
          />
        </Field>

        {editing && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("maintenance.source")}>
                <Select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {MAINTENANCE_SOURCE_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("maintenance.completedDate")}>
                <Input type="date" value={form.completed_date} onChange={(e) => setForm((f) => ({ ...f, completed_date: e.target.value }))} />
              </Field>
            </div>
            <Field label={t("maintenance.resolution")}>
              <Textarea value={form.resolution_notes} onChange={(e) => setForm((f) => ({ ...f, resolution_notes: e.target.value }))} rows={2} />
            </Field>
          </>
        )}

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
        )}
      </form>
    </Dialog>
  );
}

export default function Maintenance() {
  const { t, lang } = useLang();
  const toast = useToast();
  const demo = useDemoSeed();
  const { data: requests, loading } = useCollection(MaintenanceRequest);
  const { data: properties } = useCollection(Property);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  useNewParam(() => setDialogOpen(true));
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return requests.filter((r) => {
      const matchesQ =
        !query ||
        (r.title || "").toLowerCase().includes(query) ||
        (r.property_name || "").toLowerCase().includes(query) ||
        (r.description || "").toLowerCase().includes(query);
      return (
        matchesQ &&
        (status === "all" || r.status === status) &&
        (urgency === "all" || r.urgency === urgency)
      );
    });
  }, [requests, q, status, urgency]);

  const advance = async (r, nextStatus) => {
    await MaintenanceRequest.update(r.id, {
      status: nextStatus,
      completed_date: nextStatus === "completed" ? todayISO() : null,
    });
    if (nextStatus === "completed") {
      toast.success(t("maintenance.completedMsg"));
      pushNotification({
        type: "maintenance_updated",
        title: "Заявка завершена",
        message: `${r.title || r.description?.slice(0, 50)} — ${r.property_name}`,
        link: "/app/maintenance",
        related_id: r.id,
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await MaintenanceRequest.delete(deleting.id);
    toast.success(t("maintenance.deleted"));
    setDeleting(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("maintenance.title")}
        subtitle={t("maintenance.subtitle")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("maintenance.addRequest")}
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.searchPlaceholder")} className="pl-9" />
        </div>
        <div className="flex gap-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="flex-1 lg:w-44">
            <option value="all">{t("common.status")}: {t("common.all")}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {MAINTENANCE_STATUS_CONFIG[s][lang === "ru" ? "label_ru" : "label_en"]}
              </option>
            ))}
          </Select>
          <Select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="flex-1 lg:w-44">
            <option value="all">{t("maintenance.urgency")}: {t("common.all")}</option>
            {URGENCY_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {URGENCY_CONFIG[u][lang === "ru" ? "label_ru" : "label_en"]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t("maintenance.emptyTitle")}
          description={t("maintenance.emptySubtitle")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("maintenance.addRequest")}
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
                setUrgency("all");
              }}
            >
              {t("common.clearFilters")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <Card key={r.id} className="flex flex-col hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-2 p-4 pb-0">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge config={URGENCY_CONFIG} value={r.urgency} />
                  <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditing(r);
                      setDialogOpen(true);
                    }}
                    title={t("common.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleting(r)} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" title={t("common.delete")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 p-4">
                <h3 className="font-semibold leading-snug">{r.title || r.description?.slice(0, 60)}</h3>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{r.property_name}</span>
                  {r.tenant_name && <span className="shrink-0">· {r.tenant_name}</span>}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>

                {r.photo_url && (
                  <img
                    src={r.photo_url}
                    alt=""
                    className="mt-3 h-24 w-full rounded-md object-cover"
                    onError={(e) => e.currentTarget.remove()}
                  />
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.assigned_to && (
                    <Badge className="bg-muted text-muted-foreground">
                      <User className="h-3 w-3" />
                      {r.assigned_to}
                    </Badge>
                  )}
                  <Badge className="bg-muted text-muted-foreground">
                    {MAINTENANCE_SOURCE_CONFIG[r.source]?.[lang === "ru" ? "label_ru" : "label_en"] || r.source}
                  </Badge>
                </div>
              </div>

              {(r.status === "new" || r.status === "in_progress") && (
                <div className="flex gap-2 border-t p-4 pt-3">
                  {r.status === "new" && (
                    <Button size="sm" variant="outline" onClick={() => advance(r, "in_progress")}>
                      <Play className="h-3.5 w-3.5" />
                      {t("maintenance.start")}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => advance(r, "completed")}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("maintenance.complete")}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <RequestFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} properties={properties} />

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} description={deleting?.title || deleting?.description?.slice(0, 80)} />
    </div>
  );
}
