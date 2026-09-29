import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  UserPlus,
  Wrench,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import RequestDetails from "@/components/RequestDetails";
import ImageUpload from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { useNewParam } from "@/hooks/useNewParam";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { MaintenanceRequest, Property } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/toast";
import { requestActionError } from "@/lib/services";
import {
  CATEGORY_CONFIG,
  MAINTENANCE_STATUS_CONFIG,
  URGENCY_CONFIG,
} from "@/lib/config/statuses";
import { listProfiles } from "@/lib/supabase/entities";
import { MAINTENANCE_SOURCE_CONFIG } from "@/lib/config/misc";
import { formatDate, formatMoney } from "@/lib/utils";

const STATUS_OPTIONS = ["new", "assigned", "in_progress", "done", "closed", "cancelled"];
const URGENCY_OPTIONS = ["low", "medium", "high", "emergency"];
const CATEGORY_OPTIONS = Object.keys(CATEGORY_CONFIG);

// ——— Форма заявки: выбор объекта автозаполняет арендатора ———
// Статусы меняются только действиями (назначить/принять/отменить), не в форме.
function RequestFormDialog({ open, onClose, editing, properties }) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm({
        property_id: editing?.property_id || "",
        title: editing?.title || "",
        description: editing?.description || "",
        category: editing?.category || "other",
        urgency: editing?.urgency || "medium",
        photo_url: editing?.photo_url || "",
        scheduled_at: editing?.scheduled_at ? editing.scheduled_at.slice(0, 16) : "",
        estimate_cost: editing?.estimate_cost != null ? String(editing.estimate_cost) : "",
      });
    }
  }, [open, editing]);

  const onPropertyChange = (value) => {
    setForm((f) => ({ ...f, property_id: value }));
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
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        photo_url: form.photo_url || "",
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        estimate_cost: form.estimate_cost === "" ? null : Number(form.estimate_cost),
      };
      if (editing) {
        await MaintenanceRequest.update(editing.id, payload);
      } else {
        await MaintenanceRequest.create({
          ...payload,
          created_by: user.id,
          created_by_name: user.full_name,
          source: "manual",
          status: "new",
        });
      }
      toast.success(t("maintenance.saved"));
      onClose();
    } catch {
      toast.error(t("errors.generic"));
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

        {properties.find((p) => p.id === form.property_id)?.tenant_name && (
          <p className="flex items-center gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {t("payments.tenant")}:{" "}
            <span className="font-medium text-foreground">
              {properties.find((p) => p.id === form.property_id).tenant_name}
            </span>
          </p>
        )}

        <Field label={t("maintenance.titleField")}>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={lang === "ru" ? "Течёт труба под раковиной" : "Leaking pipe under the sink"} />
        </Field>

        <Field label={t("maintenance.description")} required>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} autoFocus={!form.property_id} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("req.category")}>
            <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {lang === "ru" ? CATEGORY_CONFIG[c].label_ru : CATEGORY_CONFIG[c].label_en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("maintenance.urgency")}>
            <Select value={form.urgency} onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}>
              {URGENCY_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {URGENCY_CONFIG[u][lang === "ru" ? "label_ru" : "label_en"]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t("maintenance.photo")}>
          <ImageUpload
            value={form.photo_url}
            onChange={(v) => setForm((f) => ({ ...f, photo_url: v }))}
            label={t("maintenance.photo")}
            onError={() => toast.error(t("documents.fileTooLarge"))}
          />
        </Field>

        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("maintenance.scheduleField")}>
              <Input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              />
            </Field>
            <Field label={t("maintenance.estimateField")}>
              <Input
                type="number"
                min="0"
                value={form.estimate_cost}
                onChange={(e) => setForm((f) => ({ ...f, estimate_cost: e.target.value }))}
                placeholder="0"
              />
            </Field>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
        )}
      </form>
    </Dialog>
  );
}

// ——— Назначение исполнителя через RPC assign_request ———
function AssignDialog({ request, onClose }) {
  const { t } = useLang();
  const toast = useToast();
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contractorId, setContractorId] = useState("");
  const [scheduled, setScheduled] = useState(request?.scheduled_at ? request.scheduled_at.slice(0, 16) : "");
  const [estimate, setEstimate] = useState(request?.estimate_cost != null ? String(request.estimate_cost) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    listProfiles("contractor")
      .then((rows) => alive && setContractors(rows || []))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    setContractorId("");
    setScheduled(request.scheduled_at ? request.scheduled_at.slice(0, 16) : "");
    setEstimate(request.estimate_cost != null ? String(request.estimate_cost) : "");
  }, [request]);

  const submit = async (e) => {
    e.preventDefault();
    if (!contractorId) return;
    setSaving(true);
    try {
      const c = contractors.find((x) => x.id === contractorId);
      const res = await MaintenanceRequest.assign(request.id, {
        contractor_id: contractorId,
        scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
        estimate_cost: estimate === "" ? null : Number(estimate),
      });
      if (res.ok === false) {
        toast.error(requestActionError(res, t));
        return;
      }
      toast.success(t("maint.assignedToast").replace("{name}", c?.full_name || ""));
      onClose(true);
    } catch {
      toast.error(t("req.err.generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!request}
      onClose={() => onClose(false)}
      title={t("maint.assignTitle")}
      description={request?.property_name}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="assign-form" loading={saving} disabled={loading || !contractorId}>
            {t("maint.assign")}
          </Button>
        </>
      }
    >
      <form id="assign-form" onSubmit={submit} className="space-y-4">
        <Field label={t("maintenance.assignedTo")} required>
          <Select value={contractorId} onChange={(e) => setContractorId(e.target.value)} disabled={loading}>
            <option value="">{loading ? "…" : "—"}</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("maintenance.scheduleField")}>
            <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
          <Field label={t("maintenance.estimateField")}>
            <Input type="number" min="0" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="0" />
          </Field>
        </div>
        {contractors.length === 0 && !loading && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            {t("maint.noContractors")}
          </p>
        )}
      </form>
    </Dialog>
  );
}

// ——— Отмена заявки с причиной ———
function CancelDialog({ request, onClose }) {
  const { t } = useLang();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (request) setReason("");
  }, [request]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await MaintenanceRequest.cancel(request.id, reason.trim() || null);
      if (res.ok === false) {
        toast.error(requestActionError(res, t));
        return;
      }
      toast.success(t("maint.cancelledToast"));
      onClose(true);
    } catch {
      toast.error(t("req.err.generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!request}
      onClose={() => onClose(false)}
      title={t("maint.cancelTitle")}
      description={request?.title || request?.description?.slice(0, 60)}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="cancel-form" variant="destructive" loading={saving}>
            {t("maintenance.cancelRequest")}
          </Button>
        </>
      }
    >
      <form id="cancel-form" onSubmit={submit}>
        <Field label={t("maint.cancelReason")}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

export default function Maintenance() {
  const { t, lang } = useLang();
  const toast = useToast();
  const demo = useDemoSeed();
  const { data: requests, loading, refresh } = useCollection(MaintenanceRequest);
  const { data: properties } = useCollection(Property);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [detailsFor, setDetailsFor] = useState(null);
  useNewParam(() => setDialogOpen(true));

  const doneRequests = useMemo(() => requests.filter((r) => r.status === "done"), [requests]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return requests.filter((r) => {
      const matchesQ =
        !query ||
        (r.title || "").toLowerCase().includes(query) ||
        (r.property_name || "").toLowerCase().includes(query) ||
        (r.description || "").toLowerCase().includes(query) ||
        (r.contractor_name || "").toLowerCase().includes(query);
      return (
        matchesQ &&
        (status === "all" || r.status === status) &&
        (urgency === "all" || r.urgency === urgency)
      );
    });
  }, [requests, q, status, urgency]);

  // Владелец принимает выполненную работу (RPC close_request)
  const acceptWork = async (r) => {
    try {
      const res = await MaintenanceRequest.close(r.id);
      if (res.ok === false) {
        toast.error(requestActionError(res, t));
        return;
      }
      toast.success(t("maint.acceptedWork"));
      refresh();
    } catch {
      toast.error(t("req.err.generic"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await MaintenanceRequest.delete(deleting.id);
    toast.success(t("maintenance.deleted"));
    setDeleting(null);
    refresh();
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
          {filtered.map((r) => {
            const categoryCfg = CATEGORY_CONFIG[r.category] || CATEGORY_CONFIG.other;
            const actionable = ["new", "assigned", "in_progress", "done"].includes(r.status);
            return (
              <Card key={r.id} className="flex flex-col cursor-pointer hover:shadow-card-hover" onClick={() => setDetailsFor(r)}>
                <div className="flex items-start justify-between gap-2 p-4 pb-0">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge config={URGENCY_CONFIG} value={r.urgency} />
                    <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(r);
                        setDialogOpen(true);
                      }}
                      title={t("common.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(r);
                      }}
                      className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      title={t("common.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 p-4">
                  <h3 className="font-semibold leading-snug">{r.title || r.description?.slice(0, 60)}</h3>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <categoryCfg.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{lang === "ru" ? categoryCfg.label_ru : categoryCfg.label_en}</span>
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{r.property_name}</span>
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
                    {r.contractor_name && (
                      <Badge className="bg-muted text-muted-foreground">
                        <Wrench className="h-3 w-3" />
                        {r.contractor_name}
                      </Badge>
                    )}
                    {r.scheduled_at && (
                      <Badge className="bg-muted text-muted-foreground">
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(r.scheduled_at, lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </Badge>
                    )}
                    {r.source === "tenant_portal" && r.tenant_name && (
                      <Badge className="bg-muted text-muted-foreground">
                        <User className="h-3 w-3" />
                        {r.tenant_name}
                      </Badge>
                    )}
                    <Badge className="bg-muted text-muted-foreground">
                      {MAINTENANCE_SOURCE_CONFIG[r.source]?.[lang === "ru" ? "label_ru" : "label_en"] || r.source}
                    </Badge>
                  </div>
                </div>

                {actionable && (
                  <div className="flex flex-wrap gap-2 border-t p-4 pt-3" onClick={(e) => e.stopPropagation()}>
                    {r.status === "new" && (
                      <Button size="sm" variant="outline" onClick={() => setAssignFor(r)}>
                        <UserPlus className="h-3.5 w-3.5" />
                        {t("maint.assign")}
                      </Button>
                    )}
                    {r.status === "done" && (
                      <Button size="sm" onClick={() => acceptWork(r)}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("maint.accept")}
                      </Button>
                    )}
                    {["new", "assigned", "in_progress"].includes(r.status) && (
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setCancelling(r)}>
                        <XCircle className="h-3.5 w-3.5" />
                        {t("maintenance.cancelRequest")}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Выполнена исполнителем → владелец принимает */}
      {doneRequests.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("maint.awaitingAccept")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {doneRequests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title || r.description?.slice(0, 50)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.property_name} · {r.contractor_name}
                    {r.work_cost != null && ` · ${formatMoney(r.work_cost, "RUB", lang)}`}
                  </p>
                  {r.work_notes && <p className="mt-1 text-xs text-muted-foreground">{r.work_notes}</p>}
                </div>
                <Button size="sm" onClick={() => acceptWork(r)}>{t("maint.accept")}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <RequestFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} properties={properties} />

      <AssignDialog
        request={assignFor}
        onClose={(changed) => {
          setAssignFor(null);
          if (changed) refresh();
        }}
      />

      <CancelDialog
        request={cancelling}
        onClose={(changed) => {
          setCancelling(null);
          if (changed) refresh();
        }}
      />

      <RequestDetails request={detailsFor} open={!!detailsFor} onClose={() => setDetailsFor(null)} />

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} description={deleting?.title || deleting?.description?.slice(0, 80)} />
    </div>
  );
}
