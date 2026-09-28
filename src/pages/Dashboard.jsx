import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  Sparkles,
  User,
  Users,
  Wrench,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCollection } from "@/hooks/useCollection";
import { Property, Tenant, Payment, MaintenanceRequest } from "@/lib/api/entities";
import { useLang } from "@/lib/i18n/LangContext";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { useToast } from "@/components/ui/toast";
import { renewLease } from "@/lib/services";
import { PAYMENT_STATUS_CONFIG, MAINTENANCE_STATUS_CONFIG } from "@/lib/config/statuses";
import { daysUntil, formatDate, formatMoney, localeOf } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { t, lang } = useLang();
  const demo = useDemoSeed();
  const toast = useToast();
  const [renewingId, setRenewingId] = useState(null);

  const { data: properties } = useCollection(Property);
  const { data: tenants } = useCollection(Tenant);
  const { data: payments } = useCollection(Payment);
  const { data: requests } = useCollection(MaintenanceRequest);

  const dateStr = new Date().toLocaleDateString(localeOf(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const now = new Date();
  const monthIncome = payments
    .filter((p) => p.status === "paid" || p.status === "partial")
    .filter((p) => {
      const d = new Date(p.paid_date || p.due_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const activeTenants = tenants.filter((x) => x.status === "active").length;
  const overdueCount = payments.filter((p) => p.status === "overdue").length;
  const openRequests = requests.filter((r) => r.status === "new" || r.status === "in_progress").length;

  const recentPayments = payments.slice(0, 5);
  const recentRequests = requests.slice(0, 5);

  const expiring = properties
    .filter((p) => {
      const d = daysUntil(p.lease_end);
      return p.status === "rented" && d !== null && d >= 0 && d <= 60;
    })
    .sort((a, b) => (a.lease_end || "").localeCompare(b.lease_end || ""))
    .slice(0, 5);

  const isEmpty = properties.length === 0 && tenants.length === 0 && payments.length === 0 && requests.length === 0;

  const handleRenew = async (p) => {
    setRenewingId(p.id);
    try {
      const tenant = tenants.find((x) => x.id === p.tenant_id);
      const { newEnd, scheduled } = await renewLease(p, tenant);
      toast.success(
        tenant
          ? t("dashboard.renewed").replace("{date}", newEnd).replace("{n}", scheduled)
          : t("dashboard.renewedNoTenant").replace("{date}", newEnd)
      );
    } finally {
      setRenewingId(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("dashboard.title")} subtitle={dateStr} />

      {isEmpty && (
        <Card className="mb-6 overflow-hidden border-primary/30">
          <div className="brand-gradient flex flex-col items-start gap-4 p-6 text-white sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Sparkles className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">{t("dashboard.demoTitle")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/85">{t("dashboard.demoSubtitle")}</p>
            </div>
            <Button
              onClick={demo.run}
              loading={demo.loading}
              className="shrink-0 bg-white text-primary hover:bg-white/90"
            >
              <Sparkles className="h-4 w-4" />
              {t("dashboard.loadDemo")}
            </Button>
          </div>
        </Card>
      )}

      {!isEmpty && !(properties.length > 0 && tenants.length > 0 && payments.length > 0) && (
        <Card className="mb-6 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-bold">
                <Sparkles className="h-4 w-4 text-amber-500" />
                {t("onboarding.title")}
              </h3>
              <div className="mt-3 flex flex-col gap-2.5">
                {[
                  { done: properties.length > 0, label: t("onboarding.step1"), to: "/app/properties" },
                  { done: tenants.length > 0, label: t("onboarding.step2"), to: "/app/tenants" },
                  { done: payments.length > 0, label: t("onboarding.step3"), to: "/app/payments" },
                ].map((s) => (
                  <Link key={s.to} to={s.to} className="group flex items-center gap-2.5 text-sm">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        s.done ? "border-primary bg-primary" : "border-input group-hover:border-primary"
                      )}
                    >
                      {s.done && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                    </span>
                    <span className={cn(s.done ? "text-muted-foreground line-through" : "font-medium")}>
                      {s.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <Button variant="outline" onClick={demo.run} loading={demo.loading} className="shrink-0">
              <Sparkles className="h-4 w-4" />
              {t("common.demoData")}
            </Button>
          </div>
        </Card>
      )}

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Building2} tile="bg-teal-500" label={t("dashboard.statProperties")} value={properties.length} />
        <StatCard icon={Users} tile="bg-indigo-500" label={t("dashboard.statTenants")} value={activeTenants} />
        <StatCard icon={AlertCircle} tile="bg-rose-500" label={t("dashboard.statOverdue")} value={overdueCount} />
        <StatCard icon={Wrench} tile="bg-amber-500" label={t("dashboard.statRequests")} value={openRequests} />
        <StatCard
          icon={Banknote}
          tile="bg-emerald-500"
          label={t("dashboard.statIncome")}
          value={formatMoney(monthIncome, "RUB", lang)}
          sub={t("dashboard.inMonth")}
        />
      </div>

      {/* Последние платежи и заявки */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>{t("dashboard.recentPayments")}</CardTitle>
            </div>
            <Link to="/app/payments" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t("common.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="divide-y">
            {recentPayments.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
            )}
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.tenant_name || p.property_name || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.property_name}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{formatMoney(p.amount, p.currency, lang)}</span>
                <StatusBadge config={PAYMENT_STATUS_CONFIG} value={p.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>{t("dashboard.recentRequests")}</CardTitle>
            </div>
            <Link to="/app/maintenance" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t("common.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="divide-y">
            {recentRequests.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
            )}
            {recentRequests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title || r.description?.slice(0, 60)}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.property_name}</p>
                </div>
                <StatusBadge config={MAINTENANCE_STATUS_CONFIG} value={r.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Истекающие договоры */}
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-orange-500" />
            <div>
              <CardTitle>{t("dashboard.expiringLeases")}</CardTitle>
              <CardDescription className="mt-0.5">≤ 60 {t("common.days")}</CardDescription>
            </div>
          </div>
          <Link to="/app/properties" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {t("common.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="divide-y">
          {expiring.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.expiringEmpty")}</p>
          )}
          {expiring.map((p) => {
            const days = daysUntil(p.lease_end);
            return (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.tenant_name ? `${p.tenant_name} · ` : ""}
                    {formatDate(p.lease_end, lang)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  loading={renewingId === p.id}
                  onClick={() => handleRenew(p)}
                  title={t("dashboard.renew")}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("dashboard.renew")}</span>
                </Button>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                    days <= 14
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                      : days <= 30
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                      : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400"
                  )}
                >
                  {days} {t("common.days")}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
