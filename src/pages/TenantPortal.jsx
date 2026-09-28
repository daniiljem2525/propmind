import { useState } from "react";
import { Building2, MessageSquarePlus, Wrench } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import ImageUpload from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { Property, MaintenanceRequest, Payment } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";
import { MAINTENANCE_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from "@/lib/config/statuses";

// Портал жильца: свои заявки, проблема в один клик, свои платежи
export default function TenantPortal() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const { data: requests } = useCollection(MaintenanceRequest);
  const { data: payments } = useCollection(Payment);
  const { data: properties } = useCollection(Property);

  const myRequests = (requests || []).filter((r) => r.created_by === user.id);
  const myPayments = (payments || []).filter((p) => p.tenant_id === user.id);
  const myProps = (properties || []).filter((p) => p.tenant_id === user.id);
  const myProp = myProps[0];
  const debt = myPayments
    .filter((p) => p.status === "pending" || p.status === "overdue")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!myProp) return toast.error(t("portal.noProperty"));
    if (!description.trim()) return toast.error(t("portal.needDescription"));
    setSaving(true);
    try {
      await MaintenanceRequest.create({
        property_id: myProp.id,
        property_name: myProp.name,
        created_by: user.id,
        created_by_name: user.full_name,
        title: title.trim() || t("portal.defaultTitle"),
        description: description.trim(),
        urgency,
        photo_url: photo,
        source: "tenant_portal",
        status: "new",
      });
      toast.success(t("portal.created"));
      setOpen(false);
      setTitle("");
      setDescription("");
      setPhoto("");
      setUrgency("medium");
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("portal.tenantTitle")}
        subtitle={t("portal.tenantSubtitle")}
        actions={
          myProp && (
            <Button onClick={() => setOpen(true)}>
              <MessageSquarePlus className="h-4 w-4" />
              {t("portal.newRequest")}
            </Button>
          )
        }
      />

      {/* Сводка */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} tile="bg-teal-500" label={t("land.mockProps")} value={myProps.length} />
        <StatCard icon={Wrench} tile="bg-amber-500" label={t("portal.myRequests")} value={myRequests.filter((r) => r.status !== "closed" && r.status !== "cancelled").length} />
        <StatCard icon={Wrench} tile="bg-rose-500" label={t("dashboard.statOverdue")} value={debt > 0 ? formatMoney(debt, "RUB", lang) : "0"} />
      </div>

      {/* Мои заявки */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("portal.myRequestsTitle")}</CardTitle>
          <CardDescription>{t("portal.myRequestsSub")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {myRequests.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("portal.noRequests")}</p>
          )}
          {myRequests.map((r) => (
            <div key={r.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title || r.description?.slice(0, 50)}</p>
                <p className="truncate text-xs text-muted-foreground">{r.property_name}</p>
              </div>
              <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Мои платежи */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("portal.myPayments")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {myPayments.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
          )}
          {myPayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.due_date}</p>
                <p className="truncate text-xs text-muted-foreground">{p.property_name}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold">{formatMoney(p.amount, p.currency, lang)}</span>
              <StatusBadge config={PAYMENT_STATUS_CONFIG} value={p.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Диалог новой заявки */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("portal.newRequestTitle")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="tenant-request" loading={saving}>{t("common.send")}</Button>
          </>
        }
      >
        <form id="tenant-request" onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {myProp?.name}
          </div>
          <Field label={t("portal.requestTitle")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("portal.requestTitlePh")} />
          </Field>
          <Field label={t("portal.requestDesc")} required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={t("portal.requestDescPh")} autoFocus />
          </Field>
          <Field label={t("maintenance.urgency")}>
            <Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              <option value="low">{t("portal.urgencyLow")}</option>
              <option value="medium">{t("portal.urgencyMedium")}</option>
              <option value="high">{t("portal.urgencyHigh")}</option>
              <option value="emergency">{t("portal.urgencyEmergency")}</option>
            </Select>
          </Field>
          <Field label={t("maintenance.photo")}>
            <ImageUpload value={photo} onChange={setPhoto} label={t("maintenance.photo")} />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
