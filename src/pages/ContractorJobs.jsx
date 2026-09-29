import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  HardHat,
  MapPin,
  Wrench,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import RequestDetails from "@/components/RequestDetails";
import ImageUpload from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { MaintenanceRequest } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/toast";
import { requestActionError } from "@/lib/services";
import { formatDate, formatMoney } from "@/lib/utils";
import { MAINTENANCE_STATUS_CONFIG, URGENCY_CONFIG } from "@/lib/config/statuses";

// Портал исполнителя: назначенные работы, приём/отклонение, отчёт с фото и стоимостью.
// Все переходы — через RPC (accept/decline/report), уведомления рассылает БД.
export default function ContractorJobs() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const { data: requests, refresh } = useCollection(MaintenanceRequest);

  const mine = (requests || []).filter((r) => r.contractor_id === user.id);
  const active = mine.filter((r) => ["assigned", "in_progress"].includes(r.status));
  const finished = mine.filter((r) => ["done", "closed"].includes(r.status));
  const earned = mine
    .filter((r) => r.status === "closed")
    .reduce((s, r) => s + (Number(r.work_cost) || 0), 0);

  const [busy, setBusy] = useState(null);
  const [finishFor, setFinishFor] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [detailsFor, setDetailsFor] = useState(null);
  const [cost, setCost] = useState("");
  const [photo, setPhoto] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const runAction = async (id, key, fn, successTitle) => {
    setBusy(id + key);
    try {
      const res = await fn();
      if (res.ok === false) {
        toast.error(requestActionError(res, t));
        return;
      }
      if (successTitle) toast.success(successTitle);
      refresh();
    } catch {
      toast.error(t("req.err.generic"));
    } finally {
      setBusy(null);
    }
  };

  const accept = (r) =>
    runAction(r.id, "accept", () => MaintenanceRequest.accept(r.id), t("jobs.acceptedToast"));

  const decline = async () => {
    if (!declining) return;
    await runAction(declining.id, "decline", () => MaintenanceRequest.decline(declining.id), t("jobs.declinedToast"));
    setDeclining(null);
  };

  const finish = async (e) => {
    e.preventDefault();
    if (!finishFor) return;
    setSaving(true);
    try {
      const res = await MaintenanceRequest.report(finishFor.id, {
        work_cost: Number(cost) || 0,
        work_photo_url: photo,
        work_notes: notes,
      });
      if (res.ok === false) {
        toast.error(requestActionError(res, t));
        return;
      }
      toast.success(t("jobs.doneToast"));
      setFinishFor(null);
      setCost("");
      setPhoto("");
      setNotes("");
      refresh();
    } catch {
      toast.error(t("req.err.generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("jobs.title")} subtitle={t("jobs.subtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={HardHat} tile="bg-amber-500" label={t("jobs.active")} value={active.length} />
        <StatCard icon={CheckCircle2} tile="bg-emerald-500" label={t("jobs.finished")} value={finished.length} />
        <StatCard icon={Wrench} tile="bg-teal-500" label={t("jobs.earned")} value={formatMoney(earned, "RUB", lang)} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("jobs.activeTitle")}</CardTitle>
          <CardDescription>{t("jobs.activeSub")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {active.length === 0 && (
            <EmptyState icon={HardHat} title={t("jobs.empty")} description={t("jobs.emptySub")} />
          )}
          {active.map((r) => (
            <div
              key={r.id}
              className="cursor-pointer rounded-md border p-4 transition-colors hover:bg-muted/40"
              onClick={() => setDetailsFor(r)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.title || r.description?.slice(0, 60)}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {r.property_name} · {r.created_by_name}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <StatusBadge config={URGENCY_CONFIG} value={r.urgency} />
                  <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {r.scheduled_at && (
                  <Badge className="bg-muted text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {formatDate(r.scheduled_at, lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Badge>
                )}
                {r.estimate_cost != null && (
                  <Badge className="bg-muted text-muted-foreground">
                    {t("jobs.estimate")}: {formatMoney(r.estimate_cost, "RUB", lang)}
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                {r.status === "assigned" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => accept(r)}
                      loading={busy === r.id + "accept"}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t("jobs.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600"
                      onClick={() => setDeclining(r)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {t("jobs.decline")}
                    </Button>
                  </>
                )}
                {r.status === "in_progress" && (
                  <Button
                    size="sm"
                    variant="gradient"
                    onClick={() => {
                      setFinishFor(r);
                      setCost(r.estimate_cost != null ? String(r.estimate_cost) : "");
                      setPhoto("");
                      setNotes("");
                    }}
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    {t("jobs.finish")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {finished.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("jobs.finishedTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {finished.map((r) => (
              <div
                key={r.id}
                className="flex cursor-pointer items-center gap-3 py-3"
                onClick={() => setDetailsFor(r)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title || r.description?.slice(0, 50)}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.property_name}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {r.work_cost ? formatMoney(r.work_cost, "RUB", lang) : "—"}
                </span>
                <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Диалог сдачи работы */}
      <Dialog
        open={!!finishFor}
        onClose={() => setFinishFor(null)}
        title={t("jobs.finishTitle")}
        description={finishFor?.property_name}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFinishFor(null)}>{t("common.cancel")}</Button>
            <Button variant="gradient" onClick={finish} loading={saving}>{t("jobs.finish")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("jobs.workPhoto")} required>
            <ImageUpload value={photo} onChange={setPhoto} label={t("jobs.workPhoto")} onError={() => toast.error(t("documents.fileTooLarge"))} />
          </Field>
          <Field label={t("jobs.workCost")}>
            <Input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t("jobs.workNotes")}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </div>
      </Dialog>

      <RequestDetails request={detailsFor} open={!!detailsFor} onClose={() => setDetailsFor(null)} />

      <ConfirmDialog
        open={!!declining}
        onClose={() => setDeclining(null)}
        onConfirm={decline}
        title={t("jobs.decline")}
        description={t("jobs.declineConfirm")}
        confirmLabel={t("jobs.decline")}
      />
    </div>
  );
}
