import { useState } from "react";
import { CheckCircle2, HardHat, MapPin, Play, Wrench } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import ImageUpload from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { MaintenanceRequest } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/toast";
import { pushNotification } from "@/lib/services";
import { MAINTENANCE_STATUS_CONFIG, URGENCY_CONFIG } from "@/lib/config/statuses";

// Портал исполнителя: назначенные работы, приём, выполнение с фото и стоимостью
export default function ContractorJobs() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const { data: requests, refresh } = useCollection(MaintenanceRequest);

  const mine = (requests || []).filter((r) => r.contractor_id === user.id);
  const active = mine.filter((r) => ["assigned", "in_progress"].includes(r.status));
  const finished = mine.filter((r) => r.status === "done" || r.status === "closed");
  const earned = finished.reduce((s, r) => s + (Number(r.work_cost) || 0), 0);

  const [busy, setBusy] = useState(null);
  const [finishFor, setFinishFor] = useState(null);
  const [cost, setCost] = useState("");
  const [photo, setPhoto] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const update = async (id, patch, notif) => {
    setBusy(id + patch.status);
    try {
      await MaintenanceRequest.update(id, patch);
      if (notif) await pushNotification(notif);
      toast.success(notif ? notif.title : t("common.save"));
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const accept = (r) =>
    update(
      r.id,
      { status: "in_progress", contractor_status: "accepted", started_at: new Date().toISOString() },
      { type: "maintenance_updated", title: t("jobs.acceptedTitle"), message: `${r.title || ""} — ${user.full_name}`, link: "/app/maintenance", related_id: r.id }
    );

  const startWork = (r) =>
    update(
      r.id,
      { status: "in_progress", contractor_status: "in_progress" },
      { type: "maintenance_updated", title: t("jobs.startedTitle"), message: `${r.title || ""} — ${user.full_name}`, link: "/app/maintenance", related_id: r.id }
    );

  const finish = async () => {
    if (!finishFor) return;
    setSaving(true);
    try {
      await MaintenanceRequest.update(finishFor.id, {
        status: "done",
        contractor_status: "done",
        work_cost: Number(cost) || 0,
        work_photo_url: photo,
        work_notes: notes,
        completed_at: new Date().toISOString(),
      });
      await pushNotification({
        type: "maintenance_updated",
        title: t("jobs.doneTitle"),
        message: `${finishFor.title || ""} — ${formatMoney(Number(cost) || 0, "RUB", lang)}`,
        link: "/app/maintenance",
        related_id: finishFor.id,
      });
      toast.success(t("jobs.doneToast"));
      setFinishFor(null);
      setCost("");
      setPhoto("");
      setNotes("");
      refresh();
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
        <StatCard icon={Wrench} tile="bg-teal-500" label={t("jobs.earned")} value={`${earned.toLocaleString("ru-RU")} ₽`} />
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
            <div key={r.id} className="rounded-md border p-4">
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
              <div className="mt-3 flex gap-2">
                {r.status === "assigned" && (
                  <Button size="sm" onClick={() => accept(r)} loading={busy === r.id + "in_progress"}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("jobs.accept")}
                  </Button>
                )}
                {r.status === "in_progress" && (
                  <Button size="sm" variant="outline" onClick={() => startWork(r)} loading={busy === r.id + "in_progress2"}>
                    <Play className="h-3.5 w-3.5" />
                    {t("jobs.startedTitle")}
                  </Button>
                )}
                <Button size="sm" variant="gradient" onClick={() => { setFinishFor(r); setCost(""); setPhoto(""); setNotes(""); }}>
                  <Wrench className="h-3.5 w-3.5" />
                  {t("jobs.finish")}
                </Button>
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
              <div key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title || r.description?.slice(0, 50)}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.property_name}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {r.work_cost ? `${Number(r.work_cost).toLocaleString("ru-RU")} ₽` : "—"}
                </span>
                <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Диалог завершения работы */}
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
    </div>
  );
}
