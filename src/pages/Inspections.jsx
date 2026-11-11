import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardCheck,
  CircleSlash,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  WifiOff,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { useNewParam } from "@/hooks/useNewParam";
import { useDemoExitGate } from "@/hooks/useDemoExitGate";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { isDemoSeen } from "@/lib/demo";
import {
  Inspection,
  Property,
  NotificationEntity,
  onInspectionsSynced,
  inspectionsPendingCount,
} from "@/lib/api/entities";
import { pushNotification } from "@/lib/services";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/toast";
import {
  CHECKLIST_ITEM_STATUS_CONFIG,
  INSPECTION_STATUS_CONFIG,
  INSPECTION_TYPE_CONFIG,
} from "@/lib/config/statuses";
import { formatDate, uid } from "@/lib/utils";

const STATUS_OPTIONS = ["planned", "done", "cancelled"];
const TYPE_OPTIONS = Object.keys(INSPECTION_TYPE_CONFIG);

// Пункты нового осмотра — шаблон по типу (передаются ключом i18n с "|",
// в чек-листе хранятся готовые строки, как в плане тарифов)
function templateItems(type, t) {
  const key = {
    acceptance: "inspections.tplAcceptance",
    routine: "inspections.tplRoutine",
    move_out: "inspections.tplMoveOut",
  }[type];
  return (t(key) || "")
    .split("|")
    .filter(Boolean)
    .map((text) => ({ text, status: null, note: "" }));
}

const issueCount = (checklist) => (checklist || []).filter((i) => i.status === "issue").length;

// ——— Форма планирования/редактирования осмотра ———
function InspectionFormDialog({ open, onClose, editing, properties, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      editing
        ? {
            property_id: editing.property_id || "",
            property_name: editing.property_name || "",
            type: editing.type || "routine",
            scheduled_date: (editing.scheduled_date || "").slice(0, 10),
            notes: editing.notes || "",
          }
        : { property_id: "", type: "routine", scheduled_date: "", notes: "" }
    );
  }, [open, editing]);

  const setTypeAndTemplate = (type) => {
    setForm((f) => ({ ...f, type }));
    // Шаблон применяется только к новому осмотру без сохранённых пунктов
    if (!editing) setChecklist(templateItems(type, t));
  };

  const [checklist, setChecklist] = useState([]);
  useEffect(() => {
    if (open) setChecklist(editing ? [...(editing.checklist || [])] : templateItems(form.type || "routine", t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.property_id) {
      setError(t("inspections.errProperty"));
      return;
    }
    setSaving(true);
    try {
      const prop = properties.find((p) => p.id === form.property_id);
      const payload = {
        property_id: form.property_id,
        property_name: prop?.name || "",
        type: form.type,
        scheduled_date: form.scheduled_date || null,
        notes: form.notes || null,
        checklist,
      };
      if (editing) await Inspection.update(editing.id, payload);
      else await Inspection.create(payload);
      toast.success(editing ? t("common.saved") : t("inspections.created"));
      onSaved();
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
      title={editing ? t("inspections.editInspection") : t("inspections.addInspection")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button form="inspection-form" type="submit" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="inspection-form" onSubmit={submit} className="space-y-4">
        <Field label={t("inspections.property")} required>
          <Select
            value={form.property_id || ""}
            onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
          >
            <option value="">{t("inspections.selectProperty")}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("inspections.inspType")}>
            <Select value={form.type || "routine"} onChange={(e) => setTypeAndTemplate(e.target.value)}>
              {TYPE_OPTIONS.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`inspections.type_${ty}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("inspections.scheduledDate")}>
            <Input
              type="date"
              value={form.scheduled_date || ""}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
            />
          </Field>
        </div>
        <Field label={t("inspections.checklist")}>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={item.text}
                  onChange={(e) =>
                    setChecklist((rows) => rows.map((r, ri) => (ri === i ? { ...r, text: e.target.value } : r)))
                  }
                />
                <button
                  type="button"
                  className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setChecklist((rows) => rows.filter((_, ri) => ri !== i))}
                  title={t("common.delete")}
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChecklist((rows) => [...rows, { text: "", status: null, note: "" }])}
            >
              <Plus className="h-4 w-4" />
              {t("inspections.addItem")}
            </Button>
          </div>
        </Field>
        <Field label={t("inspections.notes")}>
          <Textarea
            rows={2}
            value={form.notes || ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder={t("inspections.notesPlaceholder")}
          />
        </Field>
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Dialog>
  );
}

// ——— Проведение осмотра: крупные тач-цели, работает офлайн ———
function RunDialog({ open, onClose, inspection, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && inspection) {
      setItems((inspection.checklist || []).map((i) => ({ ...i, status: i.status || null })));
      setNotes(inspection.notes || "");
    }
  }, [open, inspection]);

  const issues = items.filter((i) => i.status === "issue").length;

  const persist = async ({ complete = false } = {}) => {
    setSaving(true);
    try {
      const patch = {
        checklist: items,
        notes: notes || null,
        ...(complete
          ? { status: "done", completed_date: new Date().toISOString() }
          : {}),
      };
      await Inspection.update(inspection.id, patch);
      if (complete) {
        toast.success(
          issues > 0
            ? t("inspections.doneWithIssues").replace("{n}", issues)
            : t("inspections.doneClean")
        );
        if (issues > 0) {
          // Проблемы — в уведомления владельца: в облаке триггер notify_push
          // отправит push (пайплайн уже работает), локально — в список.
          pushNotification({
            type: "general",
            title: t("inspections.notifTitle"),
            message: `${inspection.property_name || ""}: ${t("inspections.notifIssues").replace("{n}", issues)}`,
            link: "/app/inspections",
            related_id: inspection.id,
          });
        }
      } else {
        toast.success(t("common.saved"));
      }
      onSaved();
      onClose();
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = (idx, status) =>
    setItems((rows) => rows.map((r, ri) => (ri === idx ? { ...r, status, note: status === "issue" ? r.note : "" } : r)));

  // Статические классы (Tailwind JIT не видит динамическую сборку имён)
  const ITEM_ACTIVE = {
    ok: "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    issue: "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
    skipped: "border-slate-400 bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("inspections.runTitle")}
      description={inspection?.property_name}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="outline" onClick={() => persist()} loading={saving}>
            {t("common.save")}
          </Button>
          <Button onClick={() => persist({ complete: true })} loading={saving}>
            <ClipboardCheck className="h-4 w-4" />
            {t("inspections.complete")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("inspections.runHint")}
        </p>
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border p-3">
            <p className="text-sm font-medium">{item.text}</p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {/* Крупные тач-цели: осмотр идёт с телефона, часто одной рукой */}
              {["ok", "issue", "skipped"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(idx, st)}
                  className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                    item.status === st ? ITEM_ACTIVE[st] : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {st === "ok" && <ClipboardCheck className="h-4 w-4" />}
                  {st === "issue" && <TriangleAlert className="h-4 w-4" />}
                  {st === "skipped" && <CircleSlash className="h-4 w-4" />}
                  {t(`inspections.item_${st}`)}
                </button>
              ))}
            </div>
            {item.status === "issue" && (
              <Textarea
                rows={2}
                className="mt-2"
                placeholder={t("inspections.itemNote")}
                value={item.note || ""}
                onChange={(e) =>
                  setItems((rows) => rows.map((r, ri) => (ri === idx ? { ...r, note: e.target.value } : r)))
                }
              />
            )}
          </div>
        ))}
        <Field label={t("inspections.notes")}>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("inspections.notesPlaceholder")}
          />
        </Field>
      </div>
    </Dialog>
  );
}

// ——— Страница инспекций ———
export default function Inspections() {
  const { t, lang } = useLang();
  const toast = useToast();
  const demo = useDemoSeed();
  const { user } = useAuth();
  const { data: inspections, loading, refresh } = useCollection(Inspection);
  const { data: properties } = useCollection(Property);
  const demoGate = useDemoExitGate();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [running, setRunning] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(inspectionsPendingCount());

  // Бухгалтеру мутации недоступны (матрица ролей — только финансы),
  // но инспекции у него и не видны; здесь команды — owner/admin/manager
  const canEdit = user?.role !== "accountant";

  const openCreate = () => demoGate.guarded(() => { setEditing(null); setDialogOpen(true); });
  useNewParam(openCreate);

  // Офлайн-синхронизация: бейдж несинхронизированных + перезагрузка после сброса
  useEffect(
    () =>
      onInspectionsSynced(() => {
        setPending(0);
        refresh();
        toast.success(t("inspections.synced"));
      }),
    [refresh, t, toast]
  );

  const reloadPending = () => setPending(inspectionsPendingCount());

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return inspections.filter((ins) => {
      const matchesQ =
        !query ||
        (ins.property_name || "").toLowerCase().includes(query) ||
        (ins.notes || "").toLowerCase().includes(query);
      return matchesQ && (status === "all" || ins.status === status);
    });
  }, [inspections, q, status]);

  const confirmCancel = async () => {
    if (!cancelling) return;
    await Inspection.update(cancelling.id, { status: "cancelled" });
    toast.success(t("inspections.cancelledDone"));
    setCancelling(null);
    reloadPending();
    refresh();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await Inspection.delete(deleting.id);
    toast.success(t("inspections.deleted"));
    setDeleting(null);
    reloadPending();
    refresh();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("inspections.title")}
        subtitle={t("inspections.subtitle")}
        actions={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t("inspections.addInspection")}
            </Button>
          ) : undefined
        }
      />

      {/* Офлайн-статус: осмотр идёт без сети, изменения уйдут в облако сами */}
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          {t("inspections.pendingBadge").replace("{n}", pending)}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.searchPlaceholder")} className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48">
          <option value="all">{t("common.status")}: {t("common.all")}</option>
          {STATUS_OPTIONS.map((st) => (
            <option key={st} value={st}>
              {t(`inspections.status_${st}`)}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-36 animate-pulse" />
          ))}
        </div>
      ) : inspections.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t("inspections.emptyTitle")}
          description={t("inspections.emptySubtitle")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {canEdit && (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  {t("inspections.addInspection")}
                </Button>
              )}
              {!isDemoSeen() && (
                <Button variant="outline" onClick={demo.run} loading={demo.loading}>
                  {t("common.demoData")}
                </Button>
              )}
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
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ins) => {
            const typeConf = INSPECTION_TYPE_CONFIG[ins.type] || INSPECTION_TYPE_CONFIG.routine;
            const TypeIcon = typeConf.icon;
            const list = ins.checklist || [];
            const okN = list.filter((i) => i.status === "ok").length;
            const issues = issueCount(list);
            return (
              <Card key={ins.id} className="group p-4 hover:shadow-card-hover">
                <div className="flex items-start gap-3">
                  <span className="brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white">
                    <TypeIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{ins.property_name || t("inspections.noProperty")}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge config={INSPECTION_STATUS_CONFIG} value={ins.status} />
                      <Badge className="bg-muted text-muted-foreground">{t(`inspections.type_${ins.type}`)}</Badge>
                    </div>
                  </div>
                  {canEdit && ins.status !== "done" && (
                    <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(ins); setDialogOpen(true); }} title={t("common.edit")}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        onClick={() => setDeleting(ins)}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  {ins.scheduled_date && (
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                      {formatDate(ins.scheduled_date, lang, { day: "numeric", month: "long" })}
                    </span>
                  )}
                </p>

                {list.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("inspections.progress").replace("{ok}", okN).replace("{total}", list.length)}</span>
                      {issues > 0 && (
                        <span className="flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          {t("inspections.issuesCount").replace("{n}", issues)}
                        </span>
                      )}
                    </div>
                    {/* Прогресс-бар осмотра: сколько пунктов пройдено */}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="brand-gradient h-full rounded-full transition-all"
                        style={{ width: `${Math.round((list.filter((i) => i.status).length / list.length) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {ins.status === "planned" && canEdit ? (
                  <Button className="mt-4 w-full" onClick={() => setRunning(ins)}>
                    <Play className="h-4 w-4" />
                    {t("inspections.run")}
                  </Button>
                ) : ins.status === "planned" ? (
                  <Button className="mt-4 w-full" variant="outline" disabled>
                    <Play className="h-4 w-4" />
                    {t("inspections.run")}
                  </Button>
                ) : (
                  <Button className="mt-4 w-full" variant="outline" onClick={() => setRunning(ins)}>
                    <ClipboardCheck className="h-4 w-4" />
                    {t("inspections.openChecklist")}
                  </Button>
                )}
                {canEdit && ins.status === "planned" && (
                  <Button className="mt-2 w-full" variant="ghost" onClick={() => setCancelling(ins)} title={t("inspections.cancelInspection")}>
                    <XCircle className="h-4 w-4" />
                    {t("inspections.cancelInspection")}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <InspectionFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        properties={properties}
        onSaved={() => {
          reloadPending();
          refresh();
        }}
      />

      <RunDialog
        open={!!running}
        onClose={() => setRunning(null)}
        inspection={running}
        onSaved={() => {
          reloadPending();
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
        title={t("inspections.cancelConfirmTitle")}
        description={t("inspections.cancelConfirmDesc")}
        confirmLabel={t("inspections.cancelInspection")}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("inspections.deleteConfirmTitle")}
        description={t("inspections.deleteConfirmDesc")}
        confirmLabel={t("common.delete")}
      />
    </div>
  );
}
