import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  CalendarClock,
  Download,
  Mail,
  MessageSquarePlus,
  Phone,
  Wrench,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import RequestDetails from "@/components/RequestDetails";
import EmptyState from "@/components/EmptyState";
import ImageUpload from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCollection } from "@/hooks/useCollection";
import { Property, MaintenanceRequest, Payment, Document, getLandlordContact, claimInvite } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/toast";
import { requestActionError } from "@/lib/services";
import { formatDate, formatMoney, monthLong } from "@/lib/utils";
import {
  CATEGORY_CONFIG,
  DOC_TYPE_CONFIG,
  MAINTENANCE_STATUS_CONFIG,
  PAYMENT_STATUS_CONFIG,
  PROPERTY_STATUS_CONFIG,
  URGENCY_CONFIG,
} from "@/lib/config/statuses";

// Портал жильца: мой дом, заявки, платежи и документы — всё о его квартире.
// Жилец видит все заявки по своей квартире (в т.ч. созданные владельцем)
// и контакт арендодателя.
export default function TenantPortal() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const { data: requests, refresh } = useCollection(MaintenanceRequest);
  const { data: payments } = useCollection(Payment);
  const { data: properties } = useCollection(Property);
  const { data: documents } = useCollection(Document);

  const myRequests = (requests || []).filter(
    (r) => r.created_by === user.id || r.tenant_id === user.id
  );
  const activeRequests = myRequests.filter(
    (r) => !["closed", "cancelled"].includes(r.status)
  );
  const myPayments = (payments || []).filter((p) => p.tenant_id === user.id);
  const myProps = (properties || []).filter((p) => p.tenant_id === user.id);
  const myProp = myProps[0];
  const debt = myPayments
    .filter((p) => p.status === "pending" || p.status === "overdue")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const nextPayment = myPayments
    .filter((p) => p.status === "pending")
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))[0];
  const myDocuments = useMemo(
    () => (documents || []).filter((d) => !myProp || d.property_id === myProp.id),
    [documents, myProp]
  );

  // Контакт арендодателя: по квартире, без квартиры — по приглашению
  const [landlord, setLandlord] = useState(null);
  useEffect(() => {
    let alive = true;
    getLandlordContact(myProp?.id || null, user.id)
      .then((p) => alive && setLandlord(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [myProp?.id, user.id]);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [urgency, setUrgency] = useState("medium");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailsFor, setDetailsFor] = useState(null);
  const [cancelling, setCancelling] = useState(null);

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
        tenant_id: user.id,
        tenant_name: user.full_name,
        title: title.trim() || t("portal.defaultTitle"),
        description: description.trim(),
        category,
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
      setCategory("other");
      setUrgency("medium");
      refresh();
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const cancelRequest = async () => {
    if (!cancelling) return;
    try {
      const res = await MaintenanceRequest.cancel(cancelling.id);
      if (res.ok === false) {
        toast.error(requestActionError(res, t));
        return;
      }
      toast.success(t("maint.cancelledToast"));
      refresh();
    } catch {
      toast.error(t("req.err.generic"));
    } finally {
      setCancelling(null);
    }
  };

  // Просрочки сверху, затем ожидающие, затем история
  const sortedPayments = useMemo(() => {
    const rank = (s) => (s === "overdue" ? 0 : s === "pending" ? 1 : s === "partial" ? 2 : 3);
    return [...myPayments].sort((a, b) => {
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return (b.due_date || "").localeCompare(a.due_date || "");
    });
  }, [myPayments]);

  // Подключение к арендодателю по его персональному коду
  const [code, setCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const connect = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setConnecting(true);
    try {
      const res = await claimInvite(c);
      if (res.ok === false) {
        toast.error(res.error === "not_supported" ? t("portal.connectLocal") : t("portal.connectError"));
        return;
      }
      toast.success(t("portal.connectedToast"));
      setCode("");
      getLandlordContact(null, user.id)
        .then((p) => setLandlord(p))
        .catch(() => {});
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setConnecting(false);
    }
  };

  if (!myProp) {
    const connected = !!landlord;
    return (
      <div className="animate-fade-in">
        <PageHeader title={t("portal.tenantTitle")} subtitle={t("portal.tenantSubtitle")} />
        <EmptyState
          icon={Building2}
          title={t("portal.tenantTitle")}
          description={t("portal.noProperty")}
        />

        {/* Подключение к арендодателю по коду */}
        <Card className="mx-auto mt-6 max-w-xl">
          <CardHeader>
            <CardTitle>{t("portal.connectTitle")}</CardTitle>
            <CardDescription>{t("portal.connectDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {connected ? (
              <div className="rounded-md bg-emerald-50 p-4 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {t("portal.connected")}
                </p>
                <p className="mt-1 text-sm">
                  {landlord.full_name || "—"}
                  {landlord.email && <span className="text-muted-foreground"> · {landlord.email}</span>}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{t("portal.waitProperty")}</p>
              </div>
            ) : (
              <form onSubmit={connect} className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="AB12CD34"
                  className="flex-1 uppercase"
                />
                <Button type="submit" loading={connecting} className="shrink-0">
                  {t("portal.connectBtn")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("portal.tenantTitle")}
        subtitle={t("portal.tenantSubtitle")}
        actions={
          <Button onClick={() => setOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
            {t("portal.newRequest")}
          </Button>
        }
      />

      {/* Мой дом: объект, договор и контакт арендодателя */}
      <Card className="mt-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {myProp.photo_url && (
            <img
              src={myProp.photo_url}
              alt=""
              className="h-44 w-full object-cover sm:h-auto sm:w-60"
              onError={(e) => e.currentTarget.remove()}
            />
          )}
          <div className="min-w-0 flex-1 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-tight">{myProp.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{myProp.address}</p>
              </div>
              <StatusBadge config={PROPERTY_STATUS_CONFIG} value={myProp.status} />
            </div>

            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {myProp.lease_end && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  {t("portal.leaseUntil")}:{" "}
                  <span className="font-medium text-foreground">{formatDate(myProp.lease_end, lang)}</span>
                </p>
              )}
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Banknote className="h-4 w-4 shrink-0" />
                {t("portal.rentAmount")}:{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(myProp.rent_amount, myProp.currency || "RUB", lang)}
                </span>
              </p>
            </div>

            {landlord && (
              <div className="mt-4 rounded-md bg-muted/50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("portal.landlord")}
                </p>
                <p className="mt-1 text-sm font-medium">{landlord.full_name || "—"}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {landlord.phone && (
                    <a
                      href={`tel:${String(landlord.phone).replace(/[^+\d]/g, "")}`}
                      className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {landlord.phone}
                    </a>
                  )}
                  {landlord.email && (
                    <a
                      href={`mailto:${landlord.email}`}
                      className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {landlord.email}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Сводка */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Wrench} tile="bg-amber-500" label={t("portal.myRequests")} value={activeRequests.length} />
        <StatCard
          icon={Banknote}
          tile="bg-rose-500"
          label={t("dashboard.statOverdue")}
          value={debt > 0 ? formatMoney(debt, "RUB", lang) : "0"}
        />
        <StatCard
          icon={CalendarClock}
          tile="bg-teal-500"
          label={t("portal.nextPayment")}
          value={nextPayment?.due_date ? formatDate(nextPayment.due_date, lang) : "—"}
        />
      </div>

      {/* Заявки */}
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("portal.myRequestsTitle")}</CardTitle>
            <CardDescription>{t("portal.myRequestsSub")}</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
            {t("portal.newRequest")}
          </Button>
        </CardHeader>
        <CardContent className="divide-y">
          {myRequests.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("portal.noRequests")}</p>
          )}
          {myRequests.map((r) => (
            <div
              key={r.id}
              className="flex cursor-pointer items-start gap-3 py-3 transition-colors hover:bg-muted/40"
              onClick={() => setDetailsFor(r)}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title || r.description?.slice(0, 50)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.property_name}
                  {r.contractor_name && ` · ${r.contractor_name}`}
                </p>
              </div>
              {r.status === "new" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-rose-600"
                  title={t("maintenance.cancelRequest")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCancelling(r);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
                <StatusBadge config={URGENCY_CONFIG} value={r.urgency} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Платежи */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("portal.myPayments")}</CardTitle>
          <CardDescription>{t("portal.paymentsSub")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {sortedPayments.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
          )}
          {sortedPayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {p.period_month
                    ? `${monthLong(p.period_month - 1, lang)} ${p.period_year}`
                    : formatDate(p.due_date, lang)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t("portal.dueUntil")}: {formatDate(p.due_date, lang)}
                </p>
              </div>
              <span className={`shrink-0 text-sm font-semibold ${p.status === "overdue" ? "text-rose-600 dark:text-rose-400" : ""}`}>
                {formatMoney(p.amount, p.currency || "RUB", lang)}
              </span>
              <StatusBadge config={PAYMENT_STATUS_CONFIG} value={p.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Документы */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("portal.documents")}</CardTitle>
          <CardDescription>{t("portal.documentsSub")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {myDocuments.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("portal.noDocuments")}</p>
          )}
          {myDocuments.map((d) => {
            const cfg = DOC_TYPE_CONFIG[d.type] || DOC_TYPE_CONFIG.other;
            const Icon = cfg.icon;
            return (
              <div key={d.id} className="flex items-center gap-3 py-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.tile || "bg-slate-500"} text-white`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lang === "ru" ? cfg.label_ru : cfg.label_en}
                    {d.created_date && ` · ${formatDate(d.created_date, lang)}`}
                  </p>
                </div>
                {d.file_url && (
                  <a href={d.file_url} download={d.file_name || d.name} className="shrink-0">
                    <Button size="sm" variant="outline">
                      <Download className="h-3.5 w-3.5" />
                      {t("portal.download")}
                    </Button>
                  </a>
                )}
              </div>
            );
          })}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("req.category")}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.keys(CATEGORY_CONFIG).map((c) => (
                  <option key={c} value={c}>
                    {lang === "ru" ? CATEGORY_CONFIG[c].label_ru : CATEGORY_CONFIG[c].label_en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("maintenance.urgency")}>
              <Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                {Object.keys(URGENCY_CONFIG).map((u) => (
                  <option key={u} value={u}>
                    {URGENCY_CONFIG[u][lang === "ru" ? "label_ru" : "label_en"]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("maintenance.photo")}>
            <ImageUpload value={photo} onChange={setPhoto} label={t("maintenance.photo")} />
          </Field>
        </form>
      </Dialog>

      <RequestDetails request={detailsFor} open={!!detailsFor} onClose={() => setDetailsFor(null)} />

      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={cancelRequest}
        title={t("maint.cancelTitle")}
        description={cancelling?.title || cancelling?.description?.slice(0, 60)}
        confirmLabel={t("maintenance.cancelRequest")}
      />
    </div>
  );
}
